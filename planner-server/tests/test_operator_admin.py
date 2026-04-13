from sqlmodel import SQLModel, select

from app.models import OperatorAccount
from app.operator_admin import upsert_operator
from app.security import verify_password


def _ensure_tables(session_factory) -> None:
    with session_factory() as session:
        SQLModel.metadata.create_all(session.get_bind())


def test_upsert_operator_creates_operator_with_hashed_password(session_factory) -> None:
    _ensure_tables(session_factory)
    with session_factory() as session:
        result = upsert_operator(
            session,
            username="fieldpilot",
            display_name="Field Pilot",
            password="ChangeMe123!",
        )
        session.commit()
        operator = session.exec(select(OperatorAccount).where(OperatorAccount.username == "fieldpilot")).first()

    assert result.created is True
    assert result.password_updated is True
    assert operator is not None
    assert operator.display_name == "Field Pilot"
    assert operator.password_hash != "ChangeMe123!"
    assert verify_password("ChangeMe123!", operator.password_hash) is True


def test_upsert_operator_keeps_existing_password_without_update_flag(session_factory) -> None:
    _ensure_tables(session_factory)
    with session_factory() as session:
        created = upsert_operator(
            session,
            username="fieldpilot",
            display_name="Field Pilot",
            password="ChangeMe123!",
        )
        original_hash = created.operator.password_hash

        updated = upsert_operator(
            session,
            username="fieldpilot",
            display_name="Field Pilot Updated",
            password="DifferentPassword456!",
            update_password=False,
        )
        session.commit()
        operator = session.exec(select(OperatorAccount).where(OperatorAccount.username == "fieldpilot")).first()

    assert updated.created is False
    assert updated.password_updated is False
    assert operator is not None
    assert operator.display_name == "Field Pilot Updated"
    assert operator.password_hash == original_hash
    assert verify_password("ChangeMe123!", operator.password_hash) is True
    assert verify_password("DifferentPassword456!", operator.password_hash) is False


def test_upsert_operator_can_rotate_password_and_toggle_active_state(session_factory) -> None:
    _ensure_tables(session_factory)
    with session_factory() as session:
        upsert_operator(
            session,
            username="fieldpilot",
            display_name="Field Pilot",
            password="ChangeMe123!",
        )
        first_update = upsert_operator(
            session,
            username="fieldpilot",
            display_name="Field Pilot",
            password="DifferentPassword456!",
            update_password=True,
            active=False,
        )
        second_update = upsert_operator(
            session,
            username="fieldpilot",
            display_name="Field Pilot Reactivated",
            password="IgnoredPassword789!",
            active=True,
        )
        session.commit()
        operator = session.exec(select(OperatorAccount).where(OperatorAccount.username == "fieldpilot")).first()

    assert first_update.created is False
    assert first_update.password_updated is True
    assert second_update.created is False
    assert second_update.password_updated is False
    assert operator is not None
    assert operator.is_active is True
    assert operator.display_name == "Field Pilot Reactivated"
    assert verify_password("DifferentPassword456!", operator.password_hash) is True
    assert verify_password("IgnoredPassword789!", operator.password_hash) is False
