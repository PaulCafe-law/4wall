from __future__ import annotations

import json
import os
import subprocess
from dataclasses import dataclass, field
from typing import Any

from .config import AgentConfig


@dataclass(frozen=True)
class BridgeResult:
    status: str
    text: str = ""
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    error: str | None = None


class AgentBridge:
    def __init__(self, config: AgentConfig) -> None:
        self.config = config

    def run(self, prompt: str) -> BridgeResult:
        if self.config.auth_cache_dir is not None and not self.config.auth_cache_dir.exists():
            return BridgeResult(status="auth_required", error="agent_auth_cache_dir_missing")
        if not self.config.command:
            return BridgeResult(status="auth_required", error="agent_command_missing")

        command = [part.replace("{model}", self.config.model) for part in self.config.command]
        request = {"model": self.config.model, "prompt": prompt}
        try:
            completed = subprocess.run(
                command,
                input=json.dumps(request, ensure_ascii=False),
                capture_output=True,
                text=True,
                timeout=self.config.timeout_sec,
                check=False,
                encoding="utf-8",
                env=_command_env(self.config),
            )
        except FileNotFoundError as exc:
            return BridgeResult(status="auth_required", error=f"agent_command_not_found:{exc.filename}")
        except subprocess.TimeoutExpired:
            return BridgeResult(status="failed", error="agent_timeout")

        stdout = completed.stdout.strip()
        stderr = completed.stderr.strip()
        if completed.returncode != 0:
            return BridgeResult(status=_error_status(stderr), error=(stderr or f"agent_exit_{completed.returncode}")[:1000])
        if not stdout:
            return BridgeResult(status="failed", error="agent_empty_output")
        reply = _parse_reply(stdout)
        tool_calls = reply.get("toolCalls")
        return BridgeResult(
            status="ok",
            text=str(reply.get("text") or ""),
            tool_calls=list(tool_calls) if isinstance(tool_calls, list) else [],
        )


class FakeAgentBridge:
    def __init__(self, results: list[BridgeResult] | None = None) -> None:
        self.results = list(results or [])
        self.prompts: list[str] = []

    def run(self, prompt: str) -> BridgeResult:
        self.prompts.append(prompt)
        if self.results:
            return self.results.pop(0)
        return BridgeResult(status="ok", text="已下達指令，請看大螢幕", tool_calls=[])


def build_bridge(config: AgentConfig, *, fake: bool = False) -> AgentBridge | FakeAgentBridge:
    if fake:
        return FakeAgentBridge()
    return AgentBridge(config)


def _parse_reply(stdout: str) -> dict[str, Any]:
    try:
        parsed = json.loads(stdout)
    except json.JSONDecodeError:
        return {"text": stdout[:4000]}
    if isinstance(parsed, dict):
        return parsed
    return {"text": str(parsed)[:4000]}


def _error_status(stderr: str) -> str:
    lowered = stderr.lower()
    if any(token in lowered for token in ("login", "auth", "oauth", "credential", "token")):
        return "auth_required"
    return "failed"


_SENSITIVE_ENV_KEYS = {
    "ANTHROPIC_API_KEY",
    "AZURE_OPENAI_API_KEY",
    "CODEX_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "OPENAI_API_KEY",
    "TWIN_AGENT_WORKER_TOKEN",
}


def _command_env(config: AgentConfig) -> dict[str, str]:
    env = {
        key: value
        for key, value in os.environ.items()
        if key not in _SENSITIVE_ENV_KEYS and not key.upper().endswith("_API_KEY")
    }
    env["TWIN_AGENT_MODEL"] = config.model
    if config.auth_cache_dir is not None:
        env["TWIN_AGENT_AUTH_CACHE_DIR"] = str(config.auth_cache_dir)
    return env
