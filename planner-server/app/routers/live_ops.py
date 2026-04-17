from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.audit import record_audit
from app.control_plane_read_models import build_control_plane_alerts, build_mission_execution_summary
from app.deps import CurrentWebUser, get_session, require_internal_user
from app.models import AuditEvent, Flight, FlightEvent, InspectionReport, Mission, Site, TelemetryBatch
from app.web_dto import (
    AlertCenterItemDto,
    ControlIntentDto,
    ControlIntentRequestDto,
    ControlLeaseDto,
    FlightEventRecordDto,
    LiveFlightDetailDto,
    LiveFlightSummaryDto,
    LiveTelemetrySampleDto,
    SupportQueueActionRequestDto,
    SupportQueueItemDto,
    SupportWorkflowDto,
    VideoChannelDescriptorDto,
)
from app.web_scope import apply_org_read_scope, ensure_org_read_access, ensure_org_write_access


router = APIRouter(tags=["live-ops"])

STALE_TELEMETRY_SECONDS = 90
STALE_VIDEO_SECONDS = 15
LOW_BATTERY_THRESHOLD = 25
BRIDGE_ALERT_LOOKBACK_MINUTES = 10

CONTROL_LEASE_EVENT = "CONTROL_LEASE_UPDATED"
VIDEO_STREAM_EVENT = "VIDEO_STREAM_STATE"
BRIDGE_ALERT_EVENT = "BRIDGE_ALERT"
CONTROL_INTENT_REQUESTED = "flight.control_intent_requested"
CONTROL_INTENT_ACKNOWLEDGED = "flight.control_intent_acknowledged"

SUPPORT_QUEUE_CLAIMED = "support.queue.claimed"
SUPPORT_QUEUE_ACKNOWLEDGED = "support.queue.acknowledged"
SUPPORT_QUEUE_RESOLVED = "support.queue.resolved"
SUPPORT_QUEUE_RELEASED = "support.queue.released"
SUPPORT_QUEUE_ACTIONS = [
    SUPPORT_QUEUE_CLAIMED,
    SUPPORT_QUEUE_ACKNOWLEDGED,
    SUPPORT_QUEUE_RESOLVED,
    SUPPORT_QUEUE_RELEASED,
]


@router.get("/v1/live-ops/flights", response_model=list[LiveFlightSummaryDto])
def list_live_flights(
    current_user: CurrentWebUser = Depends(require_internal_user),
    session: Session = Depends(get_session),
) -> list[LiveFlightSummaryDto]:
    statement = apply_org_read_scope(
        select(Flight).where(Flight.organization_id.is_not(None)),
        Flight.organization_id,
        current_user,
    )
    flights = session.exec(statement.order_by(Flight.updated_at.desc())).all()
    return [_build_live_summary(session, flight) for flight in flights if flight.organization_id is not None]


@router.get("/v1/live-ops/flights/{flight_id}", response_model=LiveFlightDetailDto)
def get_live_flight(
    flight_id: str,
    current_user: CurrentWebUser = Depends(require_internal_user),
    session: Session = Depends(get_session),
) -> LiveFlightDetailDto:
    flight = _get_org_flight(session, flight_id)
    ensure_org_read_access(session, current_user, flight.organization_id, action="flight.live_ops.read_access")

    summary = _build_live_summary(session, flight)
    return LiveFlightDetailDto(
        **summary.model_dump(),
        recentEvents=_recent_events(session, flight_id),
    )


@router.get("/v1/live-ops/flights/{flight_id}/control-intents", response_model=list[ControlIntentDto])
def list_control_intents(
    flight_id: str,
    current_user: CurrentWebUser = Depends(require_internal_user),
    session: Session = Depends(get_session),
) -> list[ControlIntentDto]:
    flight = _get_org_flight(session, flight_id)
    ensure_org_read_access(session, current_user, flight.organization_id, action="flight.control_intent.read_access")
    return _control_intents(session, flight_id)


@router.post("/v1/live-ops/flights/{flight_id}/control-intents", response_model=ControlIntentDto, status_code=202)
def request_control_intent(
    flight_id: str,
    request: ControlIntentRequestDto,
    current_user: CurrentWebUser = Depends(require_internal_user),
    session: Session = Depends(get_session),
) -> ControlIntentDto:
    flight = _get_org_flight(session, flight_id)
    ensure_org_write_access(session, current_user, flight.organization_id, action="flight.control_intent.write_access")

    audit_event = record_audit(
        session,
        action=CONTROL_INTENT_REQUESTED,
        organization_id=flight.organization_id,
        actor_user_id=current_user.user.id,
        target_type="flight",
        target_id=flight_id,
        metadata={
            "action": request.action,
            "reason": request.reason,
            "missionId": flight.mission_id,
        },
    )
    session.commit()

    return ControlIntentDto(
        requestId=audit_event.id,
        flightId=flight_id,
        action=request.action,
        status="requested",
        reason=request.reason,
        requestedByUserId=current_user.user.id,
        createdAt=audit_event.created_at,
    )


@router.get("/v1/support/queue", response_model=list[SupportQueueItemDto])
def list_support_queue(
    current_user: CurrentWebUser = Depends(require_internal_user),
    session: Session = Depends(get_session),
) -> list[SupportQueueItemDto]:
    return _build_support_queue(session, current_user)


@router.post("/v1/support/queue/{item_id}/actions", response_model=SupportWorkflowDto, status_code=202)
def support_queue_action(
    item_id: str,
    request: SupportQueueActionRequestDto,
    current_user: CurrentWebUser = Depends(require_internal_user),
    session: Session = Depends(get_session),
) -> SupportWorkflowDto:
    item = next(
        (
            candidate
            for candidate in _build_support_queue(session, current_user, include_resolved=True)
            if candidate.itemId == item_id
        ),
        None,
    )
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="support_item_not_found")

    audit_action, workflow_state = _support_action_record(request.action)
    audit_event = record_audit(
        session,
        action=audit_action,
        organization_id=item.organizationId,
        actor_user_id=current_user.user.id,
        target_type="support_item",
        target_id=item_id,
        metadata={
            "state": workflow_state,
            "category": item.category,
            "missionId": item.missionId,
            "flightId": item.flightId,
            "assignedToUserId": current_user.user.id if workflow_state in {"claimed", "acknowledged", "resolved"} else None,
            "assignedToDisplayName": current_user.user.display_name if workflow_state in {"claimed", "acknowledged", "resolved"} else None,
            "note": request.note,
        },
    )
    session.commit()
    return _serialize_support_workflow(audit_event)


def _get_org_flight(session: Session, flight_id: str) -> Flight:
    flight = session.get(Flight, flight_id)
    if flight is None or flight.organization_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="flight_not_found")
    return flight


def _build_live_summary(session: Session, flight: Flight) -> LiveFlightSummaryDto:
    mission = session.get(Mission, flight.mission_id)
    site = session.get(Site, mission.site_id) if mission is not None and mission.site_id is not None else None
    latest_report = (
        session.exec(
            select(InspectionReport)
            .where(InspectionReport.mission_id == flight.mission_id)
            .order_by(InspectionReport.generated_at.desc(), InspectionReport.updated_at.desc(), InspectionReport.created_at.desc())
        ).first()
        if mission is not None
        else None
    )
    latest_batch = session.exec(
        select(TelemetryBatch)
        .where(TelemetryBatch.flight_id == flight.id)
        .order_by(TelemetryBatch.last_timestamp.desc())
    ).first()
    latest_sample = _telemetry_sample(latest_batch.payload_json[-1]) if latest_batch and latest_batch.payload_json else None
    latest_telemetry_at = (
        _ensure_utc(latest_batch.last_timestamp) if latest_batch is not None else _ensure_utc(flight.last_telemetry_at)
    )
    telemetry_age_seconds = _age_seconds(latest_telemetry_at)
    video = _video_channel(session, flight.id)
    execution_summary = build_mission_execution_summary(session, mission) if mission is not None else None

    return LiveFlightSummaryDto(
        flightId=flight.id,
        organizationId=flight.organization_id or "",
        missionId=flight.mission_id,
        missionName=mission.mission_name if mission is not None else flight.mission_id,
        siteId=mission.site_id if mission is not None else None,
        siteName=site.name if site is not None else None,
        lastEventAt=flight.last_event_at,
        lastTelemetryAt=latest_telemetry_at,
        lastImageryAt=execution_summary.lastImageryAt if execution_summary is not None else None,
        latestTelemetry=latest_sample,
        telemetryFreshness=_telemetry_freshness(latest_sample, telemetry_age_seconds),
        telemetryAgeSeconds=telemetry_age_seconds,
        video=video,
        controlLease=_control_lease(session, flight.id),
        alerts=_derive_alerts(session, flight, latest_sample, video),
        reportStatus=latest_report.status if latest_report is not None else "not_started",
        reportGeneratedAt=latest_report.generated_at if latest_report is not None else None,
        eventCount=latest_report.event_count if latest_report is not None else 0,
        reportSummary=latest_report.summary if latest_report is not None else None,
        executionSummary=execution_summary,
    )


def _build_support_queue(
    session: Session,
    current_user: CurrentWebUser,
    *,
    include_resolved: bool = False,
) -> list[SupportQueueItemDto]:
    items = [
        SupportQueueItemDto(
            itemId=alert.alertId,
            category=alert.category,
            severity=alert.severity,
            organizationId=alert.organizationId,
            organizationName=alert.organizationName,
            missionId=alert.missionId,
            missionName=alert.missionName,
            siteName=alert.siteName,
            title=alert.title,
            summary=alert.summary,
            recommendedNextStep=alert.recommendedNextStep,
            createdAt=alert.lastObservedAt or datetime.now(timezone.utc),
            lastObservedAt=alert.lastObservedAt,
            flightId=_support_flight_id(alert),
        )
        for alert in build_control_plane_alerts(session, current_user)
    ]

    visible_items: list[SupportQueueItemDto] = []
    for item in items:
        workflow = _load_support_workflow(session, item)
        if workflow.state == "resolved" and not include_resolved:
            continue
        item.workflow = workflow
        visible_items.append(item)

    return sorted(
        visible_items,
        key=lambda item: _ensure_utc(item.lastObservedAt or item.createdAt) or item.createdAt,
        reverse=True,
    )


def _support_flight_id(item: AlertCenterItemDto) -> str | None:
    if item.category == "battery_low" and item.alertId.startswith("battery-"):
        return item.alertId.removeprefix("battery-")
    if item.category == "telemetry_stale" and item.alertId.startswith("telemetry-stale-"):
        return item.alertId.removeprefix("telemetry-stale-")
    if item.category == "bridge_alert" and item.alertId.startswith("bridge-alert-"):
        return None
    return None


def _telemetry_sample(payload: dict[str, Any]) -> LiveTelemetrySampleDto:
    return LiveTelemetrySampleDto(
        timestamp=datetime.fromisoformat(str(payload["timestamp"]).replace("Z", "+00:00")),
        lat=float(payload["lat"]),
        lng=float(payload["lng"]),
        altitudeM=float(payload["altitudeM"]),
        groundSpeedMps=float(payload.get("groundSpeedMps", 0)),
        batteryPct=int(payload.get("batteryPct", 0)),
        flightState=str(payload.get("flightState", "UNKNOWN")),
        corridorDeviationM=float(payload.get("corridorDeviationM", 0)),
    )


def _control_lease(session: Session, flight_id: str) -> ControlLeaseDto:
    event = session.exec(
        select(FlightEvent)
        .where(FlightEvent.flight_id == flight_id, FlightEvent.event_type == CONTROL_LEASE_EVENT)
        .order_by(FlightEvent.event_timestamp.desc())
    ).first()
    if event is None:
        return ControlLeaseDto()

    payload = event.payload_json
    expires_at = payload.get("expiresAt")
    return ControlLeaseDto(
        holder=str(payload.get("holder", "released")),
        mode=str(payload.get("mode", "monitor_only")),
        remoteControlEnabled=_as_bool(payload.get("remoteControlEnabled", False)),
        observerReady=_as_bool(payload.get("observerReady", False)),
        heartbeatHealthy=_as_bool(payload.get("heartbeatHealthy", False)),
        expiresAt=datetime.fromisoformat(str(expires_at).replace("Z", "+00:00")) if expires_at else None,
    )


def _video_channel(session: Session, flight_id: str) -> VideoChannelDescriptorDto:
    event = session.exec(
        select(FlightEvent)
        .where(FlightEvent.flight_id == flight_id, FlightEvent.event_type == VIDEO_STREAM_EVENT)
        .order_by(FlightEvent.event_timestamp.desc())
    ).first()
    if event is None:
        return VideoChannelDescriptorDto()

    payload = event.payload_json
    last_frame_at_raw = payload.get("lastFrameAt")
    last_frame_at = datetime.fromisoformat(str(last_frame_at_raw).replace("Z", "+00:00")) if last_frame_at_raw else None
    video_age_seconds = _age_seconds(_ensure_utc(last_frame_at))
    available = _as_bool(payload.get("available", False))
    streaming = _as_bool(payload.get("streaming", False))

    return VideoChannelDescriptorDto(
        available=available,
        streaming=streaming,
        viewerUrl=payload.get("viewerUrl"),
        codec=payload.get("codec"),
        latencyMs=int(payload["latencyMs"]) if payload.get("latencyMs") is not None else None,
        lastFrameAt=last_frame_at,
        status=_video_status(available=available, streaming=streaming, age_seconds=video_age_seconds),
        ageSeconds=video_age_seconds,
    )


def _recent_events(session: Session, flight_id: str) -> list[FlightEventRecordDto]:
    events = session.exec(
        select(FlightEvent)
        .where(FlightEvent.flight_id == flight_id)
        .order_by(FlightEvent.event_timestamp.desc())
    ).all()
    return [
        FlightEventRecordDto(
            eventId=event.id,
            eventType=event.event_type,
            eventTimestamp=event.event_timestamp,
            payload=event.payload_json,
        )
        for event in events[:12]
    ]


def _control_intents(session: Session, flight_id: str) -> list[ControlIntentDto]:
    audit_events = session.exec(
        select(AuditEvent)
        .where(
            AuditEvent.target_type == "flight",
            AuditEvent.target_id == flight_id,
            AuditEvent.action.in_([CONTROL_INTENT_REQUESTED, CONTROL_INTENT_ACKNOWLEDGED]),
        )
        .order_by(AuditEvent.created_at.desc())
    ).all()

    acknowledgements = {
        event.metadata_json.get("requestId"): event
        for event in audit_events
        if event.action == CONTROL_INTENT_ACKNOWLEDGED and event.metadata_json.get("requestId")
    }
    request_events = [event for event in audit_events if event.action == CONTROL_INTENT_REQUESTED]
    return [_serialize_control_intent(event, acknowledgements.get(event.id)) for event in request_events]


def _serialize_control_intent(request_event: AuditEvent, ack_event: AuditEvent | None) -> ControlIntentDto:
    request_metadata = request_event.metadata_json
    ack_metadata = ack_event.metadata_json if ack_event is not None else {}
    return ControlIntentDto(
        requestId=request_event.id,
        flightId=request_event.target_id or "",
        action=str(request_metadata.get("action", "hold")),
        status=str(ack_metadata.get("status", "requested")),
        reason=request_metadata.get("reason"),
        requestedByUserId=request_event.actor_user_id,
        createdAt=request_event.created_at,
        acknowledgedAt=ack_event.created_at if ack_event is not None else None,
        resolutionNote=ack_metadata.get("reason"),
    )


def _load_support_workflow(session: Session, item: SupportQueueItemDto) -> SupportWorkflowDto:
    event = session.exec(
        select(AuditEvent)
        .where(
            AuditEvent.target_type == "support_item",
            AuditEvent.target_id == item.itemId,
            AuditEvent.action.in_(SUPPORT_QUEUE_ACTIONS),
        )
        .order_by(AuditEvent.created_at.desc())
    ).first()
    if event is None:
        return SupportWorkflowDto()

    workflow = _serialize_support_workflow(event)
    reference_at = _ensure_utc(item.lastObservedAt or item.createdAt)
    if (
        workflow.state == "resolved"
        and workflow.updatedAt is not None
        and reference_at is not None
        and _ensure_utc(workflow.updatedAt) is not None
        and _ensure_utc(workflow.updatedAt) < reference_at
    ):
        return SupportWorkflowDto()
    return workflow


def _serialize_support_workflow(event: AuditEvent) -> SupportWorkflowDto:
    metadata = event.metadata_json
    state = str(metadata.get("state", "open"))
    if state not in {"open", "claimed", "acknowledged", "resolved"}:
        state = "open"
    return SupportWorkflowDto(
        state=state,
        assignedToUserId=metadata.get("assignedToUserId"),
        assignedToDisplayName=metadata.get("assignedToDisplayName"),
        updatedAt=event.created_at,
        note=metadata.get("note"),
    )


def _support_action_record(action: str) -> tuple[str, str]:
    if action == "claim":
        return SUPPORT_QUEUE_CLAIMED, "claimed"
    if action == "acknowledge":
        return SUPPORT_QUEUE_ACKNOWLEDGED, "acknowledged"
    if action == "resolve":
        return SUPPORT_QUEUE_RESOLVED, "resolved"
    if action == "release":
        return SUPPORT_QUEUE_RELEASED, "open"
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_support_action")


def _derive_alerts(
    session: Session,
    flight: Flight,
    latest_sample: LiveTelemetrySampleDto | None,
    video: VideoChannelDescriptorDto,
) -> list[str]:
    alerts: list[str] = []
    if latest_sample is not None and latest_sample.batteryPct < LOW_BATTERY_THRESHOLD:
        alerts.append("low_battery")
    latest_sample_timestamp = _ensure_utc(latest_sample.timestamp) if latest_sample is not None else None
    if latest_sample_timestamp is not None and _is_stale(latest_sample_timestamp, STALE_TELEMETRY_SECONDS):
        alerts.append("telemetry_stale")
    if video.status != "live":
        alerts.append("video_unavailable")
    if _latest_bridge_alert(session, flight.id) is not None:
        alerts.append("bridge_alert")
    return alerts


def _latest_bridge_alert(session: Session, flight_id: str) -> FlightEvent | None:
    event = session.exec(
        select(FlightEvent)
        .where(FlightEvent.flight_id == flight_id, FlightEvent.event_type == BRIDGE_ALERT_EVENT)
        .order_by(FlightEvent.event_timestamp.desc())
    ).first()
    if event is None:
        return None
    event_timestamp = _ensure_utc(event.event_timestamp)
    if event_timestamp is None:
        return None
    if event_timestamp < datetime.now(timezone.utc) - timedelta(minutes=BRIDGE_ALERT_LOOKBACK_MINUTES):
        return None
    return event


def _as_bool(raw: Any) -> bool:
    if isinstance(raw, bool):
        return raw
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


def _ensure_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _age_seconds(value: datetime | None) -> int | None:
    if value is None:
        return None
    safe_value = _ensure_utc(value)
    if safe_value is None:
        return None
    return max(int((datetime.now(timezone.utc) - safe_value).total_seconds()), 0)


def _is_stale(value: datetime | None, threshold_seconds: int) -> bool:
    if value is None:
        return False
    age_seconds = _age_seconds(value)
    return age_seconds is not None and age_seconds > threshold_seconds


def _telemetry_freshness(latest_sample: LiveTelemetrySampleDto | None, age_seconds: int | None) -> str:
    if latest_sample is None or age_seconds is None:
        return "missing"
    if age_seconds > STALE_TELEMETRY_SECONDS:
        return "stale"
    return "fresh"


def _video_status(*, available: bool, streaming: bool, age_seconds: int | None) -> str:
    if not available:
        return "unavailable"
    if not streaming:
        return "stale"
    if age_seconds is None:
        return "stale"
    if age_seconds > STALE_VIDEO_SECONDS:
        return "stale"
    return "live"
