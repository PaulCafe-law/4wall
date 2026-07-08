"""Adjudicate an ambiguous handwritten dispatch sheet through the local Codex CLI.

Companion to codex_summary_bridge.py, with one crucial difference: the work
order crop image is attached to the request via `codex exec -i <image>` so the
model reads the actual handwriting instead of the (already-failed) OCR text.

stdin:  JSON payload from ocr_worker.adjudication.GptAdjudicator, including
        "imagePath" plus identity / trigger context.
stdout: JSON {"quantities": {...}, "confidence": 0..1} (best effort re-parsed
        from the model output).

Kept standalone (no imports from codex_summary_bridge) so a single-file scp to
nckusoc can never break on a missing sibling module.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any


DEFAULT_CODEX_CLI = Path.home() / ".local/codex-cli/node_modules/@openai/codex/bin/codex.js"
DEFAULT_NODE = Path.home() / ".local/opt/node-v22/bin/node"


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    payload = json.load(sys.stdin)
    model = str(args.model or payload.get("model") or "latest")

    image_path = Path(str(payload.get("imagePath", "")))
    if not str(payload.get("imagePath", "")) or not image_path.exists():
        print(json.dumps({"error": f"image_missing:{image_path}"}), flush=True)
        return 2

    codex_cli = Path(args.codex_cli or os.environ.get("CODEX_CLI") or DEFAULT_CODEX_CLI).expanduser()
    node = Path(args.node or os.environ.get("CODEX_NODE") or DEFAULT_NODE).expanduser()
    if not codex_cli.exists():
        print(json.dumps({"error": f"codex_cli_missing:{codex_cli}"}), flush=True)
        return 2
    if not node.exists():
        print(json.dumps({"error": f"node_missing:{node}"}), flush=True)
        return 2

    prompt = _build_prompt(payload)
    with tempfile.TemporaryDirectory(prefix="fourwall-codex-adjudicate-") as tmp:
        out_path = Path(tmp) / "last-message.json"
        command = [
            str(node),
            str(codex_cli),
            "exec",
            "--skip-git-repo-check",
            "--sandbox",
            "read-only",
            "-i",
            str(image_path),
            "-o",
            str(out_path),
        ]
        if model and model != "latest":
            command.extend(["--model", model])
        command.append(prompt)

        completed = subprocess.run(
            command,
            cwd=tmp,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=float(args.timeout_sec),
            check=False,
            env=_codex_env(),
        )
        if completed.returncode != 0:
            sys.stderr.write((completed.stderr or completed.stdout)[-4000:])
            return completed.returncode
        message = out_path.read_text(encoding="utf-8").strip()

    print(json.dumps(_parse_json_message(message), ensure_ascii=False), flush=True)
    return 0


def _build_prompt(payload: dict[str, Any]) -> str:
    context = {
        "identity": payload.get("identity", {}),
        "rowLabels": payload.get("rowLabels", {}),
        "triggers": payload.get("triggers", []),
    }
    return (
        "你是手寫派工單仲裁員。附圖是 HC600 派工單的相機裁切照片。只輸出 JSON，不要 Markdown。\n"
        "背景：工人有時直接在數量格覆寫新數字、不劃掉舊值，所以同一格可能疊著或並列兩個數字。\n"
        "任務：判讀四個數量列（左欄=L、右欄=R）的每一格，一律以最上層/最新的筆跡為準。\n"
        "回傳 schema 必須是：\n"
        "{\"quantities\":{"
        "\"plannedWithHanger\":{\"left\":{\"value\":int|null,\"overwritten\":bool,\"oldValue\":int|null},\"right\":{...同左}},"
        "\"plannedScheduledNoHanger\":{...同上},\"plannedNoHanger\":{...同上},\"total\":{...同上}},"
        "\"confidence\":0到1的數字}\n"
        "規則：\n"
        "1. 看不清楚或空白的格子 value 填 null，不可猜。\n"
        "2. 某格有被覆寫的舊數字時 overwritten 填 true，oldValue 填可辨識的舊數字（辨識不出就 null）。\n"
        "3. 沒被覆寫的格子 overwritten 填 false、oldValue 填 null。\n"
        "4. 只回傳上述 schema，不要多餘欄位。\n"
        "列名對照：plannedWithHanger=預計生產數（有掛）、plannedScheduledNoHanger=預計生產數（有排程、無掛）、"
        "plannedNoHanger=預計生產數（無掛）、total=總計。\n"
        "背景資訊（規則解析器目前的讀值與可疑原因，僅供參考，不可照抄）：\n"
        f"{json.dumps(context, ensure_ascii=False)}"
    )


def _parse_json_message(message: str) -> dict[str, Any]:
    try:
        parsed = json.loads(message)
        return parsed if isinstance(parsed, dict) else {"error": "non_object_reply"}
    except json.JSONDecodeError:
        pass

    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", message, flags=re.DOTALL)
    if fenced:
        try:
            parsed = json.loads(fenced.group(1))
            return parsed if isinstance(parsed, dict) else {"error": "non_object_reply"}
        except json.JSONDecodeError:
            pass

    inline = re.search(r"(\{.*\})", message, flags=re.DOTALL)
    if inline:
        try:
            parsed = json.loads(inline.group(1))
            return parsed if isinstance(parsed, dict) else {"error": "non_object_reply"}
        except json.JSONDecodeError:
            pass

    return {"error": "unparseable_reply", "raw": message[:4000]}


def _codex_env() -> dict[str, str]:
    env = os.environ.copy()
    node_bin = str(DEFAULT_NODE.parent)
    env["PATH"] = f"{node_bin}:{env.get('PATH', '')}"
    return env


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Adjudicate overwritten dispatch-sheet numbers through locally authenticated Codex OAuth"
    )
    parser.add_argument("--model", default="latest")
    parser.add_argument("--timeout-sec", type=float, default=120)
    parser.add_argument("--codex-cli", default="")
    parser.add_argument("--node", default="")
    return parser.parse_args(argv)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
