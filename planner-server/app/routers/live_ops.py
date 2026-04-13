from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.audit import record_audit
from app.deps import CurrentWebUser, get_session, require_internal_user
from app.models import AuditEvent, Flight, FlightEvent, Mission, Organization, Site, TelemetryBatch
from app.web_dto import (
    ControlIntentDto,
    ControlIntentRequestDto,
    ControlLeaseDto,
    FlightEventRecordDto,
    LiveFlightDetailDto,
    LiveFlightSummaryDto,
    LiveTelemetrySampleDto,
    SupportQueueItemDto,
    VideoChannelDescriptorDto,
)
from app.web_scope import apply_org_read_scope, ensure_org_read_access, ensure_org_write_access


router = APIRouter(tags=["live-ops"])

STALE_TELEMETRY_SECONDS = 90
LOW_BATTERY_THRESHOLD = 25
BRIDGE_ALERT_LOOKBACK_MINUTES = 10

CONTROL_LEASE_EVENT = "CONTROL_LEASE_UPDATED"
VIDEO_STREAM_EVENT = "VIDEO_STREAM_STATE"
BRIDGE_ALERT_EVENT = "BRIDGE_ALERT"
CONTROL_INTENT_REQUESTED = "flight.control_intent_requested"
CONTROL_INTENT_ACKNOWLEDGED = "flight.control_intent_acknowledged"


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
    del current_user  # internal access already enforced above

    items: list[SupportQueueItemDto] = []
    now = datetime.now(timezone.utc)

    failed_missions = session.exec(
        select(Mission)
        .where(Mission.organization_id.is_not(None), Mission.status == "failed")
        .order_by(Mission.created_at.desc())
    ).all()
    for mission in failed_missions:
        if mission.organization_id is None:
            continue
        context = _support_context(session, organization_id=mission.organization_id, mission=mission)
        items.append(
            SupportQueueItemDto(
                itemId=f"mission-failed-{mission.id}",
                category="mission_failed",
                severity="critical",
                organizationId=mission.organization_id,
                organizationName=context["organizationName"],
                missionId=mission.id,
                missionName=context["missionName"],
                siteName=context["siteName"],
                title="任務規劃失敗",
                summary=(
                    f"{mission.mission_name} 已標記為 failed。"
                    "這代表交付流程未成功完成，需要立即確認規劃輸入與產出紀錄。"
                ),
                recommendedNextStep="打開任務詳情，先核對 mission request、規劃回應與 artifact 產出紀錄。",
                createdAt=_ensure_utc(mission.created_at) or mission.created_at,
            )
        )

    flights = session.exec(select(Flight).where(Flight.organization_id.is_not(None))).all()
    for flight in flights:
        if flight.organization_id is None:
            continue
        summary = _build_live_summary(session, flight)
        mission = session.get(Mission, flight.mission_id)
        context = _support_context(session, organization_id=flight.organization_id, mission=mission)

        if summary.latestTelemetry is not None and summary.latestTelemetry.batteryPct < LOW_BATTERY_THRESHOLD:
            items.append(
                SupportQueueItemDto(
                    itemId=f"battery-{flight.id}",
                    category="battery_low",
                    severity="warning",
                    organizationId=flight.organization_id,
                    organizationName=context["organizationName"],
                    flightId=flight.id,
                    missionId=flight.mission_id,
                    missionName=context["missionName"],
                    siteName=context["siteName"],
                    title="電量過低",
                    summary=(
                        f"最新電量為 {summary.latestTelemetry.batteryPct}%。"
                        "現場需要盡快確認飛行是否已進入安全收斂流程。"
                    ),
                    recommendedNextStep="立即確認現場是否已 HOLD、返航，並由 observer 回報目前接手狀態。",
                    createdAt=summary.latestTelemetry.timestamp,
                )
            )

        last_telemetry_at = _ensure_utc(flight.last_telemetry_at)
        if last_telemetry_at is not None and now - last_telemetry_at > timedelta(seconds=STALE_TELEMETRY_SECONDS):
            items.append(
                SupportQueueItemDto(
                    itemId=f"telemetry-stale-{flight.id}",
                    category="telemetry_stale",
                    severity="critical",
                    organizationId=flight.organization_id,
                    organizationName=context["organizationName"],
                    flightId=flight.id,
                    missionId=flight.mission_id,
                    missionName=context["missionName"],
                    siteName=context["siteName"],
                    title="遙測中斷",
                    summary="超過 90 秒未收到遙測。請檢查 uplink、Android bridge 與現場控制站狀態。",
                    recommendedNextStep="先確認現場仍有目視控制與 observer 在位，再檢查 uplink、bridge 與控制站連線。",
                    createdAt=last_telemetry_at,
                )
            )

        bridge_alert = _latest_bridge_alert(session, flight.id)
        if bridge_alert is not None:
            payload = bridge_alert.payload_json
            severity = _coerce_support_severity(payload.get("severity"))
            code = str(payload.get("code", "bridge_alert"))
            human_summary = str(
                payload.get("summary")
                or "Android bridge 回報告警。請檢查現場 uplink、bridge 連線與控制租約狀態。"
            )
            items.append(
                SupportQueueItemDto(
                    itemId=f"bridge-alert-{bridge_alert.id}",
                    category="bridge_alert",
                    severity=severity,
                    organizationId=flight.organization_id,
                    organizationName=context["organizationName"],
                    flightId=flight.id,
                    missionId=flight.mission_id,
                    missionName=context["missionName"],
                    siteName=context["siteName"],
                    title=f"Bridge 告警：{code}",
                    summary=human_summary,
                    recommendedNextStep="打開飛行監看確認最新 lease、telemetry 與 video 狀態，必要時聯繫現場 observer。",
                    createdAt=_ensure_utc(bridge_alert.event_timestamp) or bridge_alert.event_timestamp,
                )
            )

    return sorted(items, key=lambda item: _ensure_utc(item.createdAt) or item.createdAt, reverse=True)


def _get_org_flight(session: Session, flight_id: str) -> Flight:
    flight = session.get(Flight, flight_id)
    if flight is None or flight.organization_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="flight_not_found")
    return flight


def _build_live_summary(session: Session, flight: Flight) -> LiveFlightSummaryDto:
    mission = session.get(Mission, flight.mission_id)
    site = session.get(Site, mission.site_id) if mission is not None and mission.site_id is not None else None
    latest_batch = session.exec(
        select(TelemetryBatch)
        .where(TelemetryBatch.flight_id == flight.id)
        .order_by(TelemetryBatch.last_timestamp.desc())
    ).first()
    latest_sample = _telemetry_sample(latest_batch.payload_json[-1]) if latest_batch and latest_batch.payload_json else None
    video = _video_channel(session, flight.id)

    return LiveFlightSummaryDto(
        flightId=flight.id,
        organizationId=flight.organization_id or "",
        missionId=flight.mission_id,
        missionName=mission.mission_name if mission is not None else flight.mission_id,
        siteId=mission.site_id if mission is not None else None,
        siteName=site.name if site is not None else None,
        lastEventAt=flight.last_event_at,
        lastTelemetryAt=flight.last_telemetry_at,
        latestTelemetry=latest_sample,
        video=video,
        controlLease=_control_lease(session, flight.id),
        alerts=_derive_alerts(session, flight, latest_sample, video),
    )


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
    last_frame_at = payload.get("lastFrameAt")
    return VideoChannelDescriptorDto(
        available=_as_bool(payload.get("available", False)),
        streaming=_as_bool(payload.get("streaming", False)),
        viewerUrl=payload.get("viewerUrl"),
        codec=payload.get("codec"),
        latencyMs=int(payload["latencyMs"]) if payload.get("latencyMs") is not None else None,
        lastFrameAt=datetime.fromisoformat(str(last_frame_at).replace("Z", "+00:00")) if last_frame_at else None,
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


def _derive_alerts(
    session: Session,
    flight: Flight,
    latest_sample: LiveTelemetrySampleDto | None,
    video: VideoChannelDescriptorDto,
) -> list[str]:
    alerts: list[str] = []
    now = datetime.now(timezone.utc)

    if latest_sample is not None and latest_sample.batteryPct < LOW_BATTERY_THRESHOLD:
        alerts.append("low_battery")
    last_telemetry_at = _ensure_utc(flight.last_telemetry_at)
    if last_telemetry_at is not None and now - last_telemetry_at > timedelta(seconds=STALE_TELEMETRY_SECONDS):
        alerts.append("telemetry_stale")
    if video.available and not video.streaming:
        alerts.append("video_unavailable")
    if _latest_bridge_alert(session, flight.id) is not None:
        alerts.append("bridge_alert")

    return alerts


def _latest_bridge_alert(session: Session, flight_id: str) -> FlightEvent | None:
    now = datetime.now(timezone.utc)
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
    if event_timestamp < now - timedelta(minutes=BRIDGE_ALERT_LOOKBACK_MINUTES):
        return None
    return event


def _coerce_support_severity(raw: Any) -> str:
    value = str(raw or "warning").lower()
    if value in {"info", "warning", "critical"}:
        return value
    return "warning"


def _support_context(session: Session, *, organization_id: str, mission: Mission | None) -> dict[str, str | None]:
    organization = session.get(Organization, organization_id)
    site = session.get(Site, mission.site_id) if mission is not None and mission.site_id is not None else None
    return {
        "organizationName": organization.name if organization is not None else None,
        "missionName": mission.mission_name if mission is not None else None,
        "siteName": site.name if site is not None else None,
    }


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
