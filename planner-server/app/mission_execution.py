from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlmodel import Session, select

from app.models import Flight, FlightEvent, TelemetryBatch


def latest_flight_for_mission(session: Session, mission_id: str) -> Flight | None:
    return session.exec(
        select(Flight)
        .where(Flight.mission_id == mission_id)
        .order_by(Flight.updated_at.desc(), Flight.created_at.desc())
    ).first()


def derive_execution_summary(
    session: Session,
    *,
    mission_id: str | None = None,
    flight_id: str | None = None,
) -> dict[str, Any] | None:
    flight = _resolve_flight(session, mission_id=mission_id, flight_id=flight_id)
    if flight is None:
        return None

    latest_event = session.exec(
        select(FlightEvent)
        .where(FlightEvent.flight_id == flight.id)
        .order_by(FlightEvent.event_timestamp.desc(), FlightEvent.recorded_at.desc())
    ).first()
    latest_telemetry = session.exec(
        select(TelemetryBatch)
        .where(TelemetryBatch.flight_id == flight.id)
        .order_by(TelemetryBatch.last_timestamp.desc(), TelemetryBatch.recorded_at.desc())
    ).first()

    payload = latest_event.payload_json if latest_event is not None else {}
    latest_sample = latest_telemetry.payload_json[-1] if latest_telemetry and latest_telemetry.payload_json else {}
    mission_uploaded = _as_bool(payload.get("missionUploaded"))

    execution_state = _string_or_none(payload.get("executionState"))
    if execution_state is None:
        execution_state = _string_or_none(payload.get("stage"))
    if execution_state is None:
        execution_state = _string_or_none(latest_sample.get("flightState"))

    upload_state = _string_or_none(payload.get("uploadState"))
    if upload_state is None:
        upload_state = "uploaded" if mission_uploaded else "pending_upload"

    waypoint_progress = _string_or_none(payload.get("waypointProgress"))
    if waypoint_progress is None:
        waypoint_progress = _string_or_none(payload.get("progressLabel"))

    planned_operating_profile = _string_or_none(payload.get("plannedOperatingProfile"))
    if planned_operating_profile is None:
        planned_operating_profile = _string_or_none(payload.get("operatingProfile"))

    executed_operating_profile = _string_or_none(payload.get("executedOperatingProfile"))
    if executed_operating_profile is None:
        executed_operating_profile = planned_operating_profile

    execution_mode = _string_or_none(payload.get("executionMode"))
    camera_stream_state = _string_or_none(payload.get("cameraStreamState"))
    recording_state = _string_or_none(payload.get("recordingState"))
    landing_phase = _string_or_none(payload.get("landingPhase"))
    fallback_reason = _string_or_none(payload.get("fallbackReason"))
    status_note = _string_or_none(payload.get("statusNote")) or _string_or_none(payload.get("holdReason"))

    return {
        "flightId": flight.id,
        "lastEventType": latest_event.event_type if latest_event is not None else None,
        "lastEventAt": latest_event.event_timestamp if latest_event is not None else None,
        "executionState": execution_state,
        "uploadState": upload_state,
        "waypointProgress": waypoint_progress,
        "plannedOperatingProfile": planned_operating_profile,
        "executedOperatingProfile": executed_operating_profile,
        "executionMode": execution_mode,
        "cameraStreamState": camera_stream_state,
        "recordingState": recording_state,
        "landingPhase": landing_phase,
        "fallbackReason": fallback_reason,
        "statusNote": status_note,
    }


def _resolve_flight(
    session: Session,
    *,
    mission_id: str | None,
    flight_id: str | None,
) -> Flight | None:
    if flight_id is not None:
        return session.get(Flight, flight_id)
    if mission_id is not None:
        return latest_flight_for_mission(session, mission_id)
    return None


def _string_or_none(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}
