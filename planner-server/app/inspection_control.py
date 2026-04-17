from __future__ import annotations

import math
from uuid import uuid4

from sqlmodel import Session, select

from app.models import DispatchRecord, InspectionRoute, InspectionSchedule, InspectionTemplate, Mission
from app.web_dto import (
    DispatchRecordDto,
    InspectionAlertRuleDto,
    InspectionEventDto,
    InspectionReportSummaryDto,
    InspectionRouteDto,
    InspectionScheduleDto,
    InspectionTemplateDto,
    InspectionWaypointDto,
    SiteRouteSummaryDto,
    SiteTemplateSummaryDto,
)


def normalize_alert_rules(alert_rules: list[dict] | None) -> list[dict]:
    normalized: list[dict] = []
    for alert_rule in alert_rules or []:
        normalized.append(
            {
                "ruleId": alert_rule.get("ruleId") or uuid4().hex,
                "kind": alert_rule["kind"],
                "enabled": bool(alert_rule.get("enabled", True)),
                "threshold": alert_rule.get("threshold"),
                "note": alert_rule.get("note"),
            }
        )
    return normalized


def _preview_polyline(waypoints: list[dict]) -> list[dict[str, float]]:
    preview: list[dict[str, float]] = []
    for waypoint in waypoints:
        lat = waypoint.get("lat")
        lng = waypoint.get("lng")
        if lat is None or lng is None:
            continue
        preview.append({"lat": float(lat), "lng": float(lng)})
    return preview


def _estimate_route_duration_seconds(waypoints: list[dict], planning_parameters: dict) -> int:
    if len(waypoints) < 2:
        return sum(int(waypoint.get("dwellSeconds") or 0) for waypoint in waypoints)

    speed_mps = (
        planning_parameters.get("defaultSpeedMps")
        or planning_parameters.get("defaultSpeedMetersPerSecond")
        or 4
    )
    speed_mps = max(float(speed_mps), 0.5)
    earth_radius_m = 6_371_000

    def distance_m(a: dict, b: dict) -> float:
        lat_1 = math.radians(float(a["lat"]))
        lng_1 = math.radians(float(a["lng"]))
        lat_2 = math.radians(float(b["lat"]))
        lng_2 = math.radians(float(b["lng"]))
        delta_lat = lat_2 - lat_1
        delta_lng = lng_2 - lng_1
        hav = (
            math.sin(delta_lat / 2) ** 2
            + math.cos(lat_1) * math.cos(lat_2) * math.sin(delta_lng / 2) ** 2
        )
        return 2 * earth_radius_m * math.asin(math.sqrt(hav))

    transit_seconds = sum(distance_m(current, nxt) / speed_mps for current, nxt in zip(waypoints, waypoints[1:]))
    dwell_seconds = sum(int(waypoint.get("dwellSeconds") or 0) for waypoint in waypoints)
    return int(round(transit_seconds + dwell_seconds))


def serialize_route(route: InspectionRoute) -> InspectionRouteDto:
    estimated_duration = _estimate_route_duration_seconds(
        route.waypoints_json,
        route.planning_parameters_json,
    )
    return InspectionRouteDto(
        routeId=route.id,
        organizationId=route.organization_id,
        siteId=route.site_id,
        name=route.name,
        description=route.description,
        version=int(route.planning_parameters_json.get("routeVersion") or 1),
        pointCount=len(route.waypoints_json),
        previewPolyline=_preview_polyline(route.waypoints_json),
        estimatedDurationSec=estimated_duration,
        waypoints=[InspectionWaypointDto.model_validate(waypoint) for waypoint in route.waypoints_json],
        planningParameters=route.planning_parameters_json,
        createdAt=route.created_at,
        updatedAt=route.updated_at,
    )


def serialize_template(template: InspectionTemplate) -> InspectionTemplateDto:
    return InspectionTemplateDto(
        templateId=template.id,
        organizationId=template.organization_id,
        siteId=template.site_id,
        routeId=template.route_id,
        name=template.name,
        description=template.description,
        inspectionProfile=template.inspection_profile_json,
        alertRules=[InspectionAlertRuleDto.model_validate(alert_rule) for alert_rule in template.alert_rules_json],
        evidencePolicy=str(template.inspection_profile_json.get("evidencePolicy") or "capture_key_frames"),
        reportMode=str(template.inspection_profile_json.get("reportMode") or "html_report"),
        reviewMode=str(template.inspection_profile_json.get("reviewMode") or "operator_review"),
        createdAt=template.created_at,
        updatedAt=template.updated_at,
    )


def serialize_route_summary(route: InspectionRoute) -> SiteRouteSummaryDto:
    return SiteRouteSummaryDto(
        routeId=route.id,
        name=route.name,
        version=int(route.planning_parameters_json.get("routeVersion") or 1),
        pointCount=len(route.waypoints_json),
        estimatedDurationSec=_estimate_route_duration_seconds(
            route.waypoints_json,
            route.planning_parameters_json,
        ),
        updatedAt=route.updated_at,
    )


def serialize_template_summary(template: InspectionTemplate) -> SiteTemplateSummaryDto:
    return SiteTemplateSummaryDto(
        templateId=template.id,
        routeId=template.route_id,
        name=template.name,
        evidencePolicy=str(template.inspection_profile_json.get("evidencePolicy") or "capture_key_frames"),
        reportMode=str(template.inspection_profile_json.get("reportMode") or "html_report"),
        reviewMode=str(template.inspection_profile_json.get("reviewMode") or "operator_review"),
        updatedAt=template.updated_at,
    )


def serialize_schedule(schedule: InspectionSchedule) -> InspectionScheduleDto:
    next_run_at = schedule.planned_at if schedule.status == "scheduled" else None
    last_run_at = schedule.updated_at if schedule.status in {"completed", "cancelled"} else None
    pause_reason = "Paused from control-plane workspace" if schedule.status == "paused" else None
    if schedule.status == "completed":
        last_outcome = "completed"
    elif schedule.status == "cancelled":
        last_outcome = "cancelled"
    elif schedule.status == "paused":
        last_outcome = "paused"
    else:
        last_outcome = "scheduled_for_execution"

    return InspectionScheduleDto(
        scheduleId=schedule.id,
        organizationId=schedule.organization_id,
        siteId=schedule.site_id,
        routeId=schedule.route_id,
        templateId=schedule.template_id,
        plannedAt=schedule.planned_at,
        recurrence=schedule.recurrence,
        status=schedule.status,
        alertRules=[InspectionAlertRuleDto.model_validate(alert_rule) for alert_rule in schedule.alert_rules_json],
        nextRunAt=next_run_at,
        lastRunAt=last_run_at,
        pauseReason=pause_reason,
        lastOutcome=last_outcome,
        createdAt=schedule.created_at,
        updatedAt=schedule.updated_at,
    )


def serialize_dispatch(dispatch: DispatchRecord) -> DispatchRecordDto:
    accepted_at = dispatch.updated_at if dispatch.status == "accepted" else None
    closed_at = dispatch.updated_at if dispatch.status == "failed" else None
    return DispatchRecordDto(
        dispatchId=dispatch.id,
        missionId=dispatch.mission_id,
        routeId=dispatch.route_id,
        templateId=dispatch.template_id,
        scheduleId=dispatch.schedule_id,
        dispatchedAt=dispatch.dispatched_at,
        acceptedAt=accepted_at,
        closedAt=closed_at,
        dispatchedByUserId=dispatch.dispatched_by_user_id,
        assignee=dispatch.assignee,
        executionTarget=dispatch.execution_target,
        status=dispatch.status,
        note=dispatch.note,
    )


def load_mission_control_plane(
    session: Session,
    mission: Mission,
) -> tuple[InspectionRouteDto | None, InspectionTemplateDto | None, InspectionScheduleDto | None, DispatchRecordDto | None]:
    dispatch = session.exec(
        select(DispatchRecord)
        .where(DispatchRecord.mission_id == mission.id)
        .order_by(DispatchRecord.updated_at.desc(), DispatchRecord.dispatched_at.desc())
    ).first()
    if dispatch is None:
        return None, None, None, None

    route = session.get(InspectionRoute, dispatch.route_id) if dispatch.route_id else None
    template = session.get(InspectionTemplate, dispatch.template_id) if dispatch.template_id else None
    schedule = session.get(InspectionSchedule, dispatch.schedule_id) if dispatch.schedule_id else None

    return (
        serialize_route(route) if route is not None else None,
        serialize_template(template) if template is not None else None,
        serialize_schedule(schedule) if schedule is not None else None,
        serialize_dispatch(dispatch),
    )


def empty_event_summary() -> list[InspectionEventDto]:
    return []


def empty_report_summary() -> InspectionReportSummaryDto | None:
    return None
