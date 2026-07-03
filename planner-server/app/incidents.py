from __future__ import annotations

from datetime import date, datetime, time
from typing import Iterable

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.audit import record_audit
from app.incident_dto import (
    AddIncidentEvidenceRequestDto,
    CreateIncidentRequestDto,
    IncidentCommentDto,
    IncidentDailySummaryDto,
    IncidentDto,
    IncidentEvidenceDto,
    IncidentHistoryDto,
    IncidentLineNotificationDto,
)
from app.line_bot import (
    LineBotConfigurationError,
    LineBotDeliveryError,
    build_line_daily_summary_message,
    build_line_incident_message,
    build_line_incident_text,
    push_line_message,
)
from app.line_floorplan.links import liveview_url_for_incident
from app.models import (
    IncidentCommentRecord,
    IncidentEvidenceRecord,
    IncidentHistoryRecord,
    IncidentLineNotificationRecord,
    IncidentRecord,
    Site,
    utc_now,
)


INCIDENT_STATUSES = {"pending_review", "confirmed", "in_progress", "resolved", "false_positive"}
INCIDENT_SEVERITIES = {"low", "medium", "high", "critical"}
INCIDENT_SOURCES = {"ai_detection", "manual", "pocket_lens", "camera", "drone", "vehicle", "line"}
TERMINAL_STATUSES = {"resolved", "false_positive"}
SEVERITY_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3}
STATUS_TRANSITIONS = {
    "pending_review": {"confirmed", "false_positive"},
    "confirmed": {"in_progress"},
    "in_progress": {"resolved"},
}


def serialize_incident(session: Session, incident: IncidentRecord) -> IncidentDto:
    evidence = session.exec(
        select(IncidentEvidenceRecord)
        .where(IncidentEvidenceRecord.incident_id == incident.id)
        .order_by(IncidentEvidenceRecord.created_at.asc())
    ).all()
    comments = session.exec(
        select(IncidentCommentRecord)
        .where(IncidentCommentRecord.incident_id == incident.id)
        .order_by(IncidentCommentRecord.created_at.asc())
    ).all()
    history = session.exec(
        select(IncidentHistoryRecord)
        .where(IncidentHistoryRecord.incident_id == incident.id)
        .order_by(IncidentHistoryRecord.created_at.asc())
    ).all()
    notifications = session.exec(
        select(IncidentLineNotificationRecord)
        .where(IncidentLineNotificationRecord.incident_id == incident.id)
        .order_by(IncidentLineNotificationRecord.created_at.desc())
    ).all()
    return IncidentDto(
        incidentId=incident.id,
        organizationId=incident.organization_id,
        siteId=incident.site_id,
        title=incident.title,
        description=incident.description,
        status=incident.status,
        severity=incident.severity,
        source=incident.source,
        location=incident.location_json or {},
        evidence=[
            IncidentEvidenceDto(
                evidenceId=item.id,
                type=item.evidence_type,
                url=item.url,
                text=item.text,
                createdAt=item.created_at,
            )
            for item in evidence
        ],
        comments=[
            IncidentCommentDto(
                commentId=item.id,
                authorName=item.author_name,
                content=item.content,
                createdAt=item.created_at,
            )
            for item in comments
        ],
        history=[
            IncidentHistoryDto(
                historyId=item.id,
                action=item.action,
                fromValue=item.from_value,
                toValue=item.to_value,
                actorName=item.actor_name,
                createdAt=item.created_at,
            )
            for item in history
        ],
        lineNotifications=[serialize_line_notification(item) for item in notifications],
        assigneeName=incident.assignee_name,
        reporterName=incident.reporter_name,
        aiSummary=incident.ai_summary,
        aiConfidence=incident.ai_confidence,
        createdAt=incident.created_at,
        updatedAt=incident.updated_at,
        resolvedAt=incident.resolved_at,
    )


def serialize_line_notification(item: IncidentLineNotificationRecord) -> IncidentLineNotificationDto:
    return IncidentLineNotificationDto(
        notificationId=item.id,
        incidentId=item.incident_id,
        action=item.action,
        targetId=item.target_id,
        message=item.message,
        status=item.status,
        errorMessage=item.error_message,
        createdAt=item.created_at,
        sentAt=item.sent_at,
    )


def sort_incidents(incidents: Iterable[IncidentRecord]) -> list[IncidentRecord]:
    return sorted(
        incidents,
        key=lambda item: (
            SEVERITY_RANK.get(item.severity, 99),
            -item.created_at.timestamp(),
        ),
    )


def create_incident(
    session: Session,
    settings,
    request: CreateIncidentRequestDto,
    *,
    actor_user_id: str | None,
    actor_name: str,
) -> IncidentRecord:
    site = _validate_site_scope(session, organization_id=request.organizationId, site_id=request.siteId)
    location = request.location.model_dump(mode="json")
    if site is not None:
        location.setdefault("siteId", site.id)
        location.setdefault("siteName", site.name)
    incident = IncidentRecord(
        organization_id=request.organizationId,
        site_id=request.siteId,
        title=request.title.strip(),
        description=request.description,
        status="pending_review",
        severity=request.severity,
        source=request.source,
        location_json=location,
        assignee_name=_empty_to_none(request.assigneeName),
        reporter_name=_empty_to_none(request.reporterName),
        ai_summary=_empty_to_none(request.aiSummary),
        ai_confidence=request.aiConfidence,
        created_by_user_id=actor_user_id,
        updated_by_user_id=actor_user_id,
    )
    session.add(incident)
    session.flush()
    _add_history(session, incident, "incident.created", None, incident.status, actor_name)
    for evidence in request.evidence:
        _add_evidence(session, incident, evidence, actor_name)
    record_audit(
        session,
        action="incident.created",
        organization_id=incident.organization_id,
        actor_user_id=actor_user_id,
        target_type="incident",
        target_id=incident.id,
        metadata={"severity": incident.severity, "source": incident.source},
    )
    if incident.severity in {"critical", "high"}:
        record_incident_line_notification(session, settings, incident, "incident_created")
    return incident


def update_incident_status(
    session: Session,
    settings,
    incident: IncidentRecord,
    new_status: str,
    *,
    actor_user_id: str | None,
    actor_name: str,
) -> IncidentRecord:
    if new_status not in INCIDENT_STATUSES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="invalid_incident_status")
    if incident.status in TERMINAL_STATUSES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="incident_terminal_requires_reopen")
    if new_status not in STATUS_TRANSITIONS.get(incident.status, set()):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="invalid_incident_status_transition")
    previous = incident.status
    incident.status = new_status
    incident.updated_by_user_id = actor_user_id
    incident.updated_at = utc_now()
    incident.resolved_at = utc_now() if new_status == "resolved" else incident.resolved_at
    session.add(incident)
    _add_history(session, incident, "incident.status_changed", previous, new_status, actor_name)
    record_audit(
        session,
        action="incident.status_changed",
        organization_id=incident.organization_id,
        actor_user_id=actor_user_id,
        target_type="incident",
        target_id=incident.id,
        metadata={"from": previous, "to": new_status},
    )
    record_incident_line_notification(session, settings, incident, _status_notification_action(new_status))
    return incident


def reopen_incident(
    session: Session,
    settings,
    incident: IncidentRecord,
    *,
    actor_user_id: str | None,
    actor_name: str,
) -> IncidentRecord:
    if incident.status not in TERMINAL_STATUSES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="incident_reopen_requires_terminal")
    previous = incident.status
    incident.status = "pending_review"
    incident.resolved_at = None
    incident.updated_by_user_id = actor_user_id
    incident.updated_at = utc_now()
    session.add(incident)
    _add_history(session, incident, "incident.reopened", previous, incident.status, actor_name)
    record_audit(
        session,
        action="incident.reopened",
        organization_id=incident.organization_id,
        actor_user_id=actor_user_id,
        target_type="incident",
        target_id=incident.id,
        metadata={"from": previous, "to": incident.status},
    )
    record_incident_line_notification(session, settings, incident, "incident_reopened")
    return incident


def update_incident_severity(
    session: Session,
    incident: IncidentRecord,
    severity: str,
    *,
    actor_user_id: str,
    actor_name: str,
) -> IncidentRecord:
    if severity not in INCIDENT_SEVERITIES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="invalid_incident_severity")
    previous = incident.severity
    incident.severity = severity
    incident.updated_by_user_id = actor_user_id
    incident.updated_at = utc_now()
    session.add(incident)
    _add_history(session, incident, "incident.severity_changed", previous, severity, actor_name)
    record_audit(
        session,
        action="incident.severity_changed",
        organization_id=incident.organization_id,
        actor_user_id=actor_user_id,
        target_type="incident",
        target_id=incident.id,
        metadata={"from": previous, "to": severity},
    )
    return incident


def assign_incident(
    session: Session,
    settings,
    incident: IncidentRecord,
    assignee_name: str | None,
    *,
    actor_user_id: str,
    actor_name: str,
) -> IncidentRecord:
    previous = incident.assignee_name
    incident.assignee_name = _empty_to_none(assignee_name)
    incident.updated_by_user_id = actor_user_id
    incident.updated_at = utc_now()
    session.add(incident)
    _add_history(session, incident, "incident.assigned", previous, incident.assignee_name, actor_name)
    record_audit(
        session,
        action="incident.assigned",
        organization_id=incident.organization_id,
        actor_user_id=actor_user_id,
        target_type="incident",
        target_id=incident.id,
        metadata={"from": previous, "to": incident.assignee_name},
    )
    record_incident_line_notification(session, settings, incident, "incident_assigned")
    return incident


def add_incident_comment(
    session: Session,
    incident: IncidentRecord,
    content: str,
    *,
    actor_user_id: str | None,
    actor_name: str,
) -> IncidentCommentRecord:
    comment = IncidentCommentRecord(incident_id=incident.id, author_name=actor_name, content=content.strip())
    session.add(comment)
    _touch_incident(incident, actor_user_id)
    _add_history(session, incident, "incident.comment_added", None, comment.content[:120], actor_name)
    record_audit(
        session,
        action="incident.comment_added",
        organization_id=incident.organization_id,
        actor_user_id=actor_user_id,
        target_type="incident",
        target_id=incident.id,
    )
    return comment


def add_incident_evidence(
    session: Session,
    incident: IncidentRecord,
    request: AddIncidentEvidenceRequestDto,
    *,
    actor_user_id: str | None,
    actor_name: str,
) -> IncidentEvidenceRecord:
    evidence = _add_evidence(session, incident, request, actor_name)
    _touch_incident(incident, actor_user_id)
    record_audit(
        session,
        action="incident.evidence_added",
        organization_id=incident.organization_id,
        actor_user_id=actor_user_id,
        target_type="incident",
        target_id=incident.id,
        metadata={"type": evidence.evidence_type},
    )
    return evidence


def build_daily_summary(session: Session, incidents: list[IncidentRecord], summary_date: date) -> IncidentDailySummaryDto:
    status_counts = {status: 0 for status in sorted(INCIDENT_STATUSES)}
    severity_counts = {severity: 0 for severity in sorted(INCIDENT_SEVERITIES)}
    for incident in incidents:
        status_counts[incident.status] = status_counts.get(incident.status, 0) + 1
        severity_counts[incident.severity] = severity_counts.get(incident.severity, 0) + 1
    critical_high = sort_incidents([item for item in incidents if item.severity in {"critical", "high"}])
    resolved = sort_incidents([item for item in incidents if item.status == "resolved"])
    unhandled = sort_incidents([item for item in incidents if item.status in {"pending_review", "confirmed"}])
    summary_text = _daily_summary_text(summary_date, status_counts, severity_counts, critical_high)
    return IncidentDailySummaryDto(
        date=summary_date,
        newIncidentCount=len(incidents),
        statusCounts=status_counts,
        severityCounts=severity_counts,
        criticalHighIncidents=[serialize_incident(session, item) for item in critical_high],
        resolvedIncidents=[serialize_incident(session, item) for item in resolved],
        unhandledIncidents=[serialize_incident(session, item) for item in unhandled],
        lineSummaryMessage=summary_text,
    )


def record_summary_line_notification(session: Session, settings, summary: IncidentDailySummaryDto) -> IncidentLineNotificationRecord:
    message = summary.lineSummaryMessage
    notification = IncidentLineNotificationRecord(
        incident_id=None,
        action="daily_summary",
        target_id=settings.line_default_group_id,
        message=message,
        status="queued",
        request_payload_json={},
        response_payload_json={},
    )
    session.add(notification)
    session.flush()
    if not settings.line_incident_notify_enabled:
        notification.status = "disabled"
        notification.error_message = "line_incident_notify_disabled"
        return notification
    if not settings.line_default_group_id:
        notification.status = "failed"
        notification.error_message = "missing_line_default_group_id"
        return notification
    try:
        line_message = build_line_daily_summary_message(summary)
        notification.request_payload_json = {"to": settings.line_default_group_id, "messages": [line_message]}
        notification.response_payload_json = push_line_message(settings, settings.line_default_group_id, line_message)
        notification.status = "sent"
        notification.sent_at = utc_now()
    except (LineBotConfigurationError, LineBotDeliveryError) as exc:
        notification.status = "failed"
        notification.error_message = str(exc)
    return notification


def record_incident_line_notification(
    session: Session,
    settings,
    incident: IncidentRecord,
    action: str,
) -> IncidentLineNotificationRecord:
    message = build_line_incident_text(incident, action)
    liveview_url = liveview_url_for_incident(session, settings, incident)
    if liveview_url:
        message = f"{message}\n即時圖：{liveview_url}"
    notification = IncidentLineNotificationRecord(
        incident_id=incident.id,
        action=action,
        target_id=settings.line_default_group_id,
        message=message,
        status="queued",
        request_payload_json={},
        response_payload_json={},
    )
    session.add(notification)
    session.flush()
    if not settings.line_incident_notify_enabled:
        notification.status = "disabled"
        notification.error_message = "line_incident_notify_disabled"
        return notification
    if not settings.line_default_group_id:
        notification.status = "failed"
        notification.error_message = "missing_line_default_group_id"
        return notification
    try:
        line_message = build_line_incident_message(incident, action)
        if liveview_url:
            line_message["text"] = message
        notification.request_payload_json = {"to": settings.line_default_group_id, "messages": [line_message]}
        notification.response_payload_json = push_line_message(settings, settings.line_default_group_id, line_message)
        notification.status = "sent"
        notification.sent_at = utc_now()
    except (LineBotConfigurationError, LineBotDeliveryError) as exc:
        notification.status = "failed"
        notification.error_message = str(exc)
    return notification


def day_bounds(summary_date: date) -> tuple[datetime, datetime]:
    start = datetime.combine(summary_date, time.min)
    end = datetime.combine(summary_date, time.max)
    return start, end


def _add_evidence(session: Session, incident: IncidentRecord, request, actor_name: str) -> IncidentEvidenceRecord:
    evidence = IncidentEvidenceRecord(
        incident_id=incident.id,
        evidence_type=request.type,
        url=_empty_to_none(request.url),
        text=_empty_to_none(request.text),
    )
    session.add(evidence)
    _add_history(session, incident, "incident.evidence_added", None, evidence.evidence_type, actor_name)
    return evidence


def _add_history(
    session: Session,
    incident: IncidentRecord,
    action: str,
    from_value: str | None,
    to_value: str | None,
    actor_name: str,
) -> None:
    session.add(
        IncidentHistoryRecord(
            incident_id=incident.id,
            action=action,
            from_value=from_value,
            to_value=to_value,
            actor_name=actor_name,
        )
    )


def _touch_incident(incident: IncidentRecord, actor_user_id: str | None) -> None:
    incident.updated_by_user_id = actor_user_id
    incident.updated_at = utc_now()


def _validate_site_scope(session: Session, *, organization_id: str, site_id: str | None) -> Site | None:
    if site_id is None:
        return None
    site = session.get(Site, site_id)
    if site is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="site_not_found")
    if site.organization_id != organization_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="site_organization_mismatch")
    return site


def _empty_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _status_notification_action(new_status: str) -> str:
    return {
        "confirmed": "incident_confirmed",
        "false_positive": "incident_false_positive",
        "in_progress": "incident_in_progress",
        "resolved": "incident_resolved",
    }.get(new_status, "incident_updated")


def _daily_summary_text(
    summary_date: date,
    status_counts: dict[str, int],
    severity_counts: dict[str, int],
    critical_high: list[IncidentRecord],
) -> str:
    priority_lines = "\n".join(
        f"{index}. {incident.title}" for index, incident in enumerate(critical_high[:5], start=1)
    )
    if not priority_lines:
        priority_lines = "無"
    return (
        "【第四面牆｜每日異常摘要】\n"
        f"日期：{summary_date.isoformat()}\n"
        f"今日新增：{sum(status_counts.values())} 件\n"
        f"待確認：{status_counts.get('pending_review', 0)} 件\n"
        f"處理中：{status_counts.get('in_progress', 0)} 件\n"
        f"已結案：{status_counts.get('resolved', 0)} 件\n"
        f"緊急 / 高風險：{severity_counts.get('critical', 0) + severity_counts.get('high', 0)} 件\n\n"
        f"需要優先處理：\n{priority_lines}"
    )
