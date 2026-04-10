from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import false
from sqlmodel import Session

from app.audit import record_audit
from app.deps import CurrentWebUser


def ensure_org_read_access(
    session: Session,
    current_user: CurrentWebUser,
    organization_id: str,
    *,
    action: str,
) -> None:
    if current_user.can_read_org(organization_id):
        if current_user.global_roles.intersection({"platform_admin", "ops"}):
            record_audit(
                session,
                action=action,
                organization_id=organization_id,
                actor_user_id=current_user.user.id,
                target_type="organization",
                target_id=organization_id,
                metadata={"supportAccess": True},
            )
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden_role")


def ensure_org_write_access(
    session: Session,
    current_user: CurrentWebUser,
    organization_id: str,
    *,
    action: str,
) -> None:
    if current_user.can_write_org(organization_id):
        if current_user.global_roles.intersection({"platform_admin", "ops"}):
            record_audit(
                session,
                action=action,
                organization_id=organization_id,
                actor_user_id=current_user.user.id,
                target_type="organization",
                target_id=organization_id,
                metadata={"supportAccess": True},
            )
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden_role")


def ensure_customer_invite_role(role: str) -> None:
    if role not in {"customer_admin", "customer_viewer"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden_role")


def apply_org_read_scope(statement, organization_column, current_user: CurrentWebUser):
    if current_user.global_roles.intersection({"platform_admin", "ops"}):
        return statement
    if not current_user.readable_org_ids:
        return statement.where(false())
    return statement.where(organization_column.in_(current_user.readable_org_ids))
