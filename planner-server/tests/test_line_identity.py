from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlsplit

from cryptography.fernet import Fernet
import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlmodel import select

import app.line_identity as line_identity
from app.line_bot import LineBotDeliveryError, issue_line_link_token
from app.line_floorplan.layout import load_floorplan_layout, load_floorplan_layout_for_site
from app.line_identity import (
    LINE_ACCOUNT_LINK_STATUS_CONSUMED,
    LINE_ACCOUNT_LINK_STATUS_FAILED,
    LINE_ACCOUNT_LINK_STATUS_SUPERSEDED,
    LineAccountLinkConflictError,
    LineAccountLinkError,
    confirm_line_account_link_site,
    consume_line_account_link,
    consume_line_account_link_redirect,
    create_line_account_link_attempt,
    decrypt_line_account_link_reply_messages,
    encrypt_line_account_link_reply_messages,
    resolve_line_user_scope,
    unlink_line_user_binding,
)
from app.main import build_app
from app.models import LineAccountLinkAttempt, LineUserBinding, OrganizationMembership, Site
from tests.helpers import seed_organization, seed_user


PASSWORD = "Password123!"
DESTINATION_ID = "Uofficial-account"
LINE_USER_ID = "Uline-user"


def test_account_link_hashes_secrets_resolves_scope_and_unlinks(test_settings, monkeypatch) -> None:
    old_key = Fernet.generate_key().decode("ascii")
    new_key = Fernet.generate_key().decode("ascii")
    issue_settings = _identity_settings(test_settings, old_key)
    rotated_settings = _identity_settings(test_settings, new_key, old_key)
    monkeypatch.setattr("app.line_identity.issue_line_link_token", lambda *_args: "short-lived-line-link-token")
    app = build_app(settings=issue_settings)

    with TestClient(app):
        user_id, site_id = _seed_identity_scope(app, role="customer_admin")
        with app.state.session_factory() as session:
            started = create_line_account_link_attempt(
                session,
                issue_settings,
                destination_id=DESTINATION_ID,
                line_user_id=LINE_USER_ID,
            )
            attempt = session.exec(select(LineAccountLinkAttempt)).one()
            assert attempt.flow_token_hash != started.flow_token
            assert started.flow_token not in attempt.encrypted_link_token
            assert "short-lived-line-link-token" not in attempt.encrypted_link_token
            assert attempt.nonce_hash is None

            confirmed = confirm_line_account_link_site(
                session,
                rotated_settings,
                flow_token=started.flow_token,
                user_id=user_id,
                site_id=site_id,
            )
            assert attempt.redirect_token_hash is not None
            assert confirmed.redirect_token != attempt.redirect_token_hash
            assert "short-lived-line-link-token" not in confirmed.redirect_token
            account_link_url = consume_line_account_link_redirect(
                session,
                rotated_settings,
                redirect_token=confirmed.redirect_token,
            )
            query = parse_qs(urlsplit(account_link_url).query)
            assert query["linkToken"] == ["short-lived-line-link-token"]
            nonce = query["nonce"][0]
            assert len(nonce) >= 43
            assert attempt.nonce_hash != nonce
            assert attempt.encrypted_link_token is None
            assert attempt.redirect_token_hash is None
            assert attempt.redirected_at is not None
            with pytest.raises(LineAccountLinkError, match="line_account_link_redirect_invalid"):
                consume_line_account_link_redirect(
                    session,
                    rotated_settings,
                    redirect_token=confirmed.redirect_token,
                )

            binding = consume_line_account_link(
                session,
                rotated_settings,
                nonce=nonce,
                destination_id=DESTINATION_ID,
                line_user_id=LINE_USER_ID,
            )
            assert binding is not None
            assert attempt.status == LINE_ACCOUNT_LINK_STATUS_CONSUMED
            assert attempt.consumed_at is not None
            assert attempt.encrypted_link_token is None
            scope = resolve_line_user_scope(session, DESTINATION_ID, LINE_USER_ID)
            assert scope is not None
            site = session.get(Site, site_id)
            assert site is not None
            assert scope.organization_id == site.organization_id
            assert scope.site_id == site_id
            assert scope.site_slug == "jingcheng"
            assert scope.actor_user_id == user_id
            assert scope.can_write is True

            assert unlink_line_user_binding(
                session,
                destination_id=DESTINATION_ID,
                line_user_id=LINE_USER_ID,
                expected_user_id=user_id,
            )
            assert resolve_line_user_scope(session, DESTINATION_ID, LINE_USER_ID) is None


def test_account_link_rejects_identity_mismatch_replay_and_active_conflict(test_settings, monkeypatch) -> None:
    key = Fernet.generate_key().decode("ascii")
    settings = _identity_settings(test_settings, key)
    monkeypatch.setattr("app.line_identity.issue_line_link_token", lambda *_args: "line-link-token")
    app = build_app(settings=settings)

    with TestClient(app):
        first_user_id, site_id = _seed_identity_scope(app, role="customer_admin")
        with app.state.session_factory() as session:
            nonce = _confirmed_nonce(session, settings, user_id=first_user_id, site_id=site_id)
            with pytest.raises(LineAccountLinkError, match="line_account_link_identity_mismatch"):
                consume_line_account_link(
                    session,
                    settings,
                    nonce=nonce,
                    destination_id=DESTINATION_ID,
                    line_user_id="Uwrong-user",
                )
            assert consume_line_account_link(
                session,
                settings,
                nonce=nonce,
                destination_id=DESTINATION_ID,
                line_user_id=LINE_USER_ID,
            ) is not None
            session.commit()
            with pytest.raises(LineAccountLinkError, match="line_account_link_used"):
                consume_line_account_link(
                    session,
                    settings,
                    nonce=nonce,
                    destination_id=DESTINATION_ID,
                    line_user_id=LINE_USER_ID,
                )

        with app.state.session_factory() as session:
            organization = seed_organization(session, name="Second Link Org")
            second_user = seed_user(
                session,
                email="second-line-user@example.test",
                password=PASSWORD,
                org_roles=[(organization.id, "customer_admin")],
            )
            site = session.get(Site, site_id)
            assert site is not None
            session.add(OrganizationMembership(user_id=second_user.id, organization_id=site.organization_id, role="customer_admin"))
            session.commit()
            nonce = _confirmed_nonce(session, settings, user_id=second_user.id, site_id=site_id)
            with pytest.raises(LineAccountLinkConflictError, match="line_user_already_linked"):
                consume_line_account_link(
                    session,
                    settings,
                    nonce=nonce,
                    destination_id=DESTINATION_ID,
                    line_user_id=LINE_USER_ID,
                )


def test_failed_link_and_revoked_membership_never_resolve(test_settings, monkeypatch) -> None:
    key = Fernet.generate_key().decode("ascii")
    settings = _identity_settings(test_settings, key)
    monkeypatch.setattr("app.line_identity.issue_line_link_token", lambda *_args: "line-link-token")
    app = build_app(settings=settings)

    with TestClient(app):
        user_id, site_id = _seed_identity_scope(app, role="customer_viewer")
        with app.state.session_factory() as session:
            failed_nonce = _confirmed_nonce(session, settings, user_id=user_id, site_id=site_id)
            assert consume_line_account_link(
                session,
                settings,
                nonce=failed_nonce,
                destination_id=DESTINATION_ID,
                line_user_id=LINE_USER_ID,
                result="failed",
            ) is None
            failed_attempt = session.exec(
                select(LineAccountLinkAttempt).where(LineAccountLinkAttempt.nonce_hash.is_not(None))
            ).first()
            assert failed_attempt is not None
            assert failed_attempt.status == LINE_ACCOUNT_LINK_STATUS_FAILED
            assert failed_attempt.encrypted_link_token is None
            assert session.exec(select(LineUserBinding)).first() is None

            success_nonce = _confirmed_nonce(session, settings, user_id=user_id, site_id=site_id)
            assert consume_line_account_link(
                session,
                settings,
                nonce=success_nonce,
                destination_id=DESTINATION_ID,
                line_user_id=LINE_USER_ID,
            ) is not None
            scope = resolve_line_user_scope(session, DESTINATION_ID, LINE_USER_ID)
            assert scope is not None and scope.can_write is False

            membership = session.exec(
                select(OrganizationMembership).where(
                    OrganizationMembership.user_id == user_id,
                    OrganizationMembership.organization_id == scope.organization_id,
                )
            ).one()
            membership.is_active = False
            session.add(membership)
            session.flush()
            assert resolve_line_user_scope(session, DESTINATION_ID, LINE_USER_ID) is None


def test_new_attempt_supersedes_and_scrubs_previous_link_token(test_settings, monkeypatch) -> None:
    key = Fernet.generate_key().decode("ascii")
    settings = _identity_settings(test_settings, key)
    monkeypatch.setattr("app.line_identity.issue_line_link_token", lambda *_args: "line-link-token")
    app = build_app(settings=settings)

    with TestClient(app):
        with app.state.session_factory() as session:
            create_line_account_link_attempt(
                session,
                settings,
                destination_id=DESTINATION_ID,
                line_user_id=LINE_USER_ID,
            )
            create_line_account_link_attempt(
                session,
                settings,
                destination_id=DESTINATION_ID,
                line_user_id=LINE_USER_ID,
            )
            attempts = session.exec(select(LineAccountLinkAttempt)).all()
            superseded = next(item for item in attempts if item.status == LINE_ACCOUNT_LINK_STATUS_SUPERSEDED)
            current = next(item for item in attempts if item.status != LINE_ACCOUNT_LINK_STATUS_SUPERSEDED)
            assert superseded.encrypted_link_token is None
            assert superseded.is_current is None
            assert current.encrypted_link_token is not None
            assert current.is_current is True


def test_expired_attempts_scrub_secrets_but_retain_audit_metadata(test_settings, monkeypatch) -> None:
    key = Fernet.generate_key().decode("ascii")
    settings = _identity_settings(test_settings, key)
    monkeypatch.setattr("app.line_identity.issue_line_link_token", lambda *_args: "line-link-token")
    app = build_app(settings=settings)
    started_at = datetime(2026, 7, 12, 0, 0, tzinfo=timezone.utc)

    with TestClient(app):
        with app.state.session_factory() as session:
            create_line_account_link_attempt(
                session,
                settings,
                destination_id=DESTINATION_ID,
                line_user_id=LINE_USER_ID,
                now=started_at,
            )
            first = session.exec(select(LineAccountLinkAttempt)).one()
            first_id = first.id
            first_flow_hash = first.flow_token_hash
            session.commit()

            create_line_account_link_attempt(
                session,
                settings,
                destination_id=DESTINATION_ID,
                line_user_id="Uline-user-2",
                now=started_at + timedelta(minutes=11),
            )
            session.commit()

            expired = session.get(LineAccountLinkAttempt, first_id)
            assert expired is not None
            assert expired.status == "expired"
            assert expired.is_current is None
            assert expired.encrypted_link_token is None
            assert expired.redirect_token_hash is None
            assert expired.flow_token_hash == first_flow_hash
            assert expired.expected_line_user_id == LINE_USER_ID
            assert expired.destination_id == DESTINATION_ID

            create_line_account_link_attempt(
                session,
                settings,
                destination_id=DESTINATION_ID,
                line_user_id="Uline-user-3",
                now=started_at + timedelta(hours=2),
            )
            session.commit()
            assert session.get(LineAccountLinkAttempt, first_id) is not None


def test_database_allows_only_one_current_attempt_per_line_identity(test_settings) -> None:
    app = build_app(settings=test_settings)
    now = datetime(2026, 7, 12, 0, 0, tzinfo=timezone.utc)

    with TestClient(app):
        with app.state.session_factory() as session:
            session.add_all(
                [
                    LineAccountLinkAttempt(
                        flow_token_hash="flow-current-1",
                        expected_line_user_id=LINE_USER_ID,
                        destination_id=DESTINATION_ID,
                        is_current=True,
                        status="pending_web_confirmation",
                        expires_at=now + timedelta(minutes=10),
                    ),
                    LineAccountLinkAttempt(
                        flow_token_hash="flow-current-2",
                        expected_line_user_id=LINE_USER_ID,
                        destination_id=DESTINATION_ID,
                        is_current=True,
                        status="pending_web_confirmation",
                        expires_at=now + timedelta(minutes=10),
                    ),
                ]
            )
            with pytest.raises(IntegrityError):
                session.commit()
            session.rollback()

            session.add(
                LineAccountLinkAttempt(
                    flow_token_hash="flow-pending-without-slot",
                    expected_line_user_id=LINE_USER_ID,
                    destination_id=DESTINATION_ID,
                    is_current=None,
                    status="pending_web_confirmation",
                    expires_at=now + timedelta(minutes=10),
                )
            )
            with pytest.raises(IntegrityError):
                session.commit()
            session.rollback()

            session.add_all(
                [
                    LineAccountLinkAttempt(
                        flow_token_hash="flow-terminal-1",
                        expected_line_user_id=LINE_USER_ID,
                        destination_id=DESTINATION_ID,
                        is_current=None,
                        status="failed",
                        expires_at=now,
                    ),
                    LineAccountLinkAttempt(
                        flow_token_hash="flow-terminal-2",
                        expected_line_user_id=LINE_USER_ID,
                        destination_id=DESTINATION_ID,
                        is_current=None,
                        status="superseded",
                        expires_at=now,
                    ),
                ]
            )
            session.commit()
            assert len(session.exec(select(LineAccountLinkAttempt)).all()) == 2


def test_account_link_start_retries_current_attempt_unique_race(test_settings, monkeypatch) -> None:
    key = Fernet.generate_key().decode("ascii")
    settings = _identity_settings(test_settings, key)
    monkeypatch.setattr("app.line_identity.issue_line_link_token", lambda *_args: "line-link-token")
    original_create = line_identity._create_current_account_link_attempt
    call_count = 0

    def collide_once(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise IntegrityError("insert", {}, RuntimeError("current slot race"))
        return original_create(*args, **kwargs)

    monkeypatch.setattr(line_identity, "_create_current_account_link_attempt", collide_once)
    app = build_app(settings=settings)

    with TestClient(app):
        with app.state.session_factory() as session:
            started = create_line_account_link_attempt(
                session,
                settings,
                destination_id=DESTINATION_ID,
                line_user_id=LINE_USER_ID,
            )
            assert started.flow_token
            assert call_count == 2
            attempts = session.exec(select(LineAccountLinkAttempt)).all()
            assert len(attempts) == 1
            assert attempts[0].is_current is True


def test_binding_unique_race_is_reported_as_controlled_conflict(test_settings, monkeypatch) -> None:
    key = Fernet.generate_key().decode("ascii")
    settings = _identity_settings(test_settings, key)
    monkeypatch.setattr("app.line_identity.issue_line_link_token", lambda *_args: "line-link-token")
    app = build_app(settings=settings)

    with TestClient(app):
        user_id, site_id = _seed_identity_scope(app, role="customer_admin")
        with app.state.session_factory() as session:
            nonce = _confirmed_nonce(session, settings, user_id=user_id, site_id=site_id)

            def raise_unique_race(*_args, **_kwargs):
                raise IntegrityError("insert", {}, RuntimeError("unique race"))

            monkeypatch.setattr(line_identity, "_upsert_line_user_binding", raise_unique_race)
            with pytest.raises(LineAccountLinkConflictError, match="line_account_link_conflict"):
                consume_line_account_link(
                    session,
                    settings,
                    nonce=nonce,
                    destination_id=DESTINATION_ID,
                    line_user_id=LINE_USER_ID,
                )
            assert session.exec(select(LineAccountLinkAttempt)).all()


def test_line_reply_messages_encryption_roundtrip_and_key_rotation(test_settings) -> None:
    old_key = Fernet.generate_key().decode("ascii")
    new_key = Fernet.generate_key().decode("ascii")
    old_settings = _identity_settings(test_settings, old_key)
    rotated_settings = _identity_settings(test_settings, new_key, old_key)
    messages = [
        {"type": "text", "text": "帳號連結成功"},
        {
            "type": "flex",
            "altText": "4WALL 場域",
            "contents": {"type": "bubble", "body": {"type": "box", "contents": []}},
        },
    ]

    old_ciphertext = encrypt_line_account_link_reply_messages(old_settings, messages)
    assert decrypt_line_account_link_reply_messages(rotated_settings, old_ciphertext) == messages

    new_ciphertext = encrypt_line_account_link_reply_messages(rotated_settings, messages)
    assert decrypt_line_account_link_reply_messages(rotated_settings, new_ciphertext) == messages
    with pytest.raises(LineAccountLinkError, match="line_account_link_reply_payload_invalid"):
        decrypt_line_account_link_reply_messages(old_settings, new_ciphertext)


def test_line_reply_messages_rejects_tampered_ciphertext(test_settings) -> None:
    key = Fernet.generate_key().decode("ascii")
    settings = _identity_settings(test_settings, key)
    ciphertext = encrypt_line_account_link_reply_messages(
        settings,
        [{"type": "text", "text": "sensitive reply"}],
    )
    midpoint = len(ciphertext) // 2
    replacement = "A" if ciphertext[midpoint] != "A" else "B"
    tampered = f"{ciphertext[:midpoint]}{replacement}{ciphertext[midpoint + 1:]}"

    with pytest.raises(LineAccountLinkError, match="line_account_link_reply_payload_invalid"):
        decrypt_line_account_link_reply_messages(settings, tampered)


@pytest.mark.parametrize(
    "messages",
    [
        {"type": "text"},
        ["not-an-object"],
        [{"bad": (1, 2)}],
        [{1: "non-string-key"}],
        [{"bad": float("nan")}],
    ],
)
def test_line_reply_messages_rejects_non_json_input(test_settings, messages) -> None:
    settings = _identity_settings(test_settings, Fernet.generate_key().decode("ascii"))

    with pytest.raises(LineAccountLinkError, match="line_account_link_reply_payload_invalid"):
        encrypt_line_account_link_reply_messages(settings, messages)


@pytest.mark.parametrize(
    "plaintext",
    [
        b'{"type":"text"}',
        b'["not-an-object"]',
        b'[{"type":"text","type":"image"}]',
        b'[{"value":NaN}]',
    ],
)
def test_line_reply_messages_rejects_invalid_decrypted_json(test_settings, plaintext) -> None:
    raw_key = Fernet.generate_key()
    settings = _identity_settings(test_settings, raw_key.decode("ascii"))
    ciphertext = Fernet(raw_key).encrypt(plaintext).decode("ascii")

    with pytest.raises(LineAccountLinkError, match="line_account_link_reply_payload_invalid"):
        decrypt_line_account_link_reply_messages(settings, ciphertext)


def test_issue_line_link_token_uses_official_endpoint_without_request_body(test_settings, monkeypatch) -> None:
    calls: list[tuple[str, dict]] = []

    def fake_post(url: str, **kwargs):
        calls.append((url, kwargs))
        return httpx.Response(200, json={"linkToken": "issued-link-token"})

    monkeypatch.setattr("app.line_bot.httpx.post", fake_post)
    settings = replace(test_settings, line_channel_access_token="channel-token")

    assert issue_line_link_token(settings, "U/user id") == "issued-link-token"
    assert calls[0][0] == "https://api.line.me/v2/bot/user/U%2Fuser%20id/linkToken"
    assert "json" not in calls[0][1]
    assert calls[0][1]["headers"]["Authorization"] == "Bearer channel-token"


@pytest.mark.parametrize(
    ("status_code", "retryable"),
    [(400, False), (429, True), (503, True)],
)
def test_line_delivery_error_does_not_expose_response_body(
    test_settings,
    monkeypatch,
    status_code: int,
    retryable: bool,
) -> None:
    def fake_post(_url: str, **_kwargs):
        return httpx.Response(status_code, text="sensitive upstream diagnostic")

    monkeypatch.setattr("app.line_bot.httpx.post", fake_post)
    settings = replace(test_settings, line_channel_access_token="channel-token")

    with pytest.raises(LineBotDeliveryError) as exc_info:
        issue_line_link_token(settings, LINE_USER_ID)
    assert str(exc_info.value) == f"line_api_{status_code}"
    assert exc_info.value.status_code == status_code
    assert exc_info.value.retryable is retryable
    assert "sensitive" not in str(exc_info.value)


def _identity_settings(test_settings, *keys: str):
    return replace(
        test_settings,
        line_channel_access_token="channel-token",
        line_channel_secret="channel-secret",
        line_webhook_enabled=True,
        app_origin="https://app.example.test",
        line_public_base_url="https://api.example.test",
        line_account_linking_enabled=True,
        line_account_link_encryption_keys=tuple(keys),
        line_destination_id=DESTINATION_ID,
    )


def _seed_identity_scope(app, *, role: str) -> tuple[str, str]:
    layout = load_floorplan_layout("jingcheng")
    assert load_floorplan_layout_for_site(layout.site_id) == layout
    with app.state.session_factory() as session:
        organization = seed_organization(session, name=f"LINE {role} Org")
        user = seed_user(
            session,
            email=f"line-{role}@example.test",
            password=PASSWORD,
            org_roles=[(organization.id, role)],
        )
        session.add(
            Site(
                id=layout.site_id,
                organization_id=organization.id,
                name="靚程工廠",
                address="Jingcheng",
                lat=25.0,
                lng=121.0,
            )
        )
        session.commit()
        return user.id, layout.site_id


def _confirmed_nonce(session, settings, *, user_id: str, site_id: str) -> str:
    started = create_line_account_link_attempt(
        session,
        settings,
        destination_id=DESTINATION_ID,
        line_user_id=LINE_USER_ID,
    )
    confirmed = confirm_line_account_link_site(
        session,
        settings,
        flow_token=started.flow_token,
        user_id=user_id,
        site_id=site_id,
    )
    account_link_url = consume_line_account_link_redirect(
        session,
        settings,
        redirect_token=confirmed.redirect_token,
    )
    return parse_qs(urlsplit(account_link_url).query)["nonce"][0]
