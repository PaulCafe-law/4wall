from __future__ import annotations

import hashlib
import json
import math
import re
from datetime import datetime
from typing import Any, Literal


SCHEMA_VERSION = "openbmc-observation.v1"
EVENT_SCHEMA_VERSION = "openbmc-events.v1"
_CONTROL_CHARACTERS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


class PayloadError(ValueError):
    pass


def _object(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _aware_timestamp(value: Any) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    raw = value.strip()
    parsed_value = raw[:-1] + "+00:00" if raw.endswith("Z") else raw
    try:
        parsed = datetime.fromisoformat(parsed_value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.isoformat()


def _finite_float(
    value: Any, *, minimum: float | None = None, maximum: float | None = None
) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    result = float(value)
    if not math.isfinite(result):
        return None
    if minimum is not None and result < minimum:
        return None
    if maximum is not None and result > maximum:
        return None
    return result


def _nonnegative_int(value: Any, *, maximum: int = 1_000_000) -> int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if not math.isfinite(float(value)) or int(value) != value:
        return None
    result = int(value)
    if result < 0 or result > maximum:
        return None
    return result


def _boolean(value: Any, *, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if value in (0, "0", "false", "False", "no", "No"):
        return False
    if value in (1, "1", "true", "True", "yes", "Yes"):
        return True
    return default


def _enum(value: Any, allowed: set[str]) -> str:
    if not isinstance(value, str):
        return "unknown"
    normalized = value.strip().lower()
    return normalized if normalized in allowed else "unknown"


def _event_severity(value: Any) -> str:
    normalized = str(value).strip().lower() if value is not None else ""
    if normalized == "critical":
        return "critical"
    if normalized == "warning":
        return "warning"
    return "info"


def _canonical_digest(value: Any, *, length: int = 24) -> str:
    encoded = json.dumps(
        value, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()[:length]


def _clean_text(value: Any, *, maximum: int) -> str:
    if value is None:
        return ""
    result = _CONTROL_CHARACTERS.sub(" ", str(value)).strip()
    return result[:maximum]


def normalize_observation(
    collector_state: Any,
    *,
    device_id: str,
    collector_instance_id: str,
) -> dict[str, Any] | None:
    root = _object(collector_state)
    reading = _object(root.get("reading"))
    fan = _object(root.get("fan"))
    thresholds = _object(root.get("thresholds"))
    observed_at = _aware_timestamp(reading.get("timestamp"))
    collector_received_at = _aware_timestamp(reading.get("received_at"))
    if observed_at is None or collector_received_at is None:
        return None

    evidence = {
        "observedAt": observed_at,
        "collectorReceivedAt": collector_received_at,
        "collectorStale": _boolean(reading.get("stale"), default=True),
        "temperatureC": _finite_float(
            reading.get("temperature_c"), minimum=-40, maximum=150
        ),
        "status": _enum(
            reading.get("status"), {"normal", "warning", "critical", "unknown"}
        ),
        "health": _enum(
            reading.get("health"), {"ok", "warning", "critical", "unknown"}
        ),
        "fan": {
            "present": _boolean(fan.get("present"), default=False),
            "rpm": _nonnegative_int(fan.get("rpm"), maximum=500_000),
            "pwm": _nonnegative_int(fan.get("pwm"), maximum=255),
            "coolingState": _nonnegative_int(
                fan.get("cooling_state"), maximum=10_000
            ),
            "coolingMaxState": _nonnegative_int(
                fan.get("cooling_max_state"), maximum=10_000
            ),
            "manualBoostSupported": _boolean(
                fan.get("manual_boost_supported"), default=False
            ),
        },
        "thresholds": {
            "warningC": _finite_float(
                thresholds.get("warning_c"), minimum=-40, maximum=150
            ),
            "criticalC": _finite_float(
                thresholds.get("critical_c"), minimum=-40, maximum=150
            ),
        },
    }
    source_id = (
        f"{collector_instance_id}:observation:{_canonical_digest(evidence, length=32)}"
    )
    return {
        "schemaVersion": SCHEMA_VERSION,
        "deviceId": device_id,
        "sourceObservationId": source_id,
        **evidence,
    }


def normalize_events(
    collector_state: Any,
    *,
    device_id: str,
    collector_instance_id: str,
) -> list[dict[str, Any]]:
    root = _object(collector_state)
    source_events = root.get("events")
    if not isinstance(source_events, list):
        return []
    normalized: list[dict[str, Any]] = []
    for raw in reversed(source_events):
        event = _object(raw)
        occurred_at = _aware_timestamp(event.get("timestamp"))
        if occurred_at is None:
            continue
        source_id = _clean_text(event.get("id"), maximum=64)
        message = _clean_text(event.get("message"), maximum=1000)
        if not source_id or not message:
            continue
        evidence = {
            "occurredAt": occurred_at,
            "severity": _event_severity(event.get("severity")),
            "source": _clean_text(event.get("source"), maximum=80) or "collector",
            "code": "collector_event",
            "message": message[:500],
            "details": {
                "text": _clean_text(event.get("details"), maximum=1000),
                "temperatureC": _finite_float(
                    event.get("temperature_c"), minimum=-40, maximum=200
                ),
            },
        }
        content_digest = _canonical_digest(evidence)
        normalized.append(
            {
                "sourceEventKey": (
                    f"{collector_instance_id}:event:{source_id}:{content_digest}"
                ),
                **evidence,
            }
        )
    return normalized


def build_event_batch(
    events: list[dict[str, Any]], *, device_id: str
) -> dict[str, Any]:
    return {
        "schemaVersion": EVENT_SCHEMA_VERSION,
        "deviceId": device_id,
        "events": events,
    }


def validate_command(claim: Any) -> tuple[str, dict[str, Any]]:
    if not isinstance(claim, dict):
        raise PayloadError("invalid_claim")
    command = claim.get("command")
    if not isinstance(command, dict):
        raise PayloadError("invalid_command")
    command_type = command.get("type")
    arguments = command.get("arguments")
    if not isinstance(arguments, dict):
        raise PayloadError("invalid_arguments")
    if command_type == "fan_boost":
        seconds = arguments.get("seconds")
        if isinstance(seconds, bool) or not isinstance(seconds, int) or not 1 <= seconds <= 60:
            raise PayloadError("invalid_fan_boost_seconds")
        if set(arguments) != {"seconds"}:
            raise PayloadError("unexpected_fan_boost_arguments")
        return command_type, {"seconds": seconds}
    if command_type == "reset_dry_run":
        if arguments:
            raise PayloadError("unexpected_reset_dry_run_arguments")
        return command_type, {}
    raise PayloadError("unsupported_command")


CommandOutcome = Literal["succeeded", "failed"] | None


def reconcile_execution_event(
    collector_state: Any,
    *,
    command_type: str,
    local_command_id: str,
    not_before: str | None = None,
) -> tuple[CommandOutcome, str | None]:
    root = _object(collector_state)
    events = root.get("events")
    if not isinstance(events, list):
        return None, None
    if not re.fullmatch(r"[0-9]{1,20}", local_command_id):
        return None, None
    command_marker = re.compile(
        rf"\bcommand id(?:=|\s+){re.escape(local_command_id)}(?![0-9])"
    )
    if command_type == "fan_boost":
        success_phrase = "executed fan boost command"
        failure_phrases = ("failed to execute fan boost command", "skipped fan boost command")
    elif command_type == "reset_dry_run":
        success_phrase = "executed reset dry-run command"
        failure_phrases = ("failed to execute reset command",)
    else:
        return None, None
    cutoff: datetime | None = None
    if not_before is not None:
        raw_cutoff = not_before[:-1] + "+00:00" if not_before.endswith("Z") else not_before
        try:
            parsed_cutoff = datetime.fromisoformat(raw_cutoff)
            if parsed_cutoff.tzinfo is not None:
                cutoff = parsed_cutoff
        except ValueError:
            pass
    for raw in events:
        event = _object(raw)
        if cutoff is not None:
            event_timestamp = _aware_timestamp(event.get("timestamp"))
            if event_timestamp is None:
                continue
            parsed_event = datetime.fromisoformat(event_timestamp)
            if parsed_event < cutoff:
                continue
        message = _clean_text(event.get("message"), maximum=1000).lower()
        source = _clean_text(event.get("source"), maximum=120).lower()
        if "qemu openbmc agent" not in source:
            continue
        if command_marker.search(message) is None:
            continue
        event_id = _clean_text(event.get("id"), maximum=64) or None
        if success_phrase in message:
            return "succeeded", event_id
        if any(phrase in message for phrase in failure_phrases):
            return "failed", event_id
    return None, None


def local_command_delivery_status(
    collector_state: Any, *, local_command_id: str
) -> str | None:
    root = _object(collector_state)
    commands = root.get("commands")
    if not isinstance(commands, list):
        return None
    for raw in commands:
        command = _object(raw)
        if str(command.get("id", "")) == local_command_id:
            status = command.get("status")
            return status.strip().lower() if isinstance(status, str) else None
    return None
