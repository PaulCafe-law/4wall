from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import json
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import and_, or_
from sqlmodel import Session, select

from app.config import Settings
from app.models import (
    OpenBmcCommand,
    OpenBmcConnector,
    OpenBmcDevice,
    OpenBmcEventRecord,
    OpenBmcTelemetryObservation,
)


OPENBMC_ALLOWED_COMMANDS = frozenset({"fan_boost", "reset_dry_run"})
OPENBMC_ACTIVE_COMMAND_STATUSES = frozenset(
    {"queued", "claimed", "accepted_by_collector", "delivered_to_agent"}
)
OPENBMC_TERMINAL_COMMAND_STATUSES = frozenset(
    {"succeeded", "failed", "expired", "cancelled", "rejected"}
)


def as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def utc_or_none(value: datetime | None) -> datetime | None:
    return as_utc(value) if value is not None else None


def latest_observation(session: Session, device_id: str) -> OpenBmcTelemetryObservation | None:
    return session.exec(
        select(OpenBmcTelemetryObservation)
        .where(OpenBmcTelemetryObservation.device_id == device_id)
        .order_by(
            OpenBmcTelemetryObservation.observed_at.desc(),
            OpenBmcTelemetryObservation.ingested_at.desc(),
        )
        .limit(1)
    ).first()


def freshness_evidence(
    *,
    connector: OpenBmcConnector,
    device: OpenBmcDevice,
    observation: OpenBmcTelemetryObservation | None,
    max_age_seconds: int,
    clock_skew_seconds: int,
    now: datetime | None = None,
) -> tuple[str, list[str]]:
    current = as_utc(now or datetime.now(timezone.utc))
    reasons: list[str] = []
    if connector.status != "active":
        reasons.append("connector_inactive")
    if device.status != "active":
        reasons.append("device_inactive")
    if connector.last_heartbeat_at is None:
        reasons.append("connector_heartbeat_missing")
    else:
        heartbeat_age = (current - as_utc(connector.last_heartbeat_at)).total_seconds()
        if heartbeat_age > max_age_seconds:
            reasons.append("connector_heartbeat_stale")
        if heartbeat_age < -clock_skew_seconds:
            reasons.append("connector_heartbeat_in_future")
    if observation is None:
        reasons.append("observation_missing")
        return "missing", reasons
    if observation.collector_stale:
        reasons.append("collector_reported_stale")
    source_age = (current - as_utc(observation.observed_at)).total_seconds()
    collector_received_age = (current - as_utc(observation.collector_received_at)).total_seconds()
    ingest_age = (current - as_utc(observation.ingested_at)).total_seconds()
    if source_age > max_age_seconds:
        reasons.append("source_observation_stale")
    if collector_received_age > max_age_seconds:
        reasons.append("collector_received_stale")
    if ingest_age > max_age_seconds:
        reasons.append("cloud_ingest_stale")
    if source_age < -clock_skew_seconds:
        reasons.append("source_observation_in_future")
    if collector_received_age < -clock_skew_seconds:
        reasons.append("collector_received_in_future")
    if ingest_age < -clock_skew_seconds:
        reasons.append("cloud_ingest_in_future")
    return ("fresh" if not reasons else "stale"), reasons


def normalize_command(command_type: str, arguments: dict[str, Any]) -> dict[str, Any]:
    if command_type not in OPENBMC_ALLOWED_COMMANDS:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="unsupported_openbmc_command")
    if command_type == "fan_boost":
        if set(arguments) != {"seconds"}:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="fan_boost_arguments_invalid")
        seconds = arguments.get("seconds")
        if isinstance(seconds, bool) or not isinstance(seconds, int) or not 1 <= seconds <= 60:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="fan_boost_seconds_out_of_range")
        return {"seconds": seconds}
    if set(arguments).difference({"dryRun"}):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="reset_dry_run_arguments_invalid")
    if arguments.get("dryRun", True) is not True:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="reset_dry_run_must_remain_dry_run")
    # The command type itself is the safety boundary. The connector maps this
    # type to a hard-coded local dry-run endpoint and never accepts a boolean
    # that could be flipped by a caller.
    return {}


def canonical_proposal_hash(
    *,
    device_id: str,
    command_type: str,
    arguments: dict[str, Any],
    reason: str,
    confirmation_expires_at: datetime,
) -> str:
    canonical = {
        "schemaVersion": "openbmc-command-proposal.v1",
        "deviceId": device_id,
        "type": command_type,
        "arguments": arguments,
        "reason": reason.strip(),
        "confirmationExpiresAt": as_utc(confirmation_expires_at).isoformat().replace("+00:00", "Z"),
    }
    payload = json.dumps(canonical, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def command_summary(command: OpenBmcCommand) -> dict[str, Any]:
    return {
        "commandId": command.id,
        "type": command.command_type,
        "arguments": command.arguments_json,
        "status": command.status,
        "reason": command.reason,
        "proposalHash": command.proposal_hash,
        "proposedAt": as_utc(command.proposed_at),
        "confirmationExpiresAt": as_utc(command.confirmation_expires_at),
        "confirmedAt": utc_or_none(command.confirmed_at),
        "claimExpiresAt": utc_or_none(command.claim_expires_at),
        "completedAt": utc_or_none(command.completed_at),
        "failureCode": command.failure_code,
        "result": command.result_json,
    }


def command_human_summary(command_type: str, arguments: dict[str, Any], device_name: str) -> str:
    if command_type == "fan_boost":
        return f"將 {device_name} 風扇加速 {arguments['seconds']} 秒"
    return f"執行 {device_name} 的不重啟乾跑演練"


def serialize_observation(observation: OpenBmcTelemetryObservation | None) -> dict[str, Any] | None:
    if observation is None:
        return None
    return {
        "observationId": observation.id,
        "sourceObservationId": observation.source_observation_id,
        "observedAt": as_utc(observation.observed_at),
        "collectorReceivedAt": as_utc(observation.collector_received_at),
        "ingestedAt": as_utc(observation.ingested_at),
        "collectorStale": observation.collector_stale,
        "temperatureC": observation.temperature_c,
        "status": observation.status,
        "health": observation.health,
        "fan": observation.fan_json,
        "thresholds": observation.thresholds_json,
    }


def serialize_event(event: OpenBmcEventRecord) -> dict[str, Any]:
    return {
        "eventId": event.id,
        "sourceEventKey": event.source_event_key,
        "occurredAt": as_utc(event.occurred_at),
        "severity": event.severity,
        "source": event.source,
        "code": event.code,
        "message": event.message,
        "details": event.details_json,
    }


def serialize_device(
    session: Session,
    settings: Settings,
    device: OpenBmcDevice,
    connector: OpenBmcConnector,
    *,
    actor_can_control: bool,
) -> dict[str, Any]:
    observation = latest_observation(session, device.id)
    freshness, freshness_reasons = freshness_evidence(
        connector=connector,
        device=device,
        observation=observation,
        max_age_seconds=settings.openbmc_read_freshness_seconds,
        clock_skew_seconds=settings.openbmc_clock_skew_seconds,
    )
    control_reasons = list(freshness_reasons)
    if not settings.openbmc_command_proposals_enabled:
        control_reasons.append("command_proposals_disabled")
    if not settings.openbmc_command_execution_enabled:
        control_reasons.append("command_execution_disabled")
    if not device.capabilities_json:
        control_reasons.append("no_command_capabilities")
    if not actor_can_control:
        control_reasons.append("insufficient_write_role")
    events = session.exec(
        select(OpenBmcEventRecord)
        .where(OpenBmcEventRecord.device_id == device.id)
        .order_by(OpenBmcEventRecord.occurred_at.desc(), OpenBmcEventRecord.ingested_at.desc())
        .limit(20)
    ).all()
    commands = session.exec(
        select(OpenBmcCommand)
        .where(OpenBmcCommand.device_id == device.id)
        .order_by(OpenBmcCommand.created_at.desc())
        .limit(20)
    ).all()
    return {
        "deviceId": device.id,
        "organizationId": device.organization_id,
        "siteId": device.site_id,
        "connectorId": device.connector_id,
        "name": device.name,
        "externalRef": device.external_ref,
        "deviceType": device.device_type,
        "status": device.status,
        "capabilities": device.capabilities_json,
        "canControl": actor_can_control,
        "freshness": freshness,
        "controlEligible": not control_reasons,
        "controlBlockReasons": control_reasons,
        "lastObservedAt": utc_or_none(device.last_observed_at),
        "lastIngestedAt": utc_or_none(device.last_ingested_at),
        "latestObservation": serialize_observation(observation),
        "recentEvents": [serialize_event(event) for event in events],
        "recentCommands": [command_summary(command) for command in commands],
    }


def assert_command_guards(
    *,
    session: Session,
    settings: Settings,
    connector: OpenBmcConnector,
    device: OpenBmcDevice,
    command_type: str,
    require_execution_enabled: bool,
) -> None:
    if not settings.openbmc_command_proposals_enabled:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="openbmc_command_proposals_disabled")
    if require_execution_enabled and not settings.openbmc_command_execution_enabled:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="openbmc_command_execution_disabled")
    if command_type not in device.capabilities_json:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="openbmc_command_capability_missing")
    observation = latest_observation(session, device.id)
    freshness, reasons = freshness_evidence(
        connector=connector,
        device=device,
        observation=observation,
        max_age_seconds=settings.openbmc_command_freshness_seconds,
        clock_skew_seconds=settings.openbmc_clock_skew_seconds,
    )
    if freshness != "fresh":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "openbmc_command_freshness_guard", "reasons": reasons},
        )
    if command_type == "fan_boost":
        fan = observation.fan_json if observation is not None else {}
        if fan.get("present") is not True:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="openbmc_fan_not_present")
        if fan.get("manualBoostSupported") is not True:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="openbmc_manual_boost_evidence_missing",
            )


def assert_json_size(value: dict[str, Any], *, max_bytes: int = 16_384) -> None:
    try:
        encoded = json.dumps(
            value,
            ensure_ascii=False,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8")
    except (TypeError, ValueError, OverflowError, RecursionError) as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="invalid_json_value") from exc
    if len(encoded) > max_bytes:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="json_value_too_large")


def expire_unclaimed_commands(
    session: Session,
    *,
    connector_id: str,
    now: datetime,
    use_for_update: bool = False,
) -> list[OpenBmcCommand]:
    expired: list[OpenBmcCommand] = []
    statement = select(OpenBmcCommand).where(
        OpenBmcCommand.connector_id == connector_id,
        or_(
            and_(
                OpenBmcCommand.status == "queued",
                OpenBmcCommand.execution_expires_at.is_not(None),
                OpenBmcCommand.execution_expires_at <= now,
            ),
            and_(
                OpenBmcCommand.status.in_(["claimed", "accepted_by_collector", "delivered_to_agent"]),
                OpenBmcCommand.claim_expires_at.is_not(None),
                OpenBmcCommand.claim_expires_at <= now,
            ),
        )
    )
    if use_for_update:
        statement = statement.with_for_update()
    candidates = session.exec(statement).all()
    for command in candidates:
        deadline = command.claim_expires_at if command.status != "queued" else command.execution_expires_at
        if deadline is not None and as_utc(deadline) <= as_utc(now):
            was_queued = command.status == "queued"
            command.status = "expired"
            command.active_slot = None
            command.failure_code = "queue_expired" if was_queued else "claim_lease_expired"
            command.completed_at = now
            command.updated_at = now
            session.add(command)
            expired.append(command)
    return expired
