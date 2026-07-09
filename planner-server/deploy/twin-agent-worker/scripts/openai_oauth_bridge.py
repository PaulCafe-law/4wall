from __future__ import annotations

import argparse
import json
import os
import re
import shutil
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
    prompt = str(payload.get("prompt") or "")

    command_prefix, node_bin, error = _resolve_codex_command(args)
    if command_prefix is None:
        print(json.dumps({"text": "", "toolCalls": [], "error": error}), flush=True)
        return 2

    with tempfile.TemporaryDirectory(prefix="fourwall-twin-agent-") as tmp:
        out_path = Path(tmp) / "last-message.json"
        command = [
            *command_prefix,
            "exec",
            "--skip-git-repo-check",
            # Answer as a plain completion: skip the operator's global Codex config
            # (MCP servers, skills, execpolicy rules) so Codex does not boot into
            # coding-agent mode and treat the factory prompt as a repo task. OAuth
            # auth still resolves from CODEX_HOME.
            "--ignore-user-config",
            "--ignore-rules",
            # Booth answers must land inside the job-claim TTL; low effort keeps the
            # single-turn factory Q&A well under the bridge timeout (~5s vs >120s).
            "-c",
            f"model_reasoning_effort={args.reasoning_effort}",
            "--sandbox",
            "read-only",
            "-o",
            str(out_path),
        ]
        if model and model != "latest":
            command.extend(["--model", model])
        # Feed the prompt through stdin ("-"), not as an argv element. On Windows the
        # codex launcher is a .CMD shim, and a multi-line argv gets truncated at the
        # first newline there — Codex would then only see the persona line and reply
        # with a generic "understood, I'll act as..." instead of answering the job.
        command.append("-")

        completed = subprocess.run(
            command,
            cwd=tmp,
            input=prompt,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            timeout=float(args.timeout_sec),
            check=False,
            env=_codex_env(node_bin),
        )
        if completed.returncode != 0:
            sys.stderr.write((completed.stderr or completed.stdout)[-4000:])
            return completed.returncode
        message = out_path.read_text(encoding="utf-8").strip()

    print(json.dumps(_parse_json_message(message), ensure_ascii=False), flush=True)
    return 0


def _resolve_codex_command(args: argparse.Namespace) -> tuple[list[str] | None, str | None, str]:
    configured = str(args.codex_cli or os.environ.get("CODEX_CLI") or "")
    if not configured:
        located = shutil.which("codex")
        if located:
            # A systemd user service commonly inherits an older system Node.js even
            # when Codex CLI and a supported Node runtime are installed separately.
            # Keep the wrapper command, but prepend the configured runtime for its
            # shebang when it is available.
            node = _configured_node(args)
            node_bin = str(node.parent) if node.exists() else None
            return [located], node_bin, ""
    codex_cli = Path(configured or DEFAULT_CODEX_CLI).expanduser()
    if not codex_cli.exists():
        return None, None, f"codex_cli_missing:{codex_cli}"
    if codex_cli.suffix.lower() != ".js":
        return [str(codex_cli)], None, ""
    node = _configured_node(args)
    if not node.exists():
        return None, None, f"node_missing:{node}"
    return [str(node), str(codex_cli)], str(node.parent), ""


def _configured_node(args: argparse.Namespace) -> Path:
    return Path(args.node or os.environ.get("CODEX_NODE") or DEFAULT_NODE).expanduser()


def _parse_json_message(message: str) -> dict[str, Any]:
    try:
        parsed = json.loads(message)
        return parsed if isinstance(parsed, dict) else {"text": str(parsed)[:4000], "toolCalls": []}
    except json.JSONDecodeError:
        pass

    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", message, flags=re.DOTALL)
    if fenced:
        try:
            parsed = json.loads(fenced.group(1))
            return parsed if isinstance(parsed, dict) else {"text": str(parsed)[:4000], "toolCalls": []}
        except json.JSONDecodeError:
            pass

    inline = re.search(r"(\{.*\})", message, flags=re.DOTALL)
    if inline:
        try:
            parsed = json.loads(inline.group(1))
            return parsed if isinstance(parsed, dict) else {"text": str(parsed)[:4000], "toolCalls": []}
        except json.JSONDecodeError:
            pass

    return {"text": message[:4000], "toolCalls": []}


def _codex_env(node_bin: str | None) -> dict[str, str]:
    env = os.environ.copy()
    if node_bin:
        env["PATH"] = f"{node_bin}{os.pathsep}{env.get('PATH', '')}"
    return env


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Answer factory twin agent prompts through locally authenticated Codex OAuth")
    parser.add_argument("--model", default="latest")
    parser.add_argument("--timeout-sec", type=float, default=120)
    parser.add_argument("--codex-cli", default="")
    parser.add_argument("--node", default="")
    parser.add_argument("--reasoning-effort", default="low", choices=["low", "medium", "high", "xhigh"])
    return parser.parse_args(argv)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
