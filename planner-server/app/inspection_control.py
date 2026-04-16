from __future__ import annotations

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


def serialize_route(route: InspectionRoute) -> InspectionRouteDto:
    return InspectionRouteDto(
        routeId=route.id,
        organizationId=route.organization_id,
        siteId=route.site_id,
        name=route.name,
        description=route.description,
        pointCount=len(route.waypoints_json),
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
        createdAt=template.created_at,
        updatedAt=template.updated_at,
    )


def serialize_schedule(schedule: InspectionSchedule) -> InspectionScheduleDto:
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
        createdAt=schedule.created_at,
        updatedAt=schedule.updated_at,
    )


def serialize_dispatch(dispatch: DispatchRecord) -> DispatchRecordDto:
    return DispatchRecordDto(
        dispatchId=dispatch.id,
        missionId=dispatch.mission_id,
        routeId=dispatch.route_id,
        templateId=dispatch.template_id,
        scheduleId=dispatch.schedule_id,
        dispatchedAt=dispatch.dispatched_at,
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
