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

    codex_cli = Path(args.codex_cli or os.environ.get("CODEX_CLI") or DEFAULT_CODEX_CLI).expanduser()
    node = Path(args.node or os.environ.get("CODEX_NODE") or DEFAULT_NODE).expanduser()
    if not codex_cli.exists():
        print(json.dumps({"summary": "unknown", "error": f"codex_cli_missing:{codex_cli}"}), flush=True)
        return 2
    if not node.exists():
        print(json.dumps({"summary": "unknown", "error": f"node_missing:{node}"}), flush=True)
        return 2

    prompt = _build_prompt(payload)
    with tempfile.TemporaryDirectory(prefix="fourwall-codex-summary-") as tmp:
        out_path = Path(tmp) / "last-message.json"
        command = [
            str(node),
            str(codex_cli),
            "exec",
            "--skip-git-repo-check",
            "--sandbox",
            "read-only",
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
    return (
        "你是工廠監視器 OCR 摘要器。只輸出 JSON，不要 Markdown。\n"
        "任務：根據 HC600 HMI OCR 與派工單 OCR，產生管理平台可讀摘要。\n"
        "規則：\n"
        "1. 不可發明 OCR 沒有的數字。\n"
        "2. structuredFields 裡已經是 unknown 的欄位不可改寫成確定值。\n"
        "3. 派工單被遮住或 OCR 信心低時，把該欄位設 unknown。\n"
        "4. summary 用繁體中文，短而可執行。\n"
        "5. 所有人類可讀中文一律使用台灣繁體中文 zh-Hant-TW，不可輸出簡體中文。\n"
        "6. 回傳 schema 必須是："
        "{\"summary\":\"string\",\"machine\":\"string|unknown\",\"screenMode\":\"temperature_monitor|machine_monitor|unknown\","
        "\"workOrder\":{\"raw\":\"string\",\"inferred\":\"string|unknown\",\"blockedBy\":\"string|unknown\"},"
        "\"keyValues\":{},\"uncertain\":[]}。\n"
        "輸入 JSON：\n"
        f"{json.dumps(payload, ensure_ascii=False)}"
    )


def _parse_json_message(message: str) -> dict[str, Any]:
    try:
        parsed = json.loads(message)
        return parsed if isinstance(parsed, dict) else {"summary": parsed}
    except json.JSONDecodeError:
        pass

    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", message, flags=re.DOTALL)
    if fenced:
        try:
            parsed = json.loads(fenced.group(1))
            return parsed if isinstance(parsed, dict) else {"summary": parsed}
        except json.JSONDecodeError:
            pass

    inline = re.search(r"(\{.*\})", message, flags=re.DOTALL)
    if inline:
        try:
            parsed = json.loads(inline.group(1))
            return parsed if isinstance(parsed, dict) else {"summary": parsed}
        except json.JSONDecodeError:
            pass

    return {"summary": message[:4000]}


def _codex_env() -> dict[str, str]:
    env = os.environ.copy()
    node_bin = str(DEFAULT_NODE.parent)
    env["PATH"] = f"{node_bin}:{env.get('PATH', '')}"
    return env


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Summarize HMI OCR through locally authenticated Codex OAuth")
    parser.add_argument("--model", default="latest")
    parser.add_argument("--timeout-sec", type=float, default=120)
    parser.add_argument("--codex-cli", default="")
    parser.add_argument("--node", default="")
    return parser.parse_args(argv)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
