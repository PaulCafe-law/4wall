from __future__ import annotations

from dataclasses import dataclass, field
import os
from pathlib import Path
import shlex
from typing import Any

import yaml


@dataclass(frozen=True)
class PlatformConfig:
    enabled: bool = False
    api_base_url: str = ""
    worker_token: str = ""
    timeout_sec: float = 10.0
    poll_interval_sec: float = 1.0


@dataclass(frozen=True)
class AgentConfig:
    model: str = "latest"
    command: list[str] = field(default_factory=list)
    timeout_sec: float = 45.0
    auth_cache_dir: Path | None = None
    max_output_chars: int = 4000


@dataclass(frozen=True)
class DebugConfig:
    runtime_dir: Path


@dataclass(frozen=True)
class AppConfig:
    root_dir: Path
    platform: PlatformConfig
    agent: AgentConfig
    debug: DebugConfig


def load_config(path: str | Path) -> AppConfig:
    config_path = Path(path).expanduser().resolve()
    payload = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
    root_dir = config_path.parent

    platform_payload = payload.get("platform") or {}
    agent_payload = payload.get("agent") or {}
    debug_payload = payload.get("debug") or {}

    runtime_dir = Path(str(debug_payload.get("runtime_dir", "runtime"))).expanduser()
    if not runtime_dir.is_absolute():
        runtime_dir = root_dir / runtime_dir

    return AppConfig(
        root_dir=root_dir,
        platform=PlatformConfig(
            enabled=_env_bool("TWIN_AGENT_ENABLED", bool(platform_payload.get("enabled", False))),
            api_base_url=_env_str("TWIN_AGENT_API_BASE_URL", platform_payload.get("api_base_url", "")).rstrip("/"),
            worker_token=_env_str("TWIN_AGENT_WORKER_TOKEN", platform_payload.get("worker_token", "")),
            timeout_sec=float(platform_payload.get("timeout_sec", 10)),
            poll_interval_sec=float(platform_payload.get("poll_interval_sec", 1.0)),
        ),
        agent=AgentConfig(
            model=str(agent_payload.get("model", "latest")),
            command=_parse_command(agent_payload.get("command") or os.environ.get("TWIN_AGENT_COMMAND")),
            timeout_sec=float(agent_payload.get("timeout_sec", 45)),
            auth_cache_dir=_optional_path(_env_str("TWIN_AGENT_AUTH_CACHE_DIR", agent_payload.get("auth_cache_dir"))),
            max_output_chars=int(agent_payload.get("max_output_chars", 4000)),
        ),
        debug=DebugConfig(runtime_dir=runtime_dir),
    )


def resolve_config_path(root_dir: Path, configured_path: str) -> Path:
    path = Path(configured_path).expanduser()
    if path.is_absolute():
        return path
    return root_dir / path


def _optional_path(value: Any) -> Path | None:
    if value is None or value == "":
        return None
    return Path(str(value)).expanduser()


def _parse_command(value: Any) -> list[str]:
    if value is None or value == "":
        return []
    if isinstance(value, str):
        return shlex.split(value, posix=os.name != "nt")
    if isinstance(value, (list, tuple)):
        return [str(part) for part in value]
    raise ValueError(f"command must be a string or list, got {value!r}")


def _env_str(name: str, default: Any) -> str:
    value = os.environ.get(name)
    if value is None:
        return "" if default is None else str(default)
    return value


def _env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}
