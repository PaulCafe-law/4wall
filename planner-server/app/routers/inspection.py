from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlmodel import Session, select

from app.audit import record_audit
from app.deps import CurrentWebUser, get_current_web_user, get_session
from app.control_plane_read_models import build_control_plane_alerts, build_control_plane_dashboard
from app.inspection_control import (
    mark_schedule_dispatched,
    mission_status_for_dispatch,
    normalize_alert_rules,
    normalize_dispatch_state,
    normalize_schedule_state,
    serialize_dispatch,
    serialize_route,
    serialize_schedule,
    serialize_template,
)
from app.models import DispatchRecord, InspectionRoute, InspectionSchedule, InspectionTemplate, Mission, Site
from app.web_dto import (
    AlertCenterItemDto,
    ControlPlaneDashboardDto,
    CreateDispatchRequestDto,
    CreateInspectionRouteRequestDto,
    CreateInspectionScheduleRequestDto,
    CreateInspectionTemplateRequestDto,
    DispatchRecordDto,
    InspectionRouteDto,
    InspectionScheduleDto,
    InspectionTemplateDto,
    UpdateDispatchRequestDto,
    UpdateInspectionRouteRequestDto,
    UpdateInspectionScheduleRequestDto,
    UpdateInspectionTemplateRequestDto,
)
from app.web_scope import apply_org_read_scope, ensure_org_read_access, ensure_org_write_access


router = APIRouter(tags=["inspection"])


@router.get("/v1/control-plane/dashboard", response_model=ControlPlaneDashboardDto)
def get_control_plane_dashboard(
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> ControlPlaneDashboardDto:
    return build_control_plane_dashboard(session, current_user)


@router.get("/v1/control-plane/alerts", response_model=list[AlertCenterItemDto])
def list_control_plane_alerts(
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> list[AlertCenterItemDto]:
    return build_control_plane_alerts(session, current_user)


@router.get("/v1/inspection/routes", response_model=list[InspectionRouteDto])
def list_routes(
    organizationId: str | None = None,
    siteId: str | None = None,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> list[InspectionRouteDto]:
    statement = apply_org_read_scope(select(InspectionRoute), InspectionRoute.organization_id, current_user)
    if organizationId is not None:
        statement = statement.where(InspectionRoute.organization_id == organizationId)
    if siteId is not None:
        statement = statement.where(InspectionRoute.site_id == siteId)
    routes = session.exec(statement.order_by(InspectionRoute.updated_at.desc())).all()
    return [serialize_route(route) for route in routes]


@router.post("/v1/inspection/routes", response_model=InspectionRouteDto)
def create_route(
    request: CreateInspectionRouteRequestDto,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> InspectionRouteDto:
    ensure_org_write_access(session, current_user, request.organizationId, action="inspection.route.create_access")
    site = _require_site(session, request.siteId, organization_id=request.organizationId)
    route = InspectionRoute(
        organization_id=request.organizationId,
        site_id=site.id,
        name=request.name,
        description=request.description,
        waypoints_json=[waypoint.model_dump(mode="json") for waypoint in request.waypoints],
        planning_parameters_json=request.planningParameters,
        created_by_user_id=current_user.user.id,
        updated_by_user_id=current_user.user.id,
    )
    session.add(route)
    session.flush()
    record_audit(
        session,
        action="inspection.route.created",
        organization_id=route.organization_id,
        actor_user_id=current_user.user.id,
        target_type="inspection_route",
        target_id=route.id,
        metadata={"siteId": route.site_id},
    )
    session.commit()
    return serialize_route(route)


@router.patch("/v1/inspection/routes/{route_id}", response_model=InspectionRouteDto)
def patch_route(
    route_id: str,
    request: UpdateInspectionRouteRequestDto,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> InspectionRouteDto:
    route = session.get(InspectionRoute, route_id)
    if route is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="inspection_route_not_found")
    ensure_org_write_access(session, current_user, route.organization_id, action="inspection.route.update_access")
    if request.name is not None:
        route.name = request.name
    if request.description is not None:
        route.description = request.description
    if request.waypoints is not None:
        route.waypoints_json = [waypoint.model_dump(mode="json") for waypoint in request.waypoints]
    if request.planningParameters is not None:
        route.planning_parameters_json = request.planningParameters
    route.updated_by_user_id = current_user.user.id
    route.updated_at = datetime.now(timezone.utc)
    session.add(route)
    record_audit(
        session,
        action="inspection.route.updated",
        organization_id=route.organization_id,
        actor_user_id=current_user.user.id,
        target_type="inspection_route",
        target_id=route.id,
    )
    session.commit()
    return serialize_route(route)


@router.get("/v1/inspection/templates", response_model=list[InspectionTemplateDto])
def list_templates(
    organizationId: str | None = None,
    siteId: str | None = None,
    routeId: str | None = None,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> list[InspectionTemplateDto]:
    statement = apply_org_read_scope(select(InspectionTemplate), InspectionTemplate.organization_id, current_user)
    if organizationId is not None:
        statement = statement.where(InspectionTemplate.organization_id == organizationId)
    if siteId is not None:
        statement = statement.where(InspectionTemplate.site_id == siteId)
    if routeId is not None:
        statement = statement.where(InspectionTemplate.route_id == routeId)
    templates = session.exec(statement.order_by(InspectionTemplate.updated_at.desc())).all()
    return [serialize_template(template) for template in templates]


@router.post("/v1/inspection/templates", response_model=InspectionTemplateDto)
def create_template(
    request: CreateInspectionTemplateRequestDto,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> InspectionTemplateDto:
    ensure_org_write_access(session, current_user, request.organizationId, action="inspection.template.create_access")
    site = _require_site(session, request.siteId, organization_id=request.organizationId)
    if request.routeId is not None:
        _require_route(session, request.routeId, organization_id=request.organizationId, site_id=site.id)
    template = InspectionTemplate(
        organization_id=request.organizationId,
        site_id=site.id,
        route_id=request.routeId,
        name=request.name,
        description=request.description,
        inspection_profile_json=request.inspectionProfile,
        alert_rules_json=normalize_alert_rules([alert_rule.model_dump(mode="json") for alert_rule in request.alertRules]),
        created_by_user_id=current_user.user.id,
        updated_by_user_id=current_user.user.id,
    )
    session.add(template)
    session.flush()
    record_audit(
        session,
        action="inspection.template.created",
        organization_id=template.organization_id,
        actor_user_id=current_user.user.id,
        target_type="inspection_template",
        target_id=template.id,
        metadata={"siteId": template.site_id, "routeId": template.route_id},
    )
    session.commit()
    return serialize_template(template)


@router.patch("/v1/inspection/templates/{template_id}", response_model=InspectionTemplateDto)
def patch_template(
    template_id: str,
    request: UpdateInspectionTemplateRequestDto,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> InspectionTemplateDto:
    template = session.get(InspectionTemplate, template_id)
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="inspection_template_not_found")
    ensure_org_write_access(session, current_user, template.organization_id, action="inspection.template.update_access")
    if request.routeId is not None:
        _require_route(session, request.routeId, organization_id=template.organization_id, site_id=template.site_id)
        template.route_id = request.routeId
    if request.name is not None:
        template.name = request.name
    if request.description is not None:
        template.description = request.description
    if request.inspectionProfile is not None:
        template.inspection_profile_json = request.inspectionProfile
    if request.alertRules is not None:
        template.alert_rules_json = normalize_alert_rules([alert_rule.model_dump(mode="json") for alert_rule in request.alertRules])
    template.updated_by_user_id = current_user.user.id
    template.updated_at = datetime.now(timezone.utc)
    session.add(template)
    record_audit(
        session,
        action="inspection.template.updated",
        organization_id=template.organization_id,
        actor_user_id=current_user.user.id,
        target_type="inspection_template",
        target_id=template.id,
    )
    session.commit()
    return serialize_template(template)


@router.get("/v1/inspection/schedules", response_model=list[InspectionScheduleDto])
def list_schedules(
    organizationId: str | None = None,
    siteId: str | None = None,
    routeId: str | None = None,
    templateId: str | None = None,
    statusFilter: str | None = Query(default=None, alias="status"),
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> list[InspectionScheduleDto]:
    statement = apply_org_read_scope(select(InspectionSchedule), InspectionSchedule.organization_id, current_user)
    if organizationId is not None:
        statement = statement.where(InspectionSchedule.organization_id == organizationId)
    if siteId is not None:
        statement = statement.where(InspectionSchedule.site_id == siteId)
    if routeId is not None:
        statement = statement.where(InspectionSchedule.route_id == routeId)
    if templateId is not None:
        statement = statement.where(InspectionSchedule.template_id == templateId)
    if statusFilter is not None:
        statement = statement.where(InspectionSchedule.status == statusFilter)
    schedules = session.exec(statement.order_by(InspectionSchedule.updated_at.desc())).all()
    return [serialize_schedule(schedule) for schedule in schedules]


@router.post("/v1/inspection/schedules", response_model=InspectionScheduleDto)
def create_schedule(
    request: CreateInspectionScheduleRequestDto,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> InspectionScheduleDto:
    ensure_org_write_access(session, current_user, request.organizationId, action="inspection.schedule.create_access")
    site = _require_site(session, request.siteId, organization_id=request.organizationId)
    _validate_schedule_links(
        session,
        organization_id=request.organizationId,
        site_id=site.id,
        route_id=request.routeId,
        template_id=request.templateId,
    )
    schedule = InspectionSchedule(
        organization_id=request.organizationId,
        site_id=site.id,
        route_id=request.routeId,
        template_id=request.templateId,
        planned_at=request.plannedAt,
        recurrence=request.recurrence,
        status=request.status,
        alert_rules_json=normalize_alert_rules([alert_rule.model_dump(mode="json") for alert_rule in request.alertRules]),
        created_by_user_id=current_user.user.id,
        updated_by_user_id=current_user.user.id,
    )
    normalize_schedule_state(schedule)
    session.add(schedule)
    session.flush()
    record_audit(
        session,
        action="inspection.schedule.created",
        organization_id=schedule.organization_id,
        actor_user_id=current_user.user.id,
        target_type="inspection_schedule",
        target_id=schedule.id,
        metadata={"siteId": schedule.site_id, "routeId": schedule.route_id, "templateId": schedule.template_id},
    )
    session.commit()
    return serialize_schedule(schedule)


@router.patch("/v1/inspection/schedules/{schedule_id}", response_model=InspectionScheduleDto)
def patch_schedule(
    schedule_id: str,
    request: UpdateInspectionScheduleRequestDto,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> InspectionScheduleDto:
    schedule = session.get(InspectionSchedule, schedule_id)
    if schedule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="inspection_schedule_not_found")
    ensure_org_write_access(session, current_user, schedule.organization_id, action="inspection.schedule.update_access")

    next_route_id = request.routeId if request.routeId is not None else schedule.route_id
    next_template_id = request.templateId if request.templateId is not None else schedule.template_id
    _validate_schedule_links(
        session,
        organization_id=schedule.organization_id,
        site_id=schedule.site_id,
        route_id=next_route_id,
        template_id=next_template_id,
    )

    if request.routeId is not None:
        schedule.route_id = request.routeId
    if request.templateId is not None:
        schedule.template_id = request.templateId
    if request.plannedAt is not None:
        schedule.planned_at = request.plannedAt
    if request.recurrence is not None:
        schedule.recurrence = request.recurrence
    previous_status = schedule.status
    if request.status is not None:
        schedule.status = request.status
    if request.pauseReason is not None:
        schedule.pause_reason = request.pauseReason or None
    if request.alertRules is not None:
        schedule.alert_rules_json = normalize_alert_rules([alert_rule.model_dump(mode="json") for alert_rule in request.alertRules])
    schedule.updated_by_user_id = current_user.user.id
    normalize_schedule_state(schedule)
    session.add(schedule)
    record_audit(
        session,
        action="inspection.schedule.updated",
        organization_id=schedule.organization_id,
        actor_user_id=current_user.user.id,
        target_type="inspection_schedule",
        target_id=schedule.id,
        metadata={
            "previousStatus": previous_status,
            "status": schedule.status,
            "pauseReason": schedule.pause_reason,
            "nextRunAt": schedule.next_run_at.isoformat() if schedule.next_run_at else None,
            "lastOutcome": schedule.last_outcome,
        },
    )
    session.commit()
    return serialize_schedule(schedule)


@router.get("/v1/inspection/dispatch", response_model=list[DispatchRecordDto])
def list_dispatches(
    organizationId: str | None = None,
    siteId: str | None = None,
    missionId: str | None = None,
    scheduleId: str | None = None,
    statusFilter: str | None = Query(default=None, alias="status"),
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> list[DispatchRecordDto]:
    statement = (
        select(DispatchRecord)
        .join(Mission, Mission.id == DispatchRecord.mission_id)
        .where(Mission.organization_id.is_not(None))
    )
    statement = apply_org_read_scope(statement, Mission.organization_id, current_user)
    if organizationId is not None:
        statement = statement.where(DispatchRecord.organization_id == organizationId)
    if siteId is not None:
        statement = statement.where(Mission.site_id == siteId)
    if missionId is not None:
        statement = statement.where(DispatchRecord.mission_id == missionId)
    if scheduleId is not None:
        statement = statement.where(DispatchRecord.schedule_id == scheduleId)
    if statusFilter is not None:
        statement = statement.where(DispatchRecord.status == statusFilter)
    dispatches = session.exec(statement.order_by(DispatchRecord.updated_at.desc(), DispatchRecord.dispatched_at.desc())).all()
    return [serialize_dispatch(dispatch) for dispatch in dispatches]


@router.post("/v1/missions/{mission_id}/dispatch", response_model=DispatchRecordDto)
def dispatch_mission(
    mission_id: str,
    request: CreateDispatchRequestDto,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> DispatchRecordDto:
    mission = session.get(Mission, mission_id)
    if mission is None or mission.organization_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="mission_not_found")
    ensure_org_write_access(session, current_user, mission.organization_id, action="mission.dispatch_access")
    if mission.site_id is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="mission_site_required_for_dispatch")

    _validate_schedule_links(
        session,
        organization_id=mission.organization_id,
        site_id=mission.site_id,
        route_id=request.routeId,
        template_id=request.templateId,
    )
    if request.scheduleId is not None:
        _require_schedule(session, request.scheduleId, organization_id=mission.organization_id, site_id=mission.site_id)

    dispatch = session.exec(select(DispatchRecord).where(DispatchRecord.mission_id == mission.id)).first()
    if dispatch is None:
        dispatch = DispatchRecord(
            organization_id=mission.organization_id,
            mission_id=mission.id,
            dispatched_by_user_id=current_user.user.id,
        )
    dispatch.route_id = request.routeId
    dispatch.template_id = request.templateId
    dispatch.schedule_id = request.scheduleId
    dispatch.assignee = request.assignee
    dispatch.execution_target = request.executionTarget
    dispatch.status = request.status
    dispatch.note = request.note
    dispatch.dispatched_at = datetime.now(timezone.utc)
    normalize_dispatch_state(dispatch, changed_at=dispatch.dispatched_at)
    session.add(dispatch)

    mission.status = mission_status_for_dispatch(dispatch.status)
    session.add(mission)
    if request.scheduleId is not None:
        schedule = _require_schedule(session, request.scheduleId, organization_id=mission.organization_id, site_id=mission.site_id)
        mark_schedule_dispatched(schedule, changed_at=dispatch.dispatched_at)
        session.add(schedule)
    record_audit(
        session,
        action="mission.dispatched",
        organization_id=mission.organization_id,
        actor_user_id=current_user.user.id,
        target_type="mission",
        target_id=mission.id,
        metadata={
            "dispatchId": dispatch.id,
            "routeId": dispatch.route_id,
            "templateId": dispatch.template_id,
            "scheduleId": dispatch.schedule_id,
            "status": dispatch.status,
        },
    )
    session.commit()
    return serialize_dispatch(dispatch)


@router.patch("/v1/inspection/dispatch/{dispatch_id}", response_model=DispatchRecordDto)
def patch_dispatch(
    dispatch_id: str,
    request: UpdateDispatchRequestDto,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> DispatchRecordDto:
    dispatch = session.get(DispatchRecord, dispatch_id)
    if dispatch is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="dispatch_not_found")

    mission = session.get(Mission, dispatch.mission_id)
    if mission is None or mission.organization_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="mission_not_found")
    ensure_org_write_access(session, current_user, mission.organization_id, action="mission.dispatch_update_access")
    if mission.site_id is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="mission_site_required_for_dispatch")

    next_route_id = request.routeId if request.routeId is not None else dispatch.route_id
    next_template_id = request.templateId if request.templateId is not None else dispatch.template_id
    next_schedule_id = request.scheduleId if request.scheduleId is not None else dispatch.schedule_id
    _validate_schedule_links(
        session,
        organization_id=mission.organization_id,
        site_id=mission.site_id,
        route_id=next_route_id,
        template_id=next_template_id,
    )
    if next_schedule_id is not None:
        _require_schedule(session, next_schedule_id, organization_id=mission.organization_id, site_id=mission.site_id)

    previous_status = dispatch.status
    if request.routeId is not None:
        dispatch.route_id = request.routeId
    if request.templateId is not None:
        dispatch.template_id = request.templateId
    if request.scheduleId is not None:
        dispatch.schedule_id = request.scheduleId
    if request.assignee is not None:
        dispatch.assignee = request.assignee
    if request.executionTarget is not None:
        dispatch.execution_target = request.executionTarget
    if request.status is not None:
        dispatch.status = request.status
    if request.note is not None:
        dispatch.note = request.note
    normalize_dispatch_state(dispatch)
    session.add(dispatch)

    if dispatch.schedule_id is not None:
        schedule = _require_schedule(session, dispatch.schedule_id, organization_id=mission.organization_id, site_id=mission.site_id)
        if dispatch.status in {"assigned", "sent", "accepted", "completed"}:
            mark_schedule_dispatched(schedule, changed_at=dispatch.updated_at)
            session.add(schedule)

    mission.status = mission_status_for_dispatch(dispatch.status)
    session.add(mission)
    record_audit(
        session,
        action="mission.dispatch_updated",
        organization_id=mission.organization_id,
        actor_user_id=current_user.user.id,
        target_type="mission",
        target_id=mission.id,
        metadata={
            "dispatchId": dispatch.id,
            "previousStatus": previous_status,
            "status": dispatch.status,
            "assignee": dispatch.assignee,
            "executionTarget": dispatch.execution_target,
            "scheduleId": dispatch.schedule_id,
        },
    )
    session.commit()
    return serialize_dispatch(dispatch)


def _require_site(session: Session, site_id: str, *, organization_id: str) -> Site:
    site = session.get(Site, site_id)
    if site is None or site.organization_id != organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="site_not_found")
    return site


def _require_route(session: Session, route_id: str, *, organization_id: str, site_id: str | None = None) -> InspectionRoute:
    route = session.get(InspectionRoute, route_id)
    if route is None or route.organization_id != organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="inspection_route_not_found")
    if site_id is not None and route.site_id != site_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="inspection_route_site_mismatch")
    return route


def _require_template(
    session: Session,
    template_id: str,
    *,
    organization_id: str,
    site_id: str | None = None,
) -> InspectionTemplate:
    template = session.get(InspectionTemplate, template_id)
    if template is None or template.organization_id != organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="inspection_template_not_found")
    if site_id is not None and template.site_id != site_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="inspection_template_site_mismatch")
    return template


def _require_schedule(
    session: Session,
    schedule_id: str,
    *,
    organization_id: str,
    site_id: str | None = None,
) -> InspectionSchedule:
    schedule = session.get(InspectionSchedule, schedule_id)
    if schedule is None or schedule.organization_id != organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="inspection_schedule_not_found")
    if site_id is not None and schedule.site_id != site_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="inspection_schedule_site_mismatch")
    return schedule


def _validate_schedule_links(
    session: Session,
    *,
    organization_id: str,
    site_id: str,
    route_id: str | None,
    template_id: str | None,
) -> None:
    if route_id is None and template_id is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="route_or_template_required")
    route = _require_route(session, route_id, organization_id=organization_id, site_id=site_id) if route_id else None
    template = (
        _require_template(session, template_id, organization_id=organization_id, site_id=site_id)
        if template_id
        else None
    )
    if route is not None and template is not None and template.route_id is not None and template.route_id != route.id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="template_route_mismatch")


