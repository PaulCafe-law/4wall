from __future__ import annotations

import sys
from dataclasses import replace
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np

from ocr_worker.adjudication import (
    ADJUDICATED_SOURCE,
    AdjudicationError,
    GptAdjudicator,
    sheet_identity,
)
from ocr_worker.config import GptConfig, load_config
from ocr_worker.main import HmiOcrRunner
from ocr_worker.ocr_engine import OcrTextLine
from ocr_worker.work_order import build_work_order_fields, stabilize_work_order

from test_work_order import REAL_LINES, _line, _quantity_grid


TAIPEI_NOON = datetime(2026, 7, 8, 12, 0, 0)


def _enabled_config(**overrides) -> GptConfig:
    defaults = dict(
        enabled=True,
        adjudication_enabled=True,
        adjudication_command=["unused-fake-bridge"],
        adjudication_timeout_sec=30.0,
        adjudication_daily_limit=20,
    )
    defaults.update(overrides)
    return GptConfig(**defaults)


def _overwritten_total_lines() -> list[OcrTextLine]:
    # 總計 cell carries two legible numbers: the operator overwrote 210 with
    # 240 without striking the old value through.
    return _quantity_grid({3: [_line("210", 0.93, 200, 295), _line("240", 0.91, 260, 295)]})


def _suspicious_sheet(history: dict) -> dict:
    return stabilize_work_order(build_work_order_fields(_overwritten_total_lines()), history)


class _RecordingInvoke:
    def __init__(self, response=None, error: str | None = None):
        self.response = response
        self.error = error
        self.calls: list[dict] = []

    def __call__(self, payload: dict) -> dict:
        self.calls.append(payload)
        if self.error is not None:
            raise AdjudicationError(self.error)
        return self.response


_GOOD_RESPONSE = {
    "quantities": {
        "total": {
            "left": {"value": 240, "overwritten": True, "oldValue": 210},
            "right": {"value": None, "overwritten": False, "oldValue": None},
        }
    },
    "confidence": 0.9,
}


# ---------------------------------------------------------------------------
# needs_adjudication detection
# ---------------------------------------------------------------------------


def test_multi_candidate_cell_triggers_needs_adjudication() -> None:
    sheet = _suspicious_sheet({})
    assert sheet["needsAdjudication"] is True
    trigger = next(t for t in sheet["adjudicationTriggers"] if t["reason"] == "multi_candidate")
    assert trigger["cell"] == "quantities.total.left"
    assert trigger["candidates"] == [210, 240]
    # The rule parser itself stays honest: unknown value, both numbers visible.
    leaf = sheet["quantities"]["total"]["left"]
    assert leaf["value"] == "unknown"
    assert leaf["candidates"] == [210, 240]


def test_clean_sheet_does_not_need_adjudication() -> None:
    history: dict = {}
    for _ in range(3):
        sheet = stabilize_work_order(build_work_order_fields(REAL_LINES), history)
    assert sheet["needsAdjudication"] is False
    assert "adjudicationTriggers" not in sheet


def test_flapping_consensus_triggers_after_three_disagreeing_frames() -> None:
    gm = REAL_LINES
    gh = [_line("GH096LC", 0.78, 464, 118) if line.text == "GM096LC" else line for line in REAL_LINES]
    history: dict = {}
    results = [stabilize_work_order(build_work_order_fields(f), history) for f in (gm, gh, gm, gh)]
    assert results[2]["needsAdjudication"] is False  # only two flips so far
    triggers = results[3]["adjudicationTriggers"]
    assert any(t["cell"] == "fields.moldNo" and t["reason"] == "consensus_flapping" for t in triggers)


def test_brief_glare_misread_does_not_count_as_flapping() -> None:
    # gm,gm,gh,gh,gm,gm: every disagreement run is broken by an agreeing frame,
    # so the sheet must not be escalated for a transient glare band.
    gm = REAL_LINES
    gh = [_line("GH096LC", 0.78, 464, 118) if line.text == "GM096LC" else line for line in REAL_LINES]
    history: dict = {}
    for frames in (gm, gm, gh, gh, gm, gm):
        result = stabilize_work_order(build_work_order_fields(frames), history)
    assert result["needsAdjudication"] is False


def test_low_confidence_key_cell_triggers_but_non_key_cell_does_not() -> None:
    shaky_machine = [
        _line("HC600", 0.4, 161, 113) if line.text == "HC600" else line for line in REAL_LINES
    ]
    sheet = stabilize_work_order(build_work_order_fields(shaky_machine), {})
    triggers = sheet["adjudicationTriggers"]
    assert any(t["cell"] == "fields.machineNo" and t["reason"] == "low_confidence" for t in triggers)

    # The same low confidence on a NON-key quantity row is not worth a GPT call.
    shaky_row3 = [
        _line("10", 0.4, line.box[0][0], line.box[0][1]) if line.text == "10" else line
        for line in REAL_LINES
    ]
    sheet = stabilize_work_order(build_work_order_fields(shaky_row3), {})
    assert not any(t["reason"] == "low_confidence" for t in sheet.get("adjudicationTriggers", []))


def test_sheet_identity_uses_locked_machine_and_mold() -> None:
    history: dict = {}
    stabilize_work_order(build_work_order_fields(REAL_LINES), history)
    sheet = stabilize_work_order(build_work_order_fields(REAL_LINES), history)
    assert sheet_identity(sheet) == "HC600|GM096LC"


# ---------------------------------------------------------------------------
# Adjudication merge + honesty markers
# ---------------------------------------------------------------------------


def test_adjudicated_value_merges_with_source_marker_and_old_value() -> None:
    history: dict = {}
    sheet = _suspicious_sheet(history)
    invoke = _RecordingInvoke(response=_GOOD_RESPONSE)
    adjudicator = GptAdjudicator(_enabled_config(), invoke=invoke, now=lambda: TAIPEI_NOON)

    sheet = adjudicator.adjudicate(sheet, history, lambda: Path("fake-crop.jpg"))

    leaf = sheet["quantities"]["total"]["left"]
    assert leaf["value"] == 240
    assert leaf["source"] == ADJUDICATED_SOURCE
    assert leaf["overwritten"] is True
    assert leaf["oldValue"] == 210
    assert leaf["confidence"] == 0.9
    assert sheet["adjudication"]["status"] == "ok"
    assert sheet["adjudication"]["at"].startswith("2026-07-08T12:00:00")
    assert sheet["adjudication"]["overwrittenCells"] == ["quantities.total.left"]
    assert sheet["needsReview"] is False
    # The bridge payload carried the image and the parser's own suspicion context.
    payload = invoke.calls[0]
    assert payload["imagePath"].endswith("fake-crop.jpg")
    assert payload["triggers"][0]["candidates"] == [210, 240]
    assert payload["rowLabels"]["total"] == "總計"


def test_adjudicated_lock_is_not_republished_without_matching_current_evidence() -> None:
    history: dict = {}
    sheet = _suspicious_sheet(history)
    adjudicator = GptAdjudicator(
        _enabled_config(), invoke=_RecordingInvoke(response=_GOOD_RESPONSE), now=lambda: TAIPEI_NOON
    )
    adjudicator.adjudicate(sheet, history, lambda: Path("fake-crop.jpg"))

    # Next frame still shows both numbers. The historical adjudication remains
    # internal, but cannot masquerade as a numeric read from this frame.
    later = stabilize_work_order(build_work_order_fields(_overwritten_total_lines()), history)
    leaf = later["quantities"]["total"]["left"]
    assert leaf["value"] == "unknown"
    assert "source" not in leaf


def test_rule_parsed_cells_never_carry_adjudication_marker() -> None:
    history: dict = {}
    sheet = _suspicious_sheet(history)
    adjudicator = GptAdjudicator(
        _enabled_config(), invoke=_RecordingInvoke(response=_GOOD_RESPONSE), now=lambda: TAIPEI_NOON
    )
    sheet = adjudicator.adjudicate(sheet, history, lambda: Path("fake-crop.jpg"))
    # Only the adjudicated cell is tagged; every other leaf stays unmarked.
    for key, row in sheet["quantities"].items():
        for side in ("left", "right"):
            if (key, side) == ("total", "left"):
                continue
            assert "source" not in row[side], (key, side)
    for leaf in sheet["fields"].values():
        assert "source" not in leaf


def test_null_value_cells_stay_unknown_and_flag_needs_review() -> None:
    history: dict = {}
    sheet = _suspicious_sheet(history)
    response = {
        "quantities": {"total": {"left": {"value": None, "overwritten": False, "oldValue": None}}},
        "confidence": 0.4,
    }
    adjudicator = GptAdjudicator(
        _enabled_config(), invoke=_RecordingInvoke(response=response), now=lambda: TAIPEI_NOON
    )
    sheet = adjudicator.adjudicate(sheet, history, lambda: Path("fake-crop.jpg"))
    assert sheet["adjudication"]["status"] == "ok"
    assert sheet["quantities"]["total"]["left"]["value"] == "unknown"
    assert "source" not in sheet["quantities"]["total"]["left"]
    # GPT could not read it either -> platform must show 待確認.
    assert sheet["needsReview"] is True
    assert sheet["adjudication"]["unresolvedCells"] == ["quantities.total.left"]


# ---------------------------------------------------------------------------
# Cache, daily budget, failure fallback
# ---------------------------------------------------------------------------


def test_same_sheet_identity_is_adjudicated_only_once() -> None:
    invoke = _RecordingInvoke(response=_GOOD_RESPONSE)
    adjudicator = GptAdjudicator(_enabled_config(), invoke=invoke, now=lambda: TAIPEI_NOON)
    history: dict = {}

    first = adjudicator.adjudicate(_suspicious_sheet(history), history, lambda: Path("crop-1.jpg"))
    second = adjudicator.adjudicate(_suspicious_sheet(history), history, lambda: Path("crop-2.jpg"))

    assert len(invoke.calls) == 1
    assert first["adjudication"]["status"] == "ok"
    assert second["adjudication"]["status"] == "cached"
    # The cached merge still applies the adjudicated value because this frame
    # independently contains 240 among its OCR candidates.
    assert second["quantities"]["total"]["left"]["value"] == 240
    assert second["quantities"]["total"]["left"]["source"] == ADJUDICATED_SOURCE


def test_cached_adjudication_requires_value_evidence_in_current_frame() -> None:
    invoke = _RecordingInvoke(response=_GOOD_RESPONSE)
    adjudicator = GptAdjudicator(_enabled_config(), invoke=invoke, now=lambda: TAIPEI_NOON)
    history: dict = {}
    adjudicator.adjudicate(_suspicious_sheet(history), history, lambda: Path("crop-1.jpg"))
    changed = _quantity_grid({3: [_line("210", 0.93, 200, 295), _line("260", 0.91, 260, 295)]})

    second = adjudicator.adjudicate(
        stabilize_work_order(build_work_order_fields(changed), history),
        history,
        lambda: Path("crop-2.jpg"),
    )

    assert len(invoke.calls) == 1
    assert second["adjudication"]["status"] == "cached"
    assert second["quantities"]["total"]["left"]["value"] == "unknown"
    assert second["needsReview"] is True


def test_failed_adjudication_keeps_drop_behavior_and_is_not_cached() -> None:
    invoke = _RecordingInvoke(error="gpt_adjudication_timeout")
    adjudicator = GptAdjudicator(_enabled_config(), invoke=invoke, now=lambda: TAIPEI_NOON)
    history: dict = {}

    sheet = adjudicator.adjudicate(_suspicious_sheet(history), history, lambda: Path("crop.jpg"))
    assert sheet["adjudication"]["status"] == "failed"
    assert "gpt_adjudication_timeout" in sheet["adjudication"]["error"]
    assert sheet["needsReview"] is True
    assert sheet["quantities"]["total"]["left"]["value"] == "unknown"
    assert "source" not in sheet["quantities"]["total"]["left"]

    # Failures are not cached: the next suspicious frame retries the bridge.
    adjudicator.adjudicate(_suspicious_sheet(history), history, lambda: Path("crop.jpg"))
    assert len(invoke.calls) == 2


def test_malformed_bridge_reply_falls_back_to_needs_review() -> None:
    invoke = _RecordingInvoke(response={"summary": "not an adjudication"})
    adjudicator = GptAdjudicator(_enabled_config(), invoke=invoke, now=lambda: TAIPEI_NOON)
    history: dict = {}
    sheet = adjudicator.adjudicate(_suspicious_sheet(history), history, lambda: Path("crop.jpg"))
    assert sheet["adjudication"]["status"] == "failed"
    assert sheet["adjudication"]["error"] == "gpt_adjudication_bad_response"
    assert sheet["needsReview"] is True


def test_daily_limit_blocks_further_calls_until_next_day() -> None:
    clock = {"now": TAIPEI_NOON}
    invoke = _RecordingInvoke(error="boom")  # failures still consume budget
    adjudicator = GptAdjudicator(
        _enabled_config(adjudication_daily_limit=2), invoke=invoke, now=lambda: clock["now"]
    )
    history: dict = {}

    statuses = [
        adjudicator.adjudicate(_suspicious_sheet(history), history, lambda: Path("c.jpg"))["adjudication"]["status"]
        for _ in range(3)
    ]
    assert statuses == ["failed", "failed", "rate_limited"]
    assert len(invoke.calls) == 2

    clock["now"] = TAIPEI_NOON + timedelta(days=1)
    sheet = adjudicator.adjudicate(_suspicious_sheet(history), history, lambda: Path("c.jpg"))
    assert sheet["adjudication"]["status"] == "failed"  # budget reset, bridge retried
    assert len(invoke.calls) == 3


def test_disabled_adjudication_marks_needs_review_without_touching_disk() -> None:
    supplier_calls: list[int] = []

    def supplier() -> Path:
        supplier_calls.append(1)
        return Path("never.jpg")

    adjudicator = GptAdjudicator(GptConfig(), now=lambda: TAIPEI_NOON)  # defaults: disabled
    history: dict = {}
    sheet = adjudicator.adjudicate(_suspicious_sheet(history), history, supplier)
    assert sheet["adjudication"]["status"] == "disabled"
    assert sheet["needsReview"] is True
    assert supplier_calls == []


# ---------------------------------------------------------------------------
# Bridge subprocess path + config parsing
# ---------------------------------------------------------------------------

_ECHO_BRIDGE = (
    "import json,sys;"
    "p=json.load(sys.stdin);"
    "assert p['imagePath'] and p['rowLabels'];"
    "print(json.dumps({'quantities':{'total':{'left':{'value':240,'overwritten':True,'oldValue':210}}},"
    "'confidence':0.88}))"
)


def test_invoke_bridge_runs_configured_command_over_stdin_stdout(tmp_path: Path) -> None:
    config = _enabled_config(adjudication_command=[sys.executable, "-c", _ECHO_BRIDGE])
    adjudicator = GptAdjudicator(config, now=lambda: TAIPEI_NOON)
    history: dict = {}
    sheet = adjudicator.adjudicate(_suspicious_sheet(history), history, lambda: tmp_path / "crop.jpg")
    assert sheet["adjudication"]["status"] == "ok"
    leaf = sheet["quantities"]["total"]["left"]
    assert leaf["value"] == 240
    assert leaf["source"] == ADJUDICATED_SOURCE
    assert leaf["confidence"] == 0.88


def test_gpt_adjudication_config_parses(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        "\n".join(
            [
                "platform:",
                "  enabled: false",
                "hmi:",
                "  camera_label: test",
                "  detector_name: test",
                "  roi: [0, 0, 0, 0]",
                "  fields: []",
                "gpt:",
                "  enabled: true",
                "  adjudication_enabled: true",
                "  adjudication_command:",
                "    - ./.venv/bin/python",
                "    - scripts/codex_adjudicate_bridge.py",
                "  adjudication_timeout_sec: 90",
                "  adjudication_daily_limit: 5",
                "debug:",
                "  runtime_dir: runtime",
            ]
        ),
        encoding="utf-8",
    )
    gpt = load_config(config_path).gpt
    assert gpt.adjudication_enabled is True
    assert gpt.adjudication_command == ["./.venv/bin/python", "scripts/codex_adjudicate_bridge.py"]
    assert gpt.adjudication_timeout_sec == 90.0
    assert gpt.adjudication_daily_limit == 5


# ---------------------------------------------------------------------------
# Runner wiring
# ---------------------------------------------------------------------------

_RUNNER_CONFIG = "\n".join(
    [
        "frame_source:",
        "  mode: file",
        "  path: unused.jpg",
        "platform:",
        "  enabled: false",
        "ocr:",
        "  device: cpu",
        "hmi:",
        "  camera_label: test-camera",
        "  detector_name: test_detector",
        "  roi: [0, 0, 0, 0]",
        "  fields: []",
        "work_order:",
        "  enabled: true",
        "  roi: [0, 0, 0, 0]",
        "gpt:",
        "  enabled: false",
        "debug:",
        "  runtime_dir: runtime",
        "  save_crops: false",
    ]
)


class _AmbiguousSheetEngine:
    """Returns the overwritten-total sheet lines for the work-order crop."""

    def recognize(self, image):
        height, width = image.shape[:2]
        if width >= 600:
            return _overwritten_total_lines()
        return []


def test_runner_flags_needs_review_when_adjudication_disabled(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    config_path.write_text(_RUNNER_CONFIG, encoding="utf-8")
    runner = HmiOcrRunner(load_config(config_path), publish=False, engine=_AmbiguousSheetEngine())

    frame = np.zeros((377, 619, 3), dtype=np.uint8)
    sheet = runner.process_frame(frame, frame_name="test")["ocrObservation"]["structuredFields"]["workOrder"]

    assert sheet["needsAdjudication"] is True
    assert sheet["adjudication"]["status"] == "disabled"
    assert sheet["needsReview"] is True
    assert sheet["quantities"]["total"]["left"]["value"] == "unknown"


def test_runner_saves_crop_and_merges_adjudicated_value(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    config_path.write_text(_RUNNER_CONFIG, encoding="utf-8")
    config = load_config(config_path)
    runner = HmiOcrRunner(config, publish=False, engine=_AmbiguousSheetEngine())
    invoke = _RecordingInvoke(response=_GOOD_RESPONSE)
    runner.adjudicator = GptAdjudicator(
        replace(config.gpt, adjudication_enabled=True, adjudication_command=["fake-bridge"]),
        invoke=invoke,
        now=lambda: TAIPEI_NOON,
    )

    frame = np.zeros((377, 619, 3), dtype=np.uint8)
    sheet = runner.process_frame(frame, frame_name="test")["ocrObservation"]["structuredFields"]["workOrder"]

    leaf = sheet["quantities"]["total"]["left"]
    assert leaf["value"] == 240
    assert leaf["source"] == ADJUDICATED_SOURCE
    assert sheet["adjudication"]["status"] == "ok"
    # The crop image really was written for `codex exec -i` before the call.
    saved = list((tmp_path / "runtime" / "adjudication").glob("*.jpg"))
    assert len(saved) == 1
    assert invoke.calls[0]["imagePath"] == str(saved[0])

    # Second frame: same sheet identity -> cached, no extra bridge call, and
    # no second crop written.
    runner.process_frame(frame, frame_name="test")
    assert len(invoke.calls) == 1
    assert len(list((tmp_path / "runtime" / "adjudication").glob("*.jpg"))) == 1
