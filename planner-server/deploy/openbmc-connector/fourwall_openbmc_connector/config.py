from __future__ import annotations

import ipaddress
import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit


MAX_CONFIG_BYTES = 1_048_576


class ConfigError(ValueError):
    pass


@dataclass(frozen=True)
class CloudConfig:
    api_base_url: str
    token: str = field(repr=False)
    timeout_seconds: float = 10.0


@dataclass(frozen=True)
class CollectorConfig:
    base_url: str
    timeout_seconds: float = 5.0
    allow_private_lan: bool = False
    allowed_hostnames: tuple[str, ...] = ()


@dataclass(frozen=True)
class ConnectorConfig:
    cloud: CloudConfig
    collector: CollectorConfig
    state_path: Path
    device_id: str | None = None
    poll_interval_seconds: float = 5.0
    heartbeat_interval_seconds: float = 5.0
    config_refresh_seconds: float = 300.0
    command_reconcile_seconds: float = 20.0
    event_batch_size: int = 50
    log_level: str = "INFO"


def _mapping(value: Any, field_name: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ConfigError(f"{field_name} must be an object")
    return value


def _bounded_number(
    value: Any,
    field_name: str,
    *,
    minimum: float,
    maximum: float,
) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ConfigError(f"{field_name} must be a number")
    result = float(value)
    if not minimum <= result <= maximum:
        raise ConfigError(f"{field_name} must be between {minimum:g} and {maximum:g}")
    return result


def _bounded_int(
    value: Any,
    field_name: str,
    *,
    minimum: int,
    maximum: int,
) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ConfigError(f"{field_name} must be an integer")
    if not minimum <= value <= maximum:
        raise ConfigError(f"{field_name} must be between {minimum} and {maximum}")
    return value


def _boolean_value(value: Any, field_name: str, *, default: bool = False) -> bool:
    if value is None:
        return default
    if not isinstance(value, bool):
        raise ConfigError(f"{field_name} must be a boolean")
    return value


def _validate_base_url(
    raw_value: Any,
    field_name: str,
    *,
    cloud: bool,
    allow_private_lan: bool = False,
    allow_http_loopback: bool = False,
    allowed_hostnames: tuple[str, ...] = (),
) -> str:
    if not isinstance(raw_value, str) or not raw_value.strip():
        raise ConfigError(f"{field_name} must be a non-empty URL")
    value = raw_value.strip().rstrip("/")
    parsed = urlsplit(value)
    if parsed.username or parsed.password:
        raise ConfigError(f"{field_name} must not contain credentials")
    if parsed.query or parsed.fragment:
        raise ConfigError(f"{field_name} must not contain a query or fragment")
    if not parsed.hostname or parsed.scheme not in {"http", "https"}:
        raise ConfigError(f"{field_name} must use http or https")

    host = parsed.hostname.lower()
    is_loopback = host == "localhost"
    is_private = False
    try:
        address = ipaddress.ip_address(host)
        is_loopback = address.is_loopback
        is_private = address.is_private
    except ValueError:
        pass

    if cloud:
        if parsed.scheme != "https" and not (allow_http_loopback and is_loopback):
            raise ConfigError(f"{field_name} must use HTTPS")
    else:
        if (
            not is_loopback
            and host not in allowed_hostnames
            and not (allow_private_lan and is_private)
        ):
            raise ConfigError(
                f"{field_name} must target loopback, an allowlisted hostname, "
                "or an explicitly enabled private IP"
            )
    return value


def load_config(path: str | Path) -> ConnectorConfig:
    config_path = Path(path).expanduser().resolve()
    if not config_path.is_file():
        raise ConfigError(f"config file does not exist: {config_path}")
    if config_path.stat().st_size > MAX_CONFIG_BYTES:
        raise ConfigError("config file is too large")
    try:
        raw = json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ConfigError("config file is not valid UTF-8 JSON") from exc
    root = _mapping(raw, "config")
    cloud_raw = _mapping(root.get("cloud"), "cloud")
    collector_raw = _mapping(root.get("collector"), "collector")

    token_env = cloud_raw.get(
        "connector_token_env", "FOURWALL_OPENBMC_CONNECTOR_TOKEN"
    )
    if not isinstance(token_env, str) or not token_env:
        raise ConfigError("cloud.connector_token_env must be a non-empty string")
    token = os.environ.get(token_env, "")
    if not token:
        raise ConfigError(f"required connector token environment variable is unset: {token_env}")

    allow_http_loopback = _boolean_value(
        cloud_raw.get("allow_http_loopback_for_development"),
        "cloud.allow_http_loopback_for_development",
    )
    allow_private_lan = _boolean_value(
        collector_raw.get("allow_private_lan"),
        "collector.allow_private_lan",
    )
    raw_allowed_hostnames = collector_raw.get("allowed_hostnames", [])
    if not isinstance(raw_allowed_hostnames, list) or any(
        not isinstance(item, str) or not item.strip()
        for item in raw_allowed_hostnames
    ):
        raise ConfigError("collector.allowed_hostnames must be a list of hostnames")
    allowed_hostnames = tuple(
        sorted({item.strip().lower() for item in raw_allowed_hostnames})
    )
    collector_url_env = collector_raw.get("base_url_env")
    if collector_url_env is not None:
        if not isinstance(collector_url_env, str) or not collector_url_env:
            raise ConfigError("collector.base_url_env must be a non-empty string")
        collector_url_value = os.environ.get(collector_url_env, "")
        if not collector_url_value:
            raise ConfigError(
                f"required collector URL environment variable is unset: {collector_url_env}"
            )
    else:
        collector_url_value = collector_raw.get("base_url")
    cloud_url = _validate_base_url(
        cloud_raw.get("api_base_url"),
        "cloud.api_base_url",
        cloud=True,
        allow_http_loopback=allow_http_loopback,
    )
    collector_url = _validate_base_url(
        collector_url_value,
        "collector.base_url",
        cloud=False,
        allow_private_lan=allow_private_lan,
        allowed_hostnames=allowed_hostnames,
    )

    raw_state_path = root.get(
        "state_path", "/var/lib/fourwall-openbmc-connector/state.json"
    )
    if not isinstance(raw_state_path, str) or not raw_state_path:
        raise ConfigError("state_path must be a non-empty string")
    state_path = Path(raw_state_path).expanduser()
    if not state_path.is_absolute():
        state_path = (config_path.parent / state_path).resolve()

    raw_device_id = root.get("device_id")
    if raw_device_id is not None and (
        not isinstance(raw_device_id, str) or not raw_device_id.strip()
    ):
        raise ConfigError("device_id must be a non-empty string when provided")

    log_level = root.get("log_level", "INFO")
    if not isinstance(log_level, str) or log_level.upper() not in {
        "DEBUG",
        "INFO",
        "WARNING",
        "ERROR",
    }:
        raise ConfigError("log_level must be DEBUG, INFO, WARNING, or ERROR")

    return ConnectorConfig(
        cloud=CloudConfig(
            api_base_url=cloud_url,
            token=token,
            timeout_seconds=_bounded_number(
                cloud_raw.get("timeout_seconds", 10),
                "cloud.timeout_seconds",
                minimum=1,
                maximum=60,
            ),
        ),
        collector=CollectorConfig(
            base_url=collector_url,
            timeout_seconds=_bounded_number(
                collector_raw.get("timeout_seconds", 5),
                "collector.timeout_seconds",
                minimum=1,
                maximum=30,
            ),
            allow_private_lan=allow_private_lan,
            allowed_hostnames=allowed_hostnames,
        ),
        state_path=state_path,
        device_id=raw_device_id.strip() if isinstance(raw_device_id, str) else None,
        poll_interval_seconds=_bounded_number(
            root.get("poll_interval_seconds", 5),
            "poll_interval_seconds",
            minimum=1,
            maximum=60,
        ),
        heartbeat_interval_seconds=_bounded_number(
            root.get("heartbeat_interval_seconds", 5),
            "heartbeat_interval_seconds",
            minimum=5,
            maximum=300,
        ),
        config_refresh_seconds=_bounded_number(
            root.get("config_refresh_seconds", 300),
            "config_refresh_seconds",
            minimum=30,
            maximum=3600,
        ),
        command_reconcile_seconds=_bounded_number(
            root.get("command_reconcile_seconds", 20),
            "command_reconcile_seconds",
            minimum=5,
            maximum=120,
        ),
        event_batch_size=_bounded_int(
            root.get("event_batch_size", 50),
            "event_batch_size",
            minimum=1,
            maximum=50,
        ),
        log_level=log_level.upper(),
    )
