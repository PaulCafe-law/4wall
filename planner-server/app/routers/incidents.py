from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.deps import CurrentWebUser, get_current_web_user, get_session, get_settings
from app.incident_dto import (
    AddIncidentCommentRequestDto,
    AddIncidentEvidenceRequestDto,
    AssignIncidentRequestDto,
    CreateIncidentRequestDto,
    IncidentDailySummaryDto,
    IncidentDto,
    LinePushSummaryResponseDto,
    UpdateIncidentSeverityRequestDto,
    UpdateIncidentStatusRequestDto,
)
from app.incidents import (
    add_incident_comment,
    add_incident_evidence,
    assign_incident,
    build_daily_summary,
    create_incident,
    day_bounds,
    record_summary_line_notification,
    reopen_incident,
    serialize_incident,
    serialize_line_notification,
    sort_incidents,
    update_incident_severity,
    update_incident_status,
)
from app.models import IncidentRecord
from app.web_scope import apply_org_read_scope, ensure_org_read_access, ensure_org_write_access


router = APIRouter(tags=["incidents"])


@router.get("/v1/incidents/summary", response_model=IncidentDailySummaryDto)
def get_daily_incident_summary(
    date: date = Query(...),
    organizationId: str | None = None,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> IncidentDailySummaryDto:
    incidents = _list_incident_records(
        session,
        current_user,
        organization_id=organizationId,
        created_on=date,
    )
    return build_daily_summary(session, incidents, date)


@router.post("/v1/incidents/summary/line-push", response_model=LinePushSummaryResponseDto)
def push_daily_incident_summary_to_line(
    date: date = Query(...),
    organizationId: str | None = None,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
) -> LinePushSummaryResponseDto:
    incidents = _list_incident_records(
        session,
        current_user,
        organization_id=organizationId,
        created_on=date,
    )
    summary = build_daily_summary(session, incidents, date)
    notification = record_summary_line_notification(session, settings, summary)
    session.commit()
    return LinePushSummaryResponseDto(notification=serialize_line_notification(notification))


@router.get("/v1/incidents", response_model=list[IncidentDto])
def list_incidents(
    organizationId: str | None = None,
    siteId: str | None = None,
    statusFilter: str | None = Query(default=None, alias="status"),
    severity: str | None = None,
    source: str | None = None,
    areaName: str | None = None,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> list[IncidentDto]:
    incidents = _list_incident_records(
        session,
        current_user,
        organization_id=organizationId,
        site_id=siteId,
        status_filter=statusFilter,
        severity=severity,
        source=source,
        area_name=areaName,
    )
    return [serialize_incident(session, incident) for incident in sort_incidents(incidents)]


@router.post("/v1/incidents", response_model=IncidentDto)
def create_incident_endpoint(
    request: CreateIncidentRequestDto,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
) -> IncidentDto:
    ensure_org_write_access(session, current_user, request.organizationId, action="incident.create_access")
    incident = create_incident(
        session,
        settings,
        request,
        actor_user_id=current_user.user.id,
        actor_name=current_user.user.display_name,
    )
    session.commit()
    return serialize_incident(session, incident)


@router.get("/v1/incidents/{incident_id}", response_model=IncidentDto)
def get_incident(
    incident_id: str,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> IncidentDto:
    incident = _load_incident_for_read(session, current_user, incident_id)
    return serialize_incident(session, incident)


@router.patch("/v1/incidents/{incident_id}/status", response_model=IncidentDto)
def patch_incident_status(
    incident_id: str,
    request: UpdateIncidentStatusRequestDto,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
) -> IncidentDto:
    incident = _load_incident_for_write(session, current_user, incident_id)
    update_incident_status(
        session,
        settings,
        incident,
        request.status,
        actor_user_id=current_user.user.id,
        actor_name=current_user.user.display_name,
    )
    session.commit()
    return serialize_incident(session, incident)


@router.patch("/v1/incidents/{incident_id}/severity", response_model=IncidentDto)
def patch_incident_severity(
    incident_id: str,
    request: UpdateIncidentSeverityRequestDto,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> IncidentDto:
    incident = _load_incident_for_write(session, current_user, incident_id)
    update_incident_severity(
        session,
        incident,
        request.severity,
        actor_user_id=current_user.user.id,
        actor_name=current_user.user.display_name,
    )
    session.commit()
    return serialize_incident(session, incident)


@router.patch("/v1/incidents/{incident_id}/assignee", response_model=IncidentDto)
def patch_incident_assignee(
    incident_id: str,
    request: AssignIncidentRequestDto,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
) -> IncidentDto:
    incident = _load_incident_for_write(session, current_user, incident_id)
    assign_incident(
        session,
        settings,
        incident,
        request.assigneeName,
        actor_user_id=current_user.user.id,
        actor_name=current_user.user.display_name,
    )
    session.commit()
    return serialize_incident(session, incident)


@router.post("/v1/incidents/{incident_id}/comments", response_model=IncidentDto)
def add_incident_comment_endpoint(
    incident_id: str,
    request: AddIncidentCommentRequestDto,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> IncidentDto:
    incident = _load_incident_for_write(session, current_user, incident_id)
    add_incident_comment(
        session,
        incident,
        request.content,
        actor_user_id=current_user.user.id,
        actor_name=current_user.user.display_name,
    )
    session.commit()
    return serialize_incident(session, incident)


@router.post("/v1/incidents/{incident_id}/evidence", response_model=IncidentDto)
def add_incident_evidence_endpoint(
    incident_id: str,
    request: AddIncidentEvidenceRequestDto,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> IncidentDto:
    incident = _load_incident_for_write(session, current_user, incident_id)
    add_incident_evidence(
        session,
        incident,
        request,
        actor_user_id=current_user.user.id,
        actor_name=current_user.user.display_name,
    )
    session.commit()
    return serialize_incident(session, incident)


@router.post("/v1/incidents/{incident_id}/reopen", response_model=IncidentDto)
def reopen_incident_endpoint(
    incident_id: str,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
) -> IncidentDto:
    incident = _load_incident_for_write(session, current_user, incident_id)
    reopen_incident(
        session,
        settings,
        incident,
        actor_user_id=current_user.user.id,
        actor_name=current_user.user.display_name,
    )
    session.commit()
    return serialize_incident(session, incident)


def _load_incident_for_read(session: Session, current_user: CurrentWebUser, incident_id: str) -> IncidentRecord:
    incident = session.get(IncidentRecord, incident_id)
    if incident is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="incident_not_found")
    ensure_org_read_access(session, current_user, incident.organization_id, action="incident.read_access")
    return incident


def _load_incident_for_write(session: Session, current_user: CurrentWebUser, incident_id: str) -> IncidentRecord:
    incident = session.get(IncidentRecord, incident_id)
    if incident is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="incident_not_found")
    ensure_org_write_access(session, current_user, incident.organization_id, action="incident.write_access")
    return incident


def _list_incident_records(
    session: Session,
    current_user: CurrentWebUser,
    *,
    organization_id: str | None = None,
    site_id: str | None = None,
    status_filter: str | None = None,
    severity: str | None = None,
    source: str | None = None,
    area_name: str | None = None,
    created_on: date | None = None,
) -> list[IncidentRecord]:
    statement = apply_org_read_scope(select(IncidentRecord), IncidentRecord.organization_id, current_user)
    if organization_id:
        statement = statement.where(IncidentRecord.organization_id == organization_id)
    if site_id:
        statement = statement.where(IncidentRecord.site_id == site_id)
    if status_filter:
        statement = statement.where(IncidentRecord.status == status_filter)
    if severity:
        statement = statement.where(IncidentRecord.severity == severity)
    if source:
        statement = statement.where(IncidentRecord.source == source)
    if created_on is not None:
        start, end = day_bounds(created_on)
        statement = statement.where(IncidentRecord.created_at >= start, IncidentRecord.created_at <= end)
    incidents = list(session.exec(statement).all())
    if area_name:
        incidents = [item for item in incidents if (item.location_json or {}).get("areaName") == area_name]
    return incidents
