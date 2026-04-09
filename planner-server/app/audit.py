from __future__ import annotations

from sqlmodel import Session

from app.models import AuditEvent


def record_audit(
    session: Session,
    *,
    action: str,
    organization_id: str | None = None,
    actor_user_id: str | None = None,
    actor_operator_id: str | None = None,
    target_type: str | None = None,
    target_id: str | None = None,
    metadata: dict | None = None,
) -> AuditEvent:
    event = AuditEvent(
        organization_id=organization_id,
        actor_user_id=actor_user_id,
        actor_operator_id=actor_operator_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        metadata_json=metadata or {},
    )
    session.add(event)
    return event
