from __future__ import annotations

import logging
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from . import __version__
from .clients import ClientError, CloudClient, CollectorClient
from .config import ConnectorConfig
from .normalize import (
    PayloadError,
    build_event_batch,
    local_command_delivery_status,
    normalize_events,
    normalize_observation,
    reconcile_execution_event,
    validate_command,
)
from .state import StateStore


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso_now(now: datetime) -> str:
    return now.astimezone(timezone.utc).isoformat(timespec="seconds")


def _parse_timestamp(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    raw = value[:-1] + "+00:00" if value.endswith("Z") else value
    try:
        result = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if result.tzinfo is None:
        return None
    return result.astimezone(timezone.utc)


def _safe_failure_code(value: str) -> str:
    normalized = "".join(
        character if character.isalnum() or character == "_" else "_"
        for character in value.lower()
    )
    return normalized[:80] or "unknown_error"


class ConnectorRunner:
    def __init__(
        self,
        *,
        config: ConnectorConfig,
        cloud: CloudClient,
        collector: CollectorClient,
        state: StateStore,
        now: Callable[[], datetime] = _utc_now,
        sleep: Callable[[float], None] = time.sleep,
        logger: logging.Logger | None = None,
    ) -> None:
        self.config = config
        self.cloud = cloud
        self.collector = collector
        self.state = state
        self.now = now
        self.sleep = sleep
        self.log = logger or logging.getLogger("fourwall_openbmc_connector")
        self.device_id: str | None = None
        self.poll_interval_seconds = config.poll_interval_seconds
        self.command_claim_interval_seconds = config.poll_interval_seconds
        self.allowed_capabilities: set[str] = set()
        self._last_heartbeat_at = 0.0
        self._last_config_at = 0.0
        self._last_claim_at = 0.0
        self._last_error_code: str | None = None

    def _set_error(self, code: str | None) -> None:
        self._last_error_code = _safe_failure_code(code) if code else None

    def _refresh_config(self, *, force: bool = False) -> None:
        monotonic_now = time.monotonic()
        if not force and monotonic_now - self._last_config_at < self.config.config_refresh_seconds:
            return
        response = self.cloud.get_config()
        if response.get("schemaVersion") != "openbmc-connector-config.v1":
            raise ClientError("unsupported_cloud_config_schema")
        devices = response.get("devices")
        if not isinstance(devices, list):
            raise ClientError("invalid_cloud_devices")
        eligible: list[dict[str, Any]] = []
        for raw_device in devices:
            if not isinstance(raw_device, dict) or raw_device.get("status") != "active":
                continue
            device_id = raw_device.get("deviceId")
            if not isinstance(device_id, str) or not device_id:
                continue
            if self.config.device_id and device_id != self.config.device_id:
                continue
            eligible.append(raw_device)
        if len(eligible) != 1:
            raise ClientError(
                "configured_device_not_available"
                if self.config.device_id
                else "connector_requires_exactly_one_active_device"
            )
        self.device_id = str(eligible[0]["deviceId"])
        capabilities = eligible[0].get("capabilities")
        if not isinstance(capabilities, list) or any(
            not isinstance(value, str) for value in capabilities
        ):
            raise ClientError("invalid_device_capabilities")
        self.allowed_capabilities = set(capabilities)
        poll_interval = response.get("pollIntervalSeconds")
        if (
            not isinstance(poll_interval, bool)
            and isinstance(poll_interval, (int, float))
            and 1 <= float(poll_interval) <= 60
        ):
            self.poll_interval_seconds = float(poll_interval)
        claim_interval = response.get("commandClaimIntervalSeconds")
        if (
            not isinstance(claim_interval, bool)
            and isinstance(claim_interval, (int, float))
            and 1 <= float(claim_interval) <= 60
        ):
            self.command_claim_interval_seconds = float(claim_interval)
        self._last_config_at = monotonic_now

    def _post_heartbeat_if_due(self, *, force: bool = False) -> None:
        monotonic_now = time.monotonic()
        if (
            not force
            and monotonic_now - self._last_heartbeat_at
            < self.config.heartbeat_interval_seconds
        ):
            return
        self.cloud.post_heartbeat(
            version=__version__, last_error_code=self._last_error_code
        )
        self._last_heartbeat_at = monotonic_now

    def _upload_state(self, collector_state: dict[str, Any]) -> None:
        if self.device_id is None:
            raise ClientError("device_not_configured")
        observation = normalize_observation(
            collector_state,
            device_id=self.device_id,
            collector_instance_id=self.state.collector_instance_id,
        )
        if observation is not None:
            source_id = str(observation["sourceObservationId"])
            if source_id != self.state.data.get("lastObservationId"):
                self.cloud.post_observation(observation)
                self.state.set_last_observation_id(source_id)

        sent_keys = set(self.state.data.get("sentEventKeys", []))
        pending_events = [
            event
            for event in normalize_events(
                collector_state,
                device_id=self.device_id,
                collector_instance_id=self.state.collector_instance_id,
            )
            if event["sourceEventKey"] not in sent_keys
        ]
        for offset in range(0, len(pending_events), self.config.event_batch_size):
            batch = pending_events[offset : offset + self.config.event_batch_size]
            self.cloud.post_event_batch(
                build_event_batch(batch, device_id=self.device_id)
            )
            self.state.mark_events_sent(
                [str(event["sourceEventKey"]) for event in batch]
            )

    def _terminal_payload(
        self,
        active: dict[str, Any],
        *,
        status: str,
        failure_code: str | None = None,
        evidence_event_id: str | None = None,
    ) -> dict[str, Any]:
        result: dict[str, Any] = {}
        if evidence_event_id is not None:
            result["collectorEventId"] = evidence_event_id
            result["evidence"] = "command_specific_execution_event"
        elif status == "failed":
            result["effect"] = "execution_not_confirmed"
        return {
            "leaseId": active["leaseId"],
            "status": status,
            "finishedAt": _iso_now(self.now()),
            "localCommandId": active.get("localCommandId"),
            "failureCode": failure_code,
            "result": result,
        }

    def _queue_terminal(
        self,
        active: dict[str, Any],
        *,
        status: str,
        failure_code: str | None = None,
        evidence_event_id: str | None = None,
    ) -> None:
        active["terminalPayload"] = self._terminal_payload(
            active,
            status=status,
            failure_code=failure_code,
            evidence_event_id=evidence_event_id,
        )
        self.state.set_active_command(active)

    def _flush_terminal(self, active: dict[str, Any]) -> bool:
        terminal = active.get("terminalPayload")
        if not isinstance(terminal, dict):
            return False
        try:
            self.cloud.post_result(
                command_id=str(active["commandId"]),
                payload=terminal,
            )
        except ClientError as exc:
            deadline = _parse_timestamp(active.get("leaseExpiresAt"))
            if (
                exc.status in {404, 409, 410}
                and deadline is not None
                and self.now() >= deadline
            ):
                self.state.set_active_command(None)
                return True
            raise
        self.state.set_active_command(None)
        return True

    def _post_progress(
        self, active: dict[str, Any], status: str, local_command_id: str
    ) -> None:
        self.cloud.post_progress(
            command_id=str(active["commandId"]),
            lease_id=str(active["leaseId"]),
            status=status,
            local_command_id=local_command_id,
        )
        active["phase"] = status
        self.state.set_active_command(active)

    def _recover_or_reconcile(
        self, collector_state: dict[str, Any] | None
    ) -> None:
        active = self.state.active_command
        if active is None:
            return
        if self._flush_terminal(active):
            return
        phase = active.get("phase")
        if phase == "dispatching":
            self._queue_terminal(
                active,
                status="failed",
                failure_code="local_delivery_unknown_after_restart",
            )
            self._flush_terminal(active)
            return
        if (
            phase == "local_accepted"
            and isinstance(active.get("localCommandId"), str)
        ):
            self._post_progress(
                active,
                "accepted_by_collector",
                str(active["localCommandId"]),
            )
            active = self.state.active_command or active
            phase = active.get("phase")
        local_command_id = active.get("localCommandId")
        command_type = active.get("commandType")
        if (
            collector_state is not None
            and isinstance(local_command_id, str)
            and isinstance(command_type, str)
        ):
            delivery = local_command_delivery_status(
                collector_state, local_command_id=local_command_id
            )
            if delivery == "delivered" and phase != "delivered_to_agent":
                self._post_progress(active, "delivered_to_agent", local_command_id)
                active = self.state.active_command or active
                phase = active.get("phase")

            outcome, event_id = reconcile_execution_event(
                collector_state,
                command_type=command_type,
                local_command_id=local_command_id,
                not_before=active.get("dispatchedAt"),
            )
            if outcome == "succeeded":
                if phase != "delivered_to_agent":
                    self._post_progress(
                        active, "delivered_to_agent", local_command_id
                    )
                    active = self.state.active_command or active
                self._queue_terminal(
                    active,
                    status="succeeded",
                    evidence_event_id=event_id,
                )
                self._flush_terminal(active)
                return
            if outcome == "failed":
                if phase != "delivered_to_agent":
                    self._post_progress(
                        active, "delivered_to_agent", local_command_id
                    )
                    active = self.state.active_command or active
                self._queue_terminal(
                    active,
                    status="failed",
                    failure_code="local_execution_failed",
                    evidence_event_id=event_id,
                )
                self._flush_terminal(active)
                return

        deadline = _parse_timestamp(active.get("reconcileDeadlineAt"))
        if deadline is None:
            deadline = _parse_timestamp(active.get("leaseExpiresAt"))
        if deadline is None:
            self._queue_terminal(
                active, status="failed", failure_code="invalid_lease_expiry"
            )
            self._flush_terminal(active)
        elif self.now() >= deadline:
            self._queue_terminal(
                active, status="failed", failure_code="execution_unverified"
            )
            self._flush_terminal(active)

    def _claim_and_dispatch(self, collector_state: dict[str, Any]) -> None:
        if self.device_id is None or self.state.active_command is not None:
            return
        monotonic_now = time.monotonic()
        if monotonic_now - self._last_claim_at < self.command_claim_interval_seconds:
            return
        self._last_claim_at = monotonic_now
        claim = self.cloud.claim_command()
        if claim is None:
            return
        command_id = claim.get("commandId")
        lease_id = claim.get("leaseId")
        lease_expires_at = claim.get("leaseExpiresAt")
        claim_device_id = claim.get("deviceId")
        if not all(isinstance(value, str) and value for value in (command_id, lease_id, lease_expires_at)):
            raise ClientError("invalid_claim_identifiers")
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", command_id):
            raise ClientError("invalid_claim_command_id")
        if len(lease_id) > 512:
            raise ClientError("invalid_claim_lease_id")
        lease_deadline = _parse_timestamp(lease_expires_at)
        if lease_deadline is None or lease_deadline <= self.now():
            raise ClientError("invalid_or_expired_claim_lease")
        if claim_device_id != self.device_id:
            raise ClientError("claim_device_mismatch")
        try:
            command_type, arguments = validate_command(claim)
        except PayloadError as exc:
            active = {
                "commandId": command_id,
                "leaseId": lease_id,
                "leaseExpiresAt": lease_expires_at,
                "deviceId": claim_device_id,
                "commandType": "unsupported",
                "arguments": {},
                "phase": "claimed",
                "localCommandId": None,
            }
            self.state.set_active_command(active)
            self._queue_terminal(
                active, status="failed", failure_code=_safe_failure_code(str(exc))
            )
            self._flush_terminal(active)
            return
        if command_type not in self.allowed_capabilities:
            active = {
                "commandId": command_id,
                "leaseId": lease_id,
                "leaseExpiresAt": lease_expires_at,
                "deviceId": claim_device_id,
                "commandType": command_type,
                "arguments": arguments,
                "phase": "claimed",
                "localCommandId": None,
            }
            self.state.set_active_command(active)
            self._queue_terminal(
                active, status="failed", failure_code="capability_not_allowed"
            )
            self._flush_terminal(active)
            return
        reading = collector_state.get("reading")
        if not isinstance(reading, dict) or reading.get("stale") is not False:
            control_block = "collector_not_fresh"
        else:
            received_at = _parse_timestamp(reading.get("received_at"))
            source_at = _parse_timestamp(reading.get("timestamp"))
            if (
                received_at is None
                or source_at is None
                or (self.now() - received_at).total_seconds() > 15
                or (self.now() - source_at).total_seconds() > 15
                or (received_at - self.now()).total_seconds() > 120
                or (source_at - self.now()).total_seconds() > 120
            ):
                control_block = "collector_not_fresh"
            else:
                control_block = None
        if command_type == "fan_boost":
            fan = collector_state.get("fan")
            if (
                not isinstance(fan, dict)
                or fan.get("present") is not True
                or fan.get("manual_boost_supported") is not True
            ):
                control_block = "fan_control_not_available"
        if control_block is not None:
            active = {
                "commandId": command_id,
                "leaseId": lease_id,
                "leaseExpiresAt": lease_expires_at,
                "deviceId": claim_device_id,
                "commandType": command_type,
                "arguments": arguments,
                "phase": "claimed",
                "localCommandId": None,
            }
            self.state.set_active_command(active)
            self._queue_terminal(
                active, status="failed", failure_code=control_block
            )
            self._flush_terminal(active)
            return
        reconcile_deadline = min(
            lease_deadline,
            self.now() + timedelta(seconds=self.config.command_reconcile_seconds),
        )
        active = {
            "commandId": command_id,
            "leaseId": lease_id,
            "leaseExpiresAt": lease_expires_at,
            "reconcileDeadlineAt": _iso_now(reconcile_deadline),
            "deviceId": claim_device_id,
            "commandType": command_type,
            "arguments": arguments,
            "phase": "dispatching",
            "localCommandId": None,
            "dispatchedAt": _iso_now(self.now()),
        }
        self.state.set_active_command(active)
        try:
            local_command_id = self.collector.execute(command_type, arguments)
        except ClientError as exc:
            self._queue_terminal(
                active,
                status="failed",
                failure_code=f"local_dispatch_{_safe_failure_code(exc.code)}",
            )
            self._flush_terminal(active)
            return
        active["localCommandId"] = local_command_id
        active["phase"] = "local_accepted"
        self.state.set_active_command(active)
        self._post_progress(active, "accepted_by_collector", local_command_id)

    def run_once(self) -> None:
        force_config = self.device_id is None
        try:
            self._refresh_config(force=force_config)
        except ClientError as exc:
            self._set_error(exc.code)
            self.log.warning("cloud config unavailable: %s", exc.code)
            if force_config:
                return

        collector_state: dict[str, Any] | None = None
        try:
            collector_state = self.collector.get_state()
            self._upload_state(collector_state)
            self._set_error(None)
        except ClientError as exc:
            self._set_error(f"collector_{exc.code}")
            self.log.warning("collector cycle failed: %s", exc.code)

        try:
            self._post_heartbeat_if_due()
        except ClientError as exc:
            self._set_error(f"heartbeat_{exc.code}")
            self.log.warning("heartbeat failed: %s", exc.code)

        try:
            self._recover_or_reconcile(collector_state)
            if collector_state is not None:
                self._claim_and_dispatch(collector_state)
        except ClientError as exc:
            self._set_error(f"command_{exc.code}")
            self.log.warning("command cycle failed: %s", exc.code)

    def run_forever(self) -> None:
        self.log.info("OpenBMC connector started")
        while True:
            try:
                self.run_once()
            except Exception:
                self._set_error("unexpected_cycle_error")
                self.log.exception("unexpected connector cycle error")
            self.sleep(self.poll_interval_seconds)
