from __future__ import annotations

import json
import os
import subprocess
import time
from dataclasses import dataclass, field
from typing import Any

from .config import GptConfig
from .text_normalization import normalize_traditional_chinese


@dataclass(frozen=True)
class SummaryResult:
    status: str
    summary: dict[str, Any] = field(default_factory=dict)
    error: str | None = None


class GptSummarizer:
    def __init__(self, config: GptConfig) -> None:
        self.config = config
        self._last_summary_at = 0.0
        self._last_summary: dict[str, Any] = {}
        self._last_observation_signature = ""

    def summarize(self, observation: dict[str, Any]) -> SummaryResult:
        if not self.config.enabled:
            return SummaryResult(status="unknown")
        observation_signature = _observation_signature(observation)
        if self._is_rate_limited():
            if self._last_summary and observation_signature == self._last_observation_signature:
                return SummaryResult(status="ok", summary={**self._last_summary, "cached": True})
            return SummaryResult(status="unknown", error="gpt_summary_rate_limited")
        if self._last_summary and observation_signature == self._last_observation_signature:
            if self._last_summary:
                return SummaryResult(status="ok", summary={**self._last_summary, "cached": True})
        if self.config.auth_mode != "account_oauth_dev":
            return SummaryResult(status="failed", error=f"unsupported_gpt_auth_mode:{self.config.auth_mode}")
        if self.config.auth_cache_dir is not None and not self.config.auth_cache_dir.exists():
            return SummaryResult(status="auth_required", error="gpt_auth_cache_dir_missing")
        if not self.config.command:
            return SummaryResult(status="auth_required", error="gpt_summary_command_missing")

        command = [part.replace("{model}", self.config.summary_model) for part in self.config.command]
        prompt = _prompt_payload(observation, model=self.config.summary_model)
        try:
            completed = subprocess.run(
                command,
                input=json.dumps(prompt, ensure_ascii=False),
                capture_output=True,
                text=True,
                timeout=self.config.timeout_sec,
                check=False,
                encoding="utf-8",
                env=_command_env(self.config),
            )
        except FileNotFoundError as exc:
            return SummaryResult(status="auth_required", error=f"gpt_summary_command_not_found:{exc.filename}")
        except subprocess.TimeoutExpired:
            return SummaryResult(status="failed", error="gpt_summary_timeout")

        stdout = completed.stdout.strip()
        stderr = completed.stderr.strip()
        if completed.returncode != 0:
            return SummaryResult(status=_error_status(stderr), error=(stderr or f"gpt_summary_exit_{completed.returncode}")[:1000])
        if not stdout:
            return SummaryResult(status="failed", error="gpt_summary_empty_output")
        summary = normalize_traditional_chinese(_parse_summary(stdout))
        self._last_summary_at = time.monotonic()
        self._last_summary = summary
        self._last_observation_signature = observation_signature
        return SummaryResult(status="ok", summary=summary)

    def _is_rate_limited(self) -> bool:
        if self.config.min_interval_sec <= 0:
            return False
        if self._last_summary_at <= 0:
            return False
        return time.monotonic() - self._last_summary_at < self.config.min_interval_sec


def _prompt_payload(observation: dict[str, Any], *, model: str) -> dict[str, Any]:
    return {
        "model": model,
        "task": "Summarize HC600 HMI OCR and work order OCR for a factory operations dashboard.",
        "rules": [
            "Return JSON only.",
            "Do not overwrite or invent numeric readings from structuredFields.",
            "Use unknown for uncertain facts.",
            "Keep the summary short and operational.",
            "Write every human-facing Chinese field in Traditional Chinese for Taiwan (zh-Hant-TW). Never output Simplified Chinese.",
        ],
        "expected_schema": {
            "summary": "string",
            "machine": "string or unknown",
            "screenMode": "temperature_monitor | machine_monitor | unknown",
            "workOrder": "object",
            "keyValues": "object",
            "uncertain": "array of strings",
        },
        "observation": observation,
    }


def _parse_summary(stdout: str) -> dict[str, Any]:
    try:
        parsed = json.loads(stdout)
    except json.JSONDecodeError:
        return {"summary": stdout[:4000]}
    if isinstance(parsed, dict):
        return parsed
    return {"summary": parsed}


def _observation_signature(observation: dict[str, Any]) -> str:
    stable_payload = {
        "mode": observation.get("mode"),
        "modeConfidence": observation.get("modeConfidence"),
        "structuredFields": observation.get("structuredFields"),
        "workOrderRawText": observation.get("workOrderRawText"),
    }
    return json.dumps(stable_payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


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
}


def _command_env(config: GptConfig) -> dict[str, str]:
    env = os.environ.copy()
    for key in _SENSITIVE_ENV_KEYS:
        env.pop(key, None)
    env["GPT_AUTH_MODE"] = config.auth_mode
    env["GPT_SUMMARY_MODEL"] = config.summary_model
    if config.auth_cache_dir is not None:
        env["GPT_AUTH_CACHE_DIR"] = str(config.auth_cache_dir)
    return env
