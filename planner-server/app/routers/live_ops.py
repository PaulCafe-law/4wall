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
STALE_VIDEO_SECONDS = 15
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
    del current_user

    items: list[SupportQueueItemDto] = []

    failed_missions = session.exec(
        select(Mission)
        .where(Mission.organization_id.is_not(None), Mission.status == "failed")
        .order_by(Mission.created_at.desc())
    ).all()
    for mission in failed_missions:
        if mission.organization_id is None:
            continue
        context = _support_context(session, organization_id=mission.organization_id, mission=mission)
        created_at = _ensure_utc(mission.created_at) or mission.created_at
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
                    f"{mission.mission_name} 已經進入 failed。"
                    "請先確認 mission request、交付狀態與失敗原因，再決定是重送還是人工處理。"
                ),
                recommendedNextStep="打開任務明細，確認 mission request、交付狀態與 artifacts，再決定是否重送。",
                createdAt=created_at,
                lastObservedAt=created_at,
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
                    title="電量偏低",
                    summary=(
                        f"最新電量僅剩 {summary.latestTelemetry.batteryPct}%。"
                        "若飛行仍在進行，請先確認現場是否需要 HOLD 或返航。"
                    ),
                    recommendedNextStep="先看 Live Ops 的 lease、視訊與 observer 狀態，再決定是否請現場改成 HOLD 或返航。",
                    createdAt=summary.latestTelemetry.timestamp,
                    lastObservedAt=summary.latestTelemetry.timestamp,
                )
            )

        stale_observed_at = _ensure_utc(summary.lastTelemetryAt)
        if summary.telemetryFreshness == "stale" and stale_observed_at is not None:
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
                    title="遙測已過時",
                    summary=(
                        f"最新遙測已超過 {STALE_TELEMETRY_SECONDS} 秒未更新。"
                        "目前 web 只能降級成 monitor-only。"
                    ),
                    recommendedNextStep="先確認 bridge uplink 與 observer 狀態；若現場仍在飛，優先用 Live Ops 確認 lease 與視訊是否同步失效。",
                    createdAt=stale_observed_at,
                    lastObservedAt=stale_observed_at,
                )
            )

        bridge_alert = _latest_bridge_alert(session, flight.id)
        if bridge_alert is not None:
            payload = bridge_alert.payload_json
            severity = _coerce_support_severity(payload.get("severity"))
            code = str(payload.get("code", "bridge_alert"))
            human_summary = str(
                payload.get("summary")
                or "Android bridge 回報了新的告警，請先確認 uplink、lease、video 與 observer 狀態。"
            )
            observed_at = _ensure_utc(bridge_alert.event_timestamp) or bridge_alert.event_timestamp
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
                    title=f"Bridge 告警: {code}",
                    summary=human_summary,
                    recommendedNextStep="打開 Live Ops，確認 lease、telemetry freshness、video 狀態與 observer 是否仍可支援現場處置。",
                    createdAt=observed_at,
                    lastObservedAt=observed_at,
                )
            )

    return sorted(items, key=lambda item: _ensure_utc(item.lastObservedAt or item.createdAt) or item.createdAt, reverse=True)


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
    latest_telemetry_at = _ensure_utc(latest_batch.last_timestamp) if latest_batch is not None else _ensure_utc(flight.last_telemetry_at)
    telemetry_age_seconds = _age_seconds(latest_telemetry_at)
    video = _video_channel(session, flight.id)

    return LiveFlightSummaryDto(
        flightId=flight.id,
        organizationId=flight.organization_id or "",
        missionId=flight.mission_id,
        missionName=mission.mission_name if mission is not None else flight.mission_id,
        siteId=mission.site_id if mission is not None else None,
        siteName=site.name if site is not None else None,
        lastEventAt=flight.last_event_at,
        lastTelemetryAt=latest_telemetry_at,
        latestTelemetry=latest_sample,
        telemetryFreshness=_telemetry_freshness(latest_sample, telemetry_age_seconds),
        telemetryAgeSeconds=telemetry_age_seconds,
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


def _age_seconds(value: datetime | None) -> int | None:
    if value is None:
        return None
    return max(int((datetime.now(timezone.utc) - value).total_seconds()), 0)


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
