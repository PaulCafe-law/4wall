from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlmodel import Session, select

from app.models import OperatorAccount
from app.security import hash_password


@dataclass(frozen=True)
class OperatorUpsertResult:
    operator: OperatorAccount
    created: bool
    password_updated: bool


def upsert_operator(
    session: Session,
    *,
    username: str,
    display_name: str,
    password: str,
    update_password: bool = False,
    active: bool | None = None,
) -> OperatorUpsertResult:
    statement = select(OperatorAccount).where(OperatorAccount.username == username)
    operator = session.exec(statement).first()
    now = datetime.now(timezone.utc)

    if operator is None:
        operator = OperatorAccount(
            username=username,
            display_name=display_name,
            password_hash=hash_password(password),
            is_active=True if active is None else active,
            updated_at=now,
        )
        session.add(operator)
        session.flush()
        return OperatorUpsertResult(operator=operator, created=True, password_updated=True)

    password_updated = False
    operator.display_name = display_name
    if update_password:
        operator.password_hash = hash_password(password)
        password_updated = True
    if active is not None:
        operator.is_active = active
    operator.updated_at = now
    session.add(operator)
    session.flush()
    return OperatorUpsertResult(operator=operator, created=False, password_updated=password_updated)
