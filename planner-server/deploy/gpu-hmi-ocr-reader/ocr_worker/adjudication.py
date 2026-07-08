"""GPT adjudication channel for ambiguous handwritten dispatch-sheet cells.

Operators sometimes correct a quantity by writing the new number directly on
top of the old one WITHOUT striking the old value through. Per-frame OCR then
sees two digit groups in one cell and the rule parser honestly degrades to
unknown forever. This module escalates exactly those sheets to the local
Codex/GPT bridge with the work-order crop image attached, asks it to read the
topmost (newest) stroke, and merges the answer back into the cross-frame
stabilizer as a lock.

Honesty iron rule: every adjudicated value is tagged ``source:
"gpt_adjudicated"`` (plus ``overwritten``/``oldValue`` when applicable) on both
the published leaf and the stabilizer lock, so it can never masquerade as a
rule-parsed value. When adjudication fails, times out, is rate limited, or is
disabled, the current drop-to-unknown behavior stands and the sheet is marked
``needsReview: true`` for the platform to surface as 待確認.

Cost controls: results are cached per sheet identity (machineNo + moldNo) so
the same sheet is never adjudicated twice, and bridge invocations are capped
per Taipei calendar day.
"""
from __future__ import annotations

import json
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any, Callable
from zoneinfo import ZoneInfo

from .config import GptConfig
from .summarizer import _command_env
from .work_order import QUANTITY_ROW_SCHEMA, UNKNOWN, WorkOrderHistory


TAIPEI = ZoneInfo("Asia/Taipei")

ADJUDICATED_SOURCE = "gpt_adjudicated"

_QUANTITY_SIDES = ("left", "right")


class AdjudicationError(RuntimeError):
    """Bridge invocation failed (missing command, non-zero exit, timeout, garbage)."""


def sheet_identity(sheet: dict[str, Any]) -> str:
    """Cache key: one physical paper == one machineNo+moldNo pair.

    Unknown components stay in the key on purpose: a half-identified sheet is
    still ONE sheet, and re-adjudicating it every frame would burn the daily
    budget without new information.
    """
    fields = sheet.get("fields", {})
    machine = fields.get("machineNo", {}).get("value", UNKNOWN)
    mold = fields.get("moldNo", {}).get("value", UNKNOWN)
    return f"{machine}|{mold}"


class GptAdjudicator:
    def __init__(
        self,
        config: GptConfig,
        *,
        invoke: Callable[[dict[str, Any]], Any] | None = None,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        self.config = config
        self._invoke = invoke or self._invoke_bridge
        self._now = now or (lambda: datetime.now(TAIPEI))
        self._cache: dict[str, dict[str, Any]] = {}
        self._calls_date: str | None = None
        self._calls_today = 0

    def adjudicate(
        self,
        sheet: dict[str, Any],
        history: WorkOrderHistory,
        image_path_supplier: Callable[[], Path | str],
    ) -> dict[str, Any]:
        """Run the adjudication channel for a stabilized sheet flagged suspicious.

        Mutates ``sheet`` (adjudication block, needsReview, adjudicated leaves)
        and ``history`` (adjudicated locks); returns ``sheet``.

        ``image_path_supplier`` is only called when a bridge invocation will
        actually happen, so cached / disabled / rate-limited paths never write
        a crop image to disk.
        """
        at = self._now().isoformat(timespec="seconds")
        cached = self._cache.get(sheet_identity(sheet))
        if cached is not None:
            return _merge(sheet, history, cached, at, status="cached")
        if not (self.config.adjudication_enabled and self.config.adjudication_command):
            return _mark_unresolved(sheet, at, status="disabled", error="gpt_adjudication_disabled")
        if not self._take_daily_slot():
            return _mark_unresolved(sheet, at, status="rate_limited", error="gpt_adjudication_daily_limit")
        try:
            image_path = Path(image_path_supplier())
            response = self._invoke(_bridge_payload(self.config, sheet, image_path))
        except Exception as exc:  # noqa: BLE001 - adjudication must never kill the frame loop
            return _mark_unresolved(sheet, at, status="failed", error=f"{type(exc).__name__}:{exc}"[:1000])
        normalized = _validate_response(response)
        if normalized is None:
            return _mark_unresolved(sheet, at, status="failed", error="gpt_adjudication_bad_response")
        self._cache[sheet_identity(sheet)] = normalized
        return _merge(sheet, history, normalized, at, status="ok")

    def _take_daily_slot(self) -> bool:
        """Count every bridge invocation attempt (successful or not) against the
        per-day budget; failures must not be free or a broken bridge would retry
        every frame all day on the personal Codex account."""
        today = self._now().date().isoformat()
        if today != self._calls_date:
            self._calls_date = today
            self._calls_today = 0
        if self._calls_today >= self.config.adjudication_daily_limit:
            return False
        self._calls_today += 1
        return True

    def _invoke_bridge(self, payload: dict[str, Any]) -> Any:
        command = [part.replace("{model}", self.config.summary_model) for part in self.config.adjudication_command]
        try:
            completed = subprocess.run(
                command,
                input=json.dumps(payload, ensure_ascii=False),
                capture_output=True,
                text=True,
                timeout=self.config.adjudication_timeout_sec,
                check=False,
                encoding="utf-8",
                env=_command_env(self.config),
            )
        except FileNotFoundError as exc:
            raise AdjudicationError(f"gpt_adjudication_command_not_found:{exc.filename}") from exc
        except subprocess.TimeoutExpired as exc:
            raise AdjudicationError("gpt_adjudication_timeout") from exc
        stdout = (completed.stdout or "").strip()
        if completed.returncode != 0:
            stderr = (completed.stderr or "").strip()
            raise AdjudicationError((stderr or f"gpt_adjudication_exit_{completed.returncode}")[:1000])
        if not stdout:
            raise AdjudicationError("gpt_adjudication_empty_output")
        try:
            return json.loads(stdout)
        except json.JSONDecodeError as exc:
            raise AdjudicationError("gpt_adjudication_invalid_json") from exc


def _bridge_payload(config: GptConfig, sheet: dict[str, Any], image_path: Path) -> dict[str, Any]:
    return {
        "model": config.summary_model,
        "imagePath": str(image_path),
        "template": sheet.get("template", ""),
        "identity": {
            "machineNo": sheet["fields"]["machineNo"]["value"],
            "moldNo": sheet["fields"]["moldNo"]["value"],
        },
        "rowLabels": dict(QUANTITY_ROW_SCHEMA),
        "triggers": sheet.get("adjudicationTriggers", []),
    }


def _validate_response(response: Any) -> dict[str, Any] | None:
    """Normalize the bridge reply; None when it is not trustworthy at all.

    Only schema-known rows/sides with an integer value survive. A response with
    zero readable cells is still VALID (GPT could not read the sheet either) —
    it is cached so the same unreadable sheet does not re-consume budget, and
    the triggered cells stay unknown + needsReview.
    """
    if not isinstance(response, dict):
        return None
    quantities = response.get("quantities")
    confidence = response.get("confidence")
    if not isinstance(quantities, dict) or isinstance(confidence, bool) or not isinstance(confidence, (int, float)):
        return None
    normalized_rows: dict[str, dict[str, dict[str, Any]]] = {}
    for key, _label in QUANTITY_ROW_SCHEMA:
        row = quantities.get(key)
        if not isinstance(row, dict):
            continue
        normalized_row: dict[str, dict[str, Any]] = {}
        for side in _QUANTITY_SIDES:
            cell = row.get(side)
            if not isinstance(cell, dict):
                continue
            value = _as_int(cell.get("value"))
            if value is None:
                continue
            normalized_row[side] = {
                "value": value,
                "overwritten": cell.get("overwritten") is True,
                "oldValue": _as_int(cell.get("oldValue")),
            }
        if normalized_row:
            normalized_rows[key] = normalized_row
    return {"quantities": normalized_rows, "confidence": max(0.0, min(1.0, float(confidence)))}


def _as_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return None


def _merge(
    sheet: dict[str, Any],
    history: WorkOrderHistory,
    response: dict[str, Any],
    at: str,
    *,
    status: str,
) -> dict[str, Any]:
    confidence = round(float(response["confidence"]), 3)
    overwritten_cells: list[str] = []
    for key, row in response["quantities"].items():
        for side, cell in row.items():
            path = f"quantities.{key}.{side}"
            leaf = sheet["quantities"][key][side]
            leaf["value"] = cell["value"]
            leaf["confidence"] = confidence
            leaf["source"] = ADJUDICATED_SOURCE
            leaf.pop("consensusPending", None)
            leaf.pop("held", None)
            locked: dict[str, Any] = {
                "value": cell["value"],
                "confidence": confidence,
                # Keep the frame's raw window text (e.g. "30 40"): the evidence
                # that this cell held two numbers stays visible downstream.
                "rawText": leaf.get("rawText", ""),
                "source": ADJUDICATED_SOURCE,
            }
            if cell["overwritten"]:
                locked["overwritten"] = True
                locked["oldValue"] = cell["oldValue"]
                leaf["overwritten"] = True
                leaf["oldValue"] = cell["oldValue"]
                overwritten_cells.append(path)
            entry = history.setdefault(path, {"last": None, "streak": 0, "locked": None, "flips": 0})
            entry["locked"] = locked
            entry["last"] = None
            entry["streak"] = 0
            entry["flips"] = 0
    unresolved = [
        trigger["cell"]
        for trigger in sheet.get("adjudicationTriggers", [])
        if _cell_value(sheet, trigger["cell"]) == UNKNOWN
    ]
    sheet["adjudication"] = {"status": status, "at": at, "overwrittenCells": overwritten_cells}
    if unresolved:
        sheet["adjudication"]["unresolvedCells"] = unresolved
    sheet["needsReview"] = bool(unresolved)
    return sheet


def _mark_unresolved(sheet: dict[str, Any], at: str, *, status: str, error: str) -> dict[str, Any]:
    sheet["adjudication"] = {"status": status, "at": at, "overwrittenCells": [], "error": error}
    sheet["needsReview"] = True
    return sheet


def _cell_value(sheet: dict[str, Any], path: str) -> Any:
    parts = path.split(".")
    node: Any = sheet
    for part in parts:
        if not isinstance(node, dict) or part not in node:
            return UNKNOWN
        node = node[part]
    return node.get("value", UNKNOWN) if isinstance(node, dict) else UNKNOWN
