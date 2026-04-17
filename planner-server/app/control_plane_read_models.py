from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterable

from sqlmodel import Session, select

from app.deps import CurrentWebUser
from app.inspection_reporting import latest_reporting_summaries, load_reporting_state
from app.mission_delivery import build_artifact_map, extract_failure_reason
from app.models import (
    AuditEvent,
    DispatchRecord,
    Flight,
    FlightEvent,
    InspectionReport,
    InspectionRoute,
    InspectionSchedule,
    InspectionTemplate,
    Mission,
    MissionArtifact,
    Organization,
    Site,
    TelemetryBatch,
)
from app.web_dto import (
    AlertCenterItemDto,
    ControlPlaneAlertSummaryDto,
    ControlPlaneDashboardDto,
    MissionExecutionSummaryDto,
)
from app.web_scope import apply_org_read_scope


STALE_TELEMETRY_SECONDS = 90
LOW_BATTERY_THRESHOLD = 25
BRIDGE_ALERT_EVENT = "BRIDGE_ALERT"
SUPPORT_QUEUE_ACTIONS = [
    "support.queue.claimed",
    "support.queue.acknowledged",
    "support.queue.resolved",
    "support.queue.released",
]
BASE_MISSION_ARTIFACT_NAMES = {"mission.kmz", "mission_meta.json", "inspection_report.html"}


def build_mission_execution_summary(session: Session, mission: Mission) -> MissionExecutionSummaryDto | None:
    return build_execution_summary_map(session, [mission]).get(mission.id)


def build_execution_summary_map(
    session: Session,
    missions: Iterable[Mission],
) -> dict[str, MissionExecutionSummaryDto]:
    mission_list = [mission for mission in missions if mission.organization_id is not None]
    mission_ids = [mission.id for mission in mission_list]
    if not mission_ids:
        return {}

    artifact_map = build_artifact_map(session, mission_ids)
    report_map, event_map, _ = load_reporting_state(session, mission_ids)
    dispatch_map = _latest_dispatches_by_mission(session, mission_ids)
    flight_map = _latest_flights_by_mission(session, mission_ids)
    telemetry_batch_map = _latest_telemetry_batches(session, [flight.id for flight in flight_map.values()])

    summaries: dict[str, MissionExecutionSummaryDto] = {}
    for mission in mission_list:
        dispatch = dispatch_map.get(mission.id)
        flight = flight_map.get(mission.id)
        latest_batch = telemetry_batch_map.get(flight.id) if flight is not None else None
        latest_telemetry_at = (
            _ensure_utc(latest_batch.last_timestamp)
            if latest_batch is not None
            else _ensure_utc(flight.last_telemetry_at) if flight is not None else None
        )
        report = report_map.get(mission.id)
        failure_reason = None
        if report is not None and report.status == "failed":
            failure_reason = report.summary
        if not failure_reason and mission.status == "failed":
            failure_reason = extract_failure_reason(mission.response_json)
        if not failure_reason and dispatch is not None and dispatch.status == "failed":
            failure_reason = dispatch.note or "Dispatch failed before field execution."

        summaries[mission.id] = MissionExecutionSummaryDto(
            missionId=mission.id,
            phase=_execution_phase(mission=mission, report=report, dispatch=dispatch),
            telemetryFreshness=_telemetry_freshness(latest_telemetry_at),
            lastTelemetryAt=latest_telemetry_at,
            lastImageryAt=_latest_imagery_at(artifact_map.get(mission.id, [])),
            reportStatus=report.status if report is not None else "not_started",
            eventCount=len(event_map.get(mission.id, [])),
            failureReason=failure_reason,
        )
    return summaries


def build_control_plane_alerts(
    session: Session,
    current_user: CurrentWebUser,
) -> list[AlertCenterItemDto]:
    missions = session.exec(
        apply_org_read_scope(
            select(Mission).where(Mission.organization_id.is_not(None)),
            Mission.organization_id,
            current_user,
        ).order_by(Mission.created_at.desc())
    ).all()
    mission_ids = [mission.id for mission in missions]
    if not mission_ids:
        return []

    report_map, _, _ = load_reporting_state(session, mission_ids)
    dispatch_map = _latest_dispatches_by_mission(session, mission_ids)
    schedule_ids = [dispatch.schedule_id for dispatch in dispatch_map.values() if dispatch.schedule_id]
    schedule_map = _schedule_map(session, schedule_ids)
    flight_map = _latest_flights_by_mission(session, mission_ids)
    telemetry_batch_map = _latest_telemetry_batches(session, [flight.id for flight in flight_map.values()])
    organization_names = _organization_names(session, [mission.organization_id for mission in missions if mission.organization_id])
    site_names = _site_names(session, [mission.site_id for mission in missions if mission.site_id])
    execution_map = build_execution_summary_map(session, missions)

    alerts: list[AlertCenterItemDto] = []
    for mission in missions:
        organization_name = organization_names.get(mission.organization_id or "")
        site_name = site_names.get(mission.site_id) if mission.site_id else None
        report = report_map.get(mission.id)
        dispatch = dispatch_map.get(mission.id)
        schedule = schedule_map.get(dispatch.schedule_id) if dispatch and dispatch.schedule_id else None
        execution_summary = execution_map.get(mission.id)

        if mission.status == "failed":
            alert_id = f"mission-failed-{mission.id}"
            alerts.append(
                AlertCenterItemDto(
                    alertId=alert_id,
                    category="mission_failed",
                    severity="critical",
                    organizationId=mission.organization_id or "",
                    organizationName=organization_name,
                    missionId=mission.id,
                    missionName=mission.mission_name,
                    siteId=mission.site_id,
                    siteName=site_name,
                    title="任務失敗",
                    summary=extract_failure_reason(mission.response_json) or f"{mission.mission_name} 發生任務級失敗。",
                    recommendedNextStep="檢查 mission request、response 與 artifact 狀態，確認是規劃、派工還是報表流程失敗。",
                    status=_support_workflow_state(session, alert_id),
                    lastObservedAt=_ensure_utc(mission.created_at),
                )
            )

        if report is not None and report.status == "failed":
            alert_id = f"report-failed-{report.id}"
            observed_at = _ensure_utc(report.generated_at or report.updated_at or report.created_at)
            alerts.append(
                AlertCenterItemDto(
                    alertId=alert_id,
                    category="report_generation_failed",
                    severity="critical",
                    organizationId=mission.organization_id or "",
                    organizationName=organization_name,
                    missionId=mission.id,
                    missionName=mission.mission_name,
                    siteId=mission.site_id,
                    siteName=site_name,
                    title="報表產生失敗",
                    summary=report.summary or "報表流程沒有產出可用的 inspection report artifact。",
                    recommendedNextStep="打開任務詳情，確認 evidence 與交付檔案是否完整，再決定是否重新產生 demo analysis。",
                    status=_support_workflow_state(session, alert_id),
                    lastObservedAt=observed_at,
                )
            )

        dispatch_alert = _dispatch_blocked_alert(
            session=session,
            mission=mission,
            organization_name=organization_name,
            site_name=site_name,
            dispatch=dispatch,
            schedule=schedule,
            execution_summary=execution_summary,
        )
        if dispatch_alert is not None:
            alerts.append(dispatch_alert)

    for mission_id, flight in flight_map.items():
        mission = next((candidate for candidate in missions if candidate.id == mission_id), None)
        if mission is None:
            continue
        organization_name = organization_names.get(mission.organization_id or "")
        site_name = site_names.get(mission.site_id) if mission.site_id else None
        latest_batch = telemetry_batch_map.get(flight.id)
        latest_sample = latest_batch.payload_json[-1] if latest_batch and latest_batch.payload_json else None
        latest_telemetry_at = (
            _ensure_utc(latest_batch.last_timestamp)
            if latest_batch is not None
            else _ensure_utc(flight.last_telemetry_at)
        )

        battery_pct = int(latest_sample.get("batteryPct", 0)) if isinstance(latest_sample, dict) else None
        if battery_pct is not None and battery_pct < LOW_BATTERY_THRESHOLD:
            alert_id = f"battery-{flight.id}"
            alerts.append(
                AlertCenterItemDto(
                    alertId=alert_id,
                    category="battery_low",
                    severity="warning",
                    organizationId=mission.organization_id or "",
                    organizationName=organization_name,
                    missionId=mission.id,
                    missionName=mission.mission_name,
                    siteId=mission.site_id,
                    siteName=site_name,
                    title="電量偏低",
                    summary=f"{mission.mission_name} 最新回報電量為 {battery_pct}%。",
                    recommendedNextStep="打開 Live Ops 確認 telemetry、lease 與 observer 狀態，必要時將任務標記為 HOLD 或失敗。",
                    status=_support_workflow_state(session, alert_id),
                    lastObservedAt=_telemetry_timestamp(latest_sample) or latest_telemetry_at,
                )
            )

        if _telemetry_freshness(latest_telemetry_at) == "stale" and latest_telemetry_at is not None:
            alert_id = f"telemetry-stale-{flight.id}"
            alerts.append(
                AlertCenterItemDto(
                    alertId=alert_id,
                    category="telemetry_stale",
                    severity="critical",
                    organizationId=mission.organization_id or "",
                    organizationName=organization_name,
                    missionId=mission.id,
                    missionName=mission.mission_name,
                    siteId=mission.site_id,
                    siteName=site_name,
                    title="Telemetry 已過期",
                    summary=f"{mission.mission_name} 已超過 {STALE_TELEMETRY_SECONDS} 秒未收到新 telemetry。",
                    recommendedNextStep="在 Live Ops 檢查 uplink 與 observer 狀態，並確認任務是否需要轉為 blocked 或 failed。",
                    status=_support_workflow_state(session, alert_id),
                    lastObservedAt=latest_telemetry_at,
                )
            )

        bridge_alert = _latest_bridge_alert(session, flight.id)
        if bridge_alert is not None:
            payload = bridge_alert.payload_json
            alert_id = f"bridge-alert-{bridge_alert.id}"
            alerts.append(
                AlertCenterItemDto(
                    alertId=alert_id,
                    category="bridge_alert",
                    severity=_coerce_support_severity(payload.get("severity")),
                    organizationId=mission.organization_id or "",
                    organizationName=organization_name,
                    missionId=mission.id,
                    missionName=mission.mission_name,
                    siteId=mission.site_id,
                    siteName=site_name,
                    title=f"Bridge alert: {payload.get('code', 'bridge_alert')}",
                    summary=str(payload.get("summary") or "Android bridge 回報異常，需要營運側檢查 uplink、video 與 observer。"),
                    recommendedNextStep="開啟 Live Ops 檢查 telemetry freshness、video 狀態與 observer readiness，再決定是否需要中止任務。",
                    status=_support_workflow_state(session, alert_id),
                    lastObservedAt=_ensure_utc(bridge_alert.event_timestamp),
                )
            )

    alerts.sort(
        key=lambda item: item.lastObservedAt or datetime.fromtimestamp(0, tz=timezone.utc),
        reverse=True,
    )
    return alerts


def build_control_plane_dashboard(
    session: Session,
    current_user: CurrentWebUser,
) -> ControlPlaneDashboardDto:
    sites = session.exec(
        apply_org_read_scope(select(Site), Site.organization_id, current_user)
    ).all()
    routes = session.exec(
        apply_org_read_scope(select(InspectionRoute), InspectionRoute.organization_id, current_user)
    ).all()
    templates = session.exec(
        apply_org_read_scope(select(InspectionTemplate), InspectionTemplate.organization_id, current_user)
    ).all()
    missions = session.exec(
        apply_org_read_scope(
            select(Mission).where(Mission.organization_id.is_not(None)),
            Mission.organization_id,
            current_user,
        ).order_by(Mission.created_at.desc())
    ).all()
    mission_ids = [mission.id for mission in missions]
    dispatches = list(_latest_dispatches_by_mission(session, mission_ids).values())
    execution_summaries = build_execution_summary_map(session, missions)
    alerts = build_control_plane_alerts(session, current_user)
    latest_report_summary, latest_event_summary = latest_reporting_summaries(session, mission_ids)

    open_alerts = [item for item in alerts if item.status != "resolved"]
    recent_execution_summaries = [
        execution_summaries[mission.id]
        for mission in missions
        if mission.id in execution_summaries
    ][:5]

    return ControlPlaneDashboardDto(
        siteCount=len(sites),
        activeRouteCount=len(routes),
        activeTemplateCount=len(templates),
        scheduledMissionCount=sum(
            1 for summary in execution_summaries.values() if summary.phase in {"scheduled", "dispatched"}
        ),
        dispatchPendingCount=sum(1 for dispatch in dispatches if dispatch.status in {"queued", "assigned", "sent"}),
        runningMissionCount=sum(1 for summary in execution_summaries.values() if summary.phase == "running"),
        failedMissionCount=sum(1 for summary in execution_summaries.values() if summary.phase == "failed"),
        latestReportSummary=latest_report_summary,
        latestEventSummary=latest_event_summary,
        alertSummary=ControlPlaneAlertSummaryDto(
            openCount=len(open_alerts),
            criticalCount=sum(1 for item in open_alerts if item.severity == "critical"),
            warningCount=sum(1 for item in open_alerts if item.severity == "warning"),
        ),
        recentAlerts=alerts[:5],
        recentExecutionSummaries=recent_execution_summaries,
    )


def _execution_phase(
    *,
    mission: Mission,
    report: InspectionReport | None,
    dispatch: DispatchRecord | None,
) -> str:
    if report is not None and report.status == "ready":
        return "report_ready"
    if mission.status == "failed" or (report is not None and report.status == "failed"):
        return "failed"
    if dispatch is not None:
        if dispatch.status == "queued":
            return "scheduled"
        if dispatch.status in {"assigned", "sent"}:
            return "dispatched"
        if dispatch.status == "accepted":
            return "running"
        if dispatch.status == "completed":
            return "completed"
        if dispatch.status == "failed":
            return "failed"
    if mission.status in {"scheduled", "dispatched", "running", "completed", "report_ready"}:
        return mission.status
    return "draft"


def _latest_dispatches_by_mission(session: Session, mission_ids: list[str]) -> dict[str, DispatchRecord]:
    if not mission_ids:
        return {}
    dispatches = session.exec(
        select(DispatchRecord)
        .where(DispatchRecord.mission_id.in_(mission_ids))
        .order_by(DispatchRecord.updated_at.desc(), DispatchRecord.dispatched_at.desc())
    ).all()
    dispatch_map: dict[str, DispatchRecord] = {}
    for dispatch in dispatches:
        dispatch_map.setdefault(dispatch.mission_id, dispatch)
    return dispatch_map


def _latest_flights_by_mission(session: Session, mission_ids: list[str]) -> dict[str, Flight]:
    if not mission_ids:
        return {}
    flights = session.exec(
        select(Flight)
        .where(Flight.organization_id.is_not(None), Flight.mission_id.in_(mission_ids))
        .order_by(Flight.updated_at.desc(), Flight.created_at.desc())
    ).all()
    flight_map: dict[str, Flight] = {}
    for flight in flights:
        flight_map.setdefault(flight.mission_id, flight)
    return flight_map


def _latest_telemetry_batches(session: Session, flight_ids: list[str]) -> dict[str, TelemetryBatch]:
    if not flight_ids:
        return {}
    batches = session.exec(
        select(TelemetryBatch)
        .where(TelemetryBatch.flight_id.in_(flight_ids))
        .order_by(TelemetryBatch.last_timestamp.desc())
    ).all()
    batch_map: dict[str, TelemetryBatch] = {}
    for batch in batches:
        batch_map.setdefault(batch.flight_id, batch)
    return batch_map


def _latest_imagery_at(artifacts: list[MissionArtifact]) -> datetime | None:
    timestamps = [
        _ensure_utc(artifact.created_at)
        for artifact in artifacts
        if (
            artifact.content_type.startswith("image/")
            or artifact.artifact_name.endswith((".jpg", ".jpeg", ".png", ".svg"))
        )
        and artifact.artifact_name not in BASE_MISSION_ARTIFACT_NAMES
    ]
    filtered = [timestamp for timestamp in timestamps if timestamp is not None]
    return max(filtered, default=None)


def _telemetry_freshness(last_telemetry_at: datetime | None) -> str:
    age_seconds = _age_seconds(last_telemetry_at)
    if age_seconds is None:
        return "missing"
    if age_seconds > STALE_TELEMETRY_SECONDS:
        return "stale"
    return "fresh"


def _telemetry_timestamp(payload: dict[str, Any] | None) -> datetime | None:
    if not payload:
        return None
    raw = payload.get("timestamp")
    if not raw:
        return None
    return datetime.fromisoformat(str(raw).replace("Z", "+00:00")).astimezone(timezone.utc)


def _age_seconds(timestamp: datetime | None) -> int | None:
    if timestamp is None:
        return None
    safe_timestamp = _ensure_utc(timestamp)
    if safe_timestamp is None:
        return None
    return max(0, int((datetime.now(timezone.utc) - safe_timestamp).total_seconds()))


def _organization_names(session: Session, organization_ids: list[str]) -> dict[str, str]:
    if not organization_ids:
        return {}
    organizations = session.exec(select(Organization).where(Organization.id.in_(organization_ids))).all()
    return {organization.id: organization.name for organization in organizations}


def _site_names(session: Session, site_ids: list[str]) -> dict[str, str]:
    if not site_ids:
        return {}
    sites = session.exec(select(Site).where(Site.id.in_(site_ids))).all()
    return {site.id: site.name for site in sites}


def _schedule_map(session: Session, schedule_ids: list[str]) -> dict[str, InspectionSchedule]:
    if not schedule_ids:
        return {}
    schedules = session.exec(select(InspectionSchedule).where(InspectionSchedule.id.in_(schedule_ids))).all()
    return {schedule.id: schedule for schedule in schedules}


def _support_workflow_state(session: Session, item_id: str) -> str:
    event = session.exec(
        select(AuditEvent)
        .where(
            AuditEvent.target_type == "support_item",
            AuditEvent.target_id == item_id,
            AuditEvent.action.in_(SUPPORT_QUEUE_ACTIONS),
        )
        .order_by(AuditEvent.created_at.desc())
    ).first()
    if event is None:
        return "open"
    state = event.metadata_json.get("state")
    if state in {"open", "claimed", "acknowledged", "resolved"}:
        return state
    if event.action == "support.queue.claimed":
        return "claimed"
    if event.action == "support.queue.acknowledged":
        return "acknowledged"
    if event.action == "support.queue.resolved":
        return "resolved"
    return "open"


def _dispatch_blocked_alert(
    *,
    session: Session,
    mission: Mission,
    organization_name: str | None,
    site_name: str | None,
    dispatch: DispatchRecord | None,
    schedule: InspectionSchedule | None,
    execution_summary: MissionExecutionSummaryDto | None,
) -> AlertCenterItemDto | None:
    if dispatch is not None and dispatch.status == "failed":
        alert_id = f"dispatch-blocked-{dispatch.id}"
        return AlertCenterItemDto(
            alertId=alert_id,
            category="dispatch_blocked",
            severity="critical",
            organizationId=mission.organization_id or "",
            organizationName=organization_name,
            missionId=mission.id,
            missionName=mission.mission_name,
            siteId=mission.site_id,
            siteName=site_name,
            title="派工受阻",
            summary=f"{mission.mission_name} 的 dispatch 狀態為 failed，執行責任尚未成功交接。",
            recommendedNextStep="打開 dispatch workspace，檢查 assignee、execution target 與 handoff note，再決定是否重新派工。",
            status=_support_workflow_state(session, alert_id),
            lastObservedAt=_ensure_utc(dispatch.updated_at),
        )

    if (
        schedule is not None
        and schedule.status in {"paused", "cancelled"}
        and execution_summary is not None
        and execution_summary.phase in {"scheduled", "dispatched", "running"}
    ):
        alert_id = f"dispatch-blocked-schedule-{schedule.id}"
        return AlertCenterItemDto(
            alertId=alert_id,
            category="dispatch_blocked",
            severity="warning",
            organizationId=mission.organization_id or "",
            organizationName=organization_name,
            missionId=mission.id,
            missionName=mission.mission_name,
            siteId=mission.site_id,
            siteName=site_name,
            title="排程狀態阻塞派工",
            summary=f"{mission.mission_name} 綁定的排程目前為 {schedule.status}，但任務仍停留在待派工或執行中的 phase。",
            recommendedNextStep="打開 schedules workspace 檢查 pause/cancel 原因，確認是否需要恢復排程或結束任務。",
            status=_support_workflow_state(session, alert_id),
            lastObservedAt=_ensure_utc(schedule.updated_at),
        )

    return None


def _latest_bridge_alert(session: Session, flight_id: str) -> FlightEvent | None:
    return session.exec(
        select(FlightEvent)
        .where(FlightEvent.flight_id == flight_id, FlightEvent.event_type == BRIDGE_ALERT_EVENT)
        .order_by(FlightEvent.event_timestamp.desc(), FlightEvent.recorded_at.desc())
    ).first()


def _coerce_support_severity(raw: Any) -> str:
    if raw == "critical":
        return "critical"
    if raw == "warning":
        return "warning"
    return "info"


def _ensure_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
