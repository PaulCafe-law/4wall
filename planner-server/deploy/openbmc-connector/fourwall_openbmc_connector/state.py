from __future__ import annotations

import json
import os
import tempfile
import uuid
from pathlib import Path
from typing import Any


STATE_SCHEMA_VERSION = 1
MAX_STATE_BYTES = 1_048_576
MAX_SENT_EVENT_KEYS = 1000


class StateError(RuntimeError):
    pass


class StateStore:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.data = self._load()

    def _default(self) -> dict[str, Any]:
        return {
            "schemaVersion": STATE_SCHEMA_VERSION,
            "collectorInstanceId": str(uuid.uuid4()),
            "lastObservationId": None,
            "sentEventKeys": [],
            "activeCommand": None,
        }

    def _load(self) -> dict[str, Any]:
        if not self.path.exists():
            return self._default()
        try:
            if self.path.stat().st_size > MAX_STATE_BYTES:
                raise StateError("state_file_too_large")
            value = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise StateError("state_file_invalid") from exc
        if not isinstance(value, dict) or value.get("schemaVersion") != STATE_SCHEMA_VERSION:
            raise StateError("unsupported_state_schema")
        instance_id = value.get("collectorInstanceId")
        if not isinstance(instance_id, str):
            raise StateError("state_missing_collector_instance_id")
        try:
            uuid.UUID(instance_id)
        except ValueError as exc:
            raise StateError("state_invalid_collector_instance_id") from exc
        keys = value.get("sentEventKeys")
        if not isinstance(keys, list) or any(not isinstance(item, str) for item in keys):
            raise StateError("state_invalid_sent_event_keys")
        value["sentEventKeys"] = keys[-MAX_SENT_EVENT_KEYS:]
        if value.get("activeCommand") is not None and not isinstance(
            value.get("activeCommand"), dict
        ):
            raise StateError("state_invalid_active_command")
        return value

    @property
    def collector_instance_id(self) -> str:
        return str(self.data["collectorInstanceId"])

    @property
    def active_command(self) -> dict[str, Any] | None:
        value = self.data.get("activeCommand")
        return value if isinstance(value, dict) else None

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        encoded = json.dumps(
            self.data,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8")
        if len(encoded) > MAX_STATE_BYTES:
            raise StateError("state_file_would_exceed_limit")
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=f".{self.path.name}.", dir=str(self.path.parent)
        )
        temporary_path = Path(temporary_name)
        try:
            with os.fdopen(descriptor, "wb") as handle:
                handle.write(encoded)
                handle.flush()
                os.fsync(handle.fileno())
            try:
                os.chmod(temporary_path, 0o600)
            except OSError:
                pass
            os.replace(temporary_path, self.path)
        finally:
            if temporary_path.exists():
                temporary_path.unlink()

    def set_last_observation_id(self, source_id: str) -> None:
        self.data["lastObservationId"] = source_id
        self.save()

    def mark_events_sent(self, source_keys: list[str]) -> None:
        existing = [
            item for item in self.data.get("sentEventKeys", []) if isinstance(item, str)
        ]
        seen = set(existing)
        for source_key in source_keys:
            if source_key not in seen:
                existing.append(source_key)
                seen.add(source_key)
        self.data["sentEventKeys"] = existing[-MAX_SENT_EVENT_KEYS:]
        self.save()

    def set_active_command(self, command: dict[str, Any] | None) -> None:
        self.data["activeCommand"] = command
        self.save()
