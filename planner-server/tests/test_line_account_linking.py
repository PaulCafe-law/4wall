from __future__ import annotations

import base64
from dataclasses import dataclass, replace
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
from urllib.parse import parse_qs, urlsplit

from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from sqlmodel import select

import app.routers.line as line_router
from app.line_bot import LineBotDeliveryError
from app.line_floorplan.layout import load_floorplan_layout
from app.line_identity import (
    LineAccountLinkError,
    create_line_account_link_attempt,
    encrypt_line_account_link_reply_messages,
)
from app.main import build_app
from app.models import (
    IncidentHistoryRecord,
    IncidentRecord,
    LineAccountLinkAttempt,
    LineUserBinding,
    LineWebhookEventRecord,
    Site,
)
from tests.helpers import seed_organization, seed_user


PASSWORD = "Password123!"
APP_ORIGIN = "https://app.example.test"
DESTINATION_ID = "Uofficial-account"
LINE_USER_ID = "Uline-user"
OFFICIAL_LINK_TOKEN = "official-short-lived-link-token"


@dataclass(frozen=True)
class SeededLineScope:
    user_id: str
    email: str
    organization_id: str
    site_id: str
    other_site_id: str


def test_unlinked_direct_message_replies_with_internal_fragment_flow_only(test_settings, monkeypatch) -> None:
    settings = _line_settings(test_settings)
    monkeypatch.setattr("app.line_identity.issue_line_link_token", lambda *_args: OFFICIAL_LINK_TOKEN)
    replies = _capture_replies(monkeypatch)
    app = build_app(settings=settings)

    with TestClient(app) as client:
        response = _post_line_events(client, settings, [_message_event("連結帳號", event_id="evt-unlinked")])

    assert response.status_code == 200, response.text
    assert response.json() == {"processed": 1, "skipped": 0}
    assert len(replies) == 1
    link_url = _only_uri(replies[0]["messages"])
    parsed = urlsplit(link_url)
    assert f"{parsed.scheme}://{parsed.netloc}" == APP_ORIGIN
    assert parsed.path == "/line/link"
    assert parsed.query == ""
    flow_values = parse_qs(parsed.fragment).get("flow")
    assert flow_values and len(flow_values) == 1 and len(flow_values[0]) >= 43
    assert "linkToken" not in link_url
    assert "nonce" not in link_url
    assert OFFICIAL_LINK_TOKEN not in link_url

    with app.state.session_factory() as session:
        attempt = session.exec(select(LineAccountLinkAttempt)).one()
        assert attempt.flow_token_hash != flow_values[0]
        assert OFFICIAL_LINK_TOKEN not in attempt.encrypted_link_token


def test_link_start_reply_failure_retries_stored_payload_without_new_attempt(test_settings, monkeypatch) -> None:
    settings = _line_settings(test_settings)
    monkeypatch.setattr("app.line_identity.issue_line_link_token", lambda *_args: OFFICIAL_LINK_TOKEN)
    reply_attempts: list[dict] = []

    def flaky_reply_line_messages(_settings, reply_token, messages):
        reply_attempts.append({"replyToken": reply_token, "messages": messages})
        if len(reply_attempts) == 1:
            raise LineBotDeliveryError("line_api_503")
        return {"status": "ok"}

    monkeypatch.setattr("app.routers.line.reply_line_messages", flaky_reply_line_messages)
    app = build_app(settings=settings)

    with TestClient(app) as client:
        first = _post_line_events(
            client,
            settings,
            [_message_event("連結帳號", event_id="evt-link-start-retry", reply_token="reply-first")],
        )

        assert first.status_code == 503, first.text
        with app.state.session_factory() as session:
            attempts = session.exec(select(LineAccountLinkAttempt)).all()
            assert len(attempts) == 1
            record = session.exec(
                select(LineWebhookEventRecord).where(
                    LineWebhookEventRecord.event_key == "evt-link-start-retry"
                )
            ).one()
            assert record.processed_status == "received"
            assert record.encrypted_reply_messages is not None

        retry = _post_line_events(
            client,
            settings,
            [_message_event("連結帳號", event_id="evt-link-start-retry", reply_token="reply-retry")],
        )

    assert retry.status_code == 200, retry.text
    assert retry.json() == {"processed": 1, "skipped": 0}
    assert [attempt["replyToken"] for attempt in reply_attempts] == ["reply-first", "reply-retry"]
    assert _only_uri(reply_attempts[0]["messages"]) == _only_uri(reply_attempts[1]["messages"])
    with app.state.session_factory() as session:
        assert len(session.exec(select(LineAccountLinkAttempt)).all()) == 1
        record = session.exec(
            select(LineWebhookEventRecord).where(
                LineWebhookEventRecord.event_key == "evt-link-start-retry"
            )
        ).one()
        assert record.processed_status == "processed"
        assert record.encrypted_reply_messages is None


def test_non_retryable_line_reply_failure_terminalizes_durable_event(test_settings, monkeypatch) -> None:
    settings = _line_settings(test_settings)
    monkeypatch.setattr("app.line_identity.issue_line_link_token", lambda *_args: OFFICIAL_LINK_TOKEN)

    def permanently_rejected_reply(_settings, _reply_token, _messages):
        raise LineBotDeliveryError("line_api_400", retryable=False, status_code=400)

    monkeypatch.setattr("app.routers.line.reply_line_messages", permanently_rejected_reply)
    app = build_app(settings=settings)

    event = _message_event(
        "連結帳號",
        event_id="evt-link-start-permanent-reply-failure",
        reply_token="reply-permanently-rejected",
    )
    with TestClient(app) as client:
        first = _post_line_events(client, settings, [event])
        redelivery = _post_line_events(client, settings, [event])

    assert first.status_code == 200, first.text
    assert first.json() == {"processed": 1, "skipped": 0}
    assert redelivery.status_code == 200, redelivery.text
    assert redelivery.json() == {"processed": 0, "skipped": 1}
    with app.state.session_factory() as session:
        assert len(session.exec(select(LineAccountLinkAttempt)).all()) == 1
        record = session.exec(
            select(LineWebhookEventRecord).where(
                LineWebhookEventRecord.event_key == "evt-link-start-permanent-reply-failure"
            )
        ).one()
        assert record.processed_status == "failed"
        assert record.error_message == "line_api_400"
        assert record.encrypted_reply_messages is None


def test_batch_later_retry_failure_does_not_rollback_prior_delivered_event(test_settings, monkeypatch) -> None:
    settings = _line_settings(test_settings)
    monkeypatch.setattr("app.line_identity.issue_line_link_token", lambda *_args: OFFICIAL_LINK_TOKEN)
    reply_attempts: list[dict] = []

    def fail_second_reply(_settings, reply_token, messages):
        reply_attempts.append({"replyToken": reply_token, "messages": messages})
        if len(reply_attempts) == 2:
            raise LineBotDeliveryError("line_api_503")
        return {"status": "ok"}

    monkeypatch.setattr("app.routers.line.reply_line_messages", fail_second_reply)
    app = build_app(settings=settings)
    pending_messages = [{"type": "text", "text": "stored pending reply"}]

    with TestClient(app) as client:
        with app.state.session_factory() as session:
            session.add(
                LineWebhookEventRecord(
                    event_key="evt-batch-pending",
                    processed_status="received",
                    encrypted_reply_messages=encrypt_line_account_link_reply_messages(
                        settings,
                        pending_messages,
                    ),
                )
            )
            session.commit()

        response = _post_line_events(
            client,
            settings,
            [
                _message_event("連結帳號", event_id="evt-batch-delivered", reply_token="reply-delivered"),
                _message_event("連結帳號", event_id="evt-batch-pending", reply_token="reply-pending"),
            ],
        )

    assert response.status_code == 503, response.text
    assert [attempt["replyToken"] for attempt in reply_attempts] == ["reply-delivered", "reply-pending"]
    with app.state.session_factory() as session:
        delivered = session.exec(
            select(LineWebhookEventRecord).where(
                LineWebhookEventRecord.event_key == "evt-batch-delivered"
            )
        ).one()
        pending = session.exec(
            select(LineWebhookEventRecord).where(
                LineWebhookEventRecord.event_key == "evt-batch-pending"
            )
        ).one()
        assert delivered.processed_status == "processed"
        assert delivered.encrypted_reply_messages is None
        assert pending.processed_status == "received"
        assert pending.encrypted_reply_messages is not None


def test_reply_encryption_failure_rolls_back_link_attempt_and_marks_event_failed(test_settings, monkeypatch) -> None:
    settings = _line_settings(test_settings)
    monkeypatch.setattr("app.line_identity.issue_line_link_token", lambda *_args: OFFICIAL_LINK_TOKEN)
    monkeypatch.setattr(
        "app.routers.line.encrypt_line_account_link_reply_messages",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(LineAccountLinkError("encryption_failed")),
    )
    replies = _capture_replies(monkeypatch)
    app = build_app(settings=settings)

    with TestClient(app) as client:
        response = _post_line_events(
            client,
            settings,
            [_message_event("連結帳號", event_id="evt-encryption-failed")],
        )

    assert response.status_code == 200, response.text
    assert response.json() == {"processed": 1, "skipped": 0}
    assert len(replies) == 1
    assert "處理 LINE 訊息時發生錯誤" in json.dumps(replies, ensure_ascii=False)
    with app.state.session_factory() as session:
        assert session.exec(select(LineAccountLinkAttempt)).all() == []
        record = session.exec(
            select(LineWebhookEventRecord).where(
                LineWebhookEventRecord.event_key == "evt-encryption-failed"
            )
        ).one()
        assert record.processed_status == "failed"
        assert record.error_message == "LineAccountLinkError"
        assert record.encrypted_reply_messages is None


def test_webhook_rejects_wrong_destination_before_persisting_event(test_settings) -> None:
    settings = _line_settings(test_settings)
    app = build_app(settings=settings)

    with TestClient(app) as client:
        response = _post_line_events(
            client,
            settings,
            [_message_event("異常", event_id="evt-wrong-destination")],
            destination_id="Udifferent-official-account",
        )

    assert response.status_code == 403, response.text
    assert response.json()["detail"] == "invalid_line_destination"
    with app.state.session_factory() as session:
        assert session.exec(select(LineWebhookEventRecord)).all() == []


def test_web_confirm_requires_bearer_and_exact_allowed_origin(test_settings, monkeypatch) -> None:
    settings = _line_settings(test_settings)
    monkeypatch.setattr("app.line_identity.issue_line_link_token", lambda *_args: OFFICIAL_LINK_TOKEN)
    app = build_app(settings=settings)

    with TestClient(app) as client:
        scope = _seed_line_scope(app, role="customer_admin", bind=False)
        with app.state.session_factory() as session:
            started = create_line_account_link_attempt(
                session,
                settings,
                destination_id=DESTINATION_ID,
                line_user_id=LINE_USER_ID,
            )
            session.commit()

        payload = {"flowToken": started.flow_token, "siteId": scope.site_id}
        missing_bearer = client.post(
            "/v1/line/account-links/complete",
            headers={"Origin": APP_ORIGIN},
            json=payload,
        )
        assert missing_bearer.status_code == 401, missing_bearer.text
        assert missing_bearer.json()["detail"] == "missing_bearer_token"

        headers = _login_web(client, email=scope.email)
        link_sites = client.get("/v1/line/account-links/sites", headers=headers)
        assert link_sites.status_code == 200, link_sites.text
        assert [item["siteId"] for item in link_sites.json()] == [scope.site_id]
        assert link_sites.headers["cache-control"] == "no-store"
        wrong_origin = client.post(
            "/v1/line/account-links/complete",
            headers={**headers, "Origin": "https://evil.example"},
            json=payload,
        )
        assert wrong_origin.status_code == 403, wrong_origin.text
        assert wrong_origin.json()["detail"] == "origin_not_allowed"

        confirmed = client.post(
            "/v1/line/account-links/complete",
            headers={**headers, "Origin": APP_ORIGIN},
            json=payload,
        )

    assert confirmed.status_code == 200, confirmed.text
    redirect_url = confirmed.json()["accountLinkUrl"]
    parsed_redirect = urlsplit(redirect_url)
    assert parsed_redirect.path.startswith("/v1/line/account-links/redirect/")
    assert parsed_redirect.query == ""
    assert parsed_redirect.fragment == ""
    assert OFFICIAL_LINK_TOKEN not in redirect_url
    with TestClient(app) as redirect_client:
        redirect = redirect_client.get(parsed_redirect.path, follow_redirects=False)
        assert redirect.status_code == 303, redirect.text
        assert redirect.headers["cache-control"] == "no-store"
        assert redirect.headers["referrer-policy"] == "no-referrer"
        query = parse_qs(urlsplit(redirect.headers["location"]).query)
        assert query["linkToken"] == [OFFICIAL_LINK_TOKEN]
        assert len(query["nonce"][0]) >= 43
        replay = redirect_client.get(parsed_redirect.path, follow_redirects=False)
        assert replay.status_code == 410


def test_account_link_webhook_redacts_nonce_binds_once_and_rejects_replay(test_settings, monkeypatch) -> None:
    settings = _line_settings(test_settings)
    monkeypatch.setattr("app.line_identity.issue_line_link_token", lambda *_args: OFFICIAL_LINK_TOKEN)
    replies = _capture_replies(monkeypatch)
    app = build_app(settings=settings)

    with TestClient(app) as client:
        scope = _seed_line_scope(app, role="customer_admin", bind=False)
        flow_token = _create_flow(app, settings)
        headers = _login_web(client, email=scope.email)
        confirmed = client.post(
            "/v1/line/account-links/complete",
            headers={**headers, "Origin": APP_ORIGIN},
            json={"flowToken": flow_token, "siteId": scope.site_id},
        )
        assert confirmed.status_code == 200, confirmed.text
        redirect_path = urlsplit(confirmed.json()["accountLinkUrl"]).path
        redirect = client.get(redirect_path, follow_redirects=False)
        assert redirect.status_code == 303, redirect.text
        nonce = parse_qs(urlsplit(redirect.headers["location"]).query)["nonce"][0]

        first = _post_line_events(
            client,
            settings,
            [
                _account_link_event(
                    nonce,
                    event_id="evt-account-link-success",
                    reply_token="reply-account-link-success",
                )
            ],
        )
        replay = _post_line_events(
            client,
            settings,
            [_account_link_event(nonce, event_id="evt-account-link-replay")],
        )

    assert first.status_code == 200, first.text
    assert first.json() == {"processed": 1, "skipped": 0}
    assert len(replies) == 1
    assert replies[0]["replyToken"] == "reply-account-link-success"
    assert replay.status_code == 200, replay.text
    assert replay.json() == {"processed": 1, "skipped": 0}

    with app.state.session_factory() as session:
        bindings = session.exec(select(LineUserBinding)).all()
        assert len(bindings) == 1
        binding = bindings[0]
        assert binding.destination_id == DESTINATION_ID
        assert binding.line_user_id == LINE_USER_ID
        assert binding.user_id == scope.user_id
        assert binding.site_id == scope.site_id
        assert binding.is_active is True

        success_record = session.exec(
            select(LineWebhookEventRecord).where(
                LineWebhookEventRecord.event_key == "evt-account-link-success"
            )
        ).one()
        persisted_success = json.dumps(success_record.payload_json, ensure_ascii=False, sort_keys=True)
        assert nonce not in persisted_success
        assert success_record.processed_status == "processed"

        replay_record = session.exec(
            select(LineWebhookEventRecord).where(
                LineWebhookEventRecord.event_key == "evt-account-link-replay"
            )
        ).one()
        persisted_replay = json.dumps(replay_record.payload_json, ensure_ascii=False, sort_keys=True)
        assert nonce not in persisted_replay
        assert replay_record.processed_status == "failed"
        assert replay_record.error_message == "LineAccountLinkError"
        assert nonce not in (replay_record.error_message or "")


def test_account_link_conflict_retirement_survives_webhook_failure_recording(test_settings, monkeypatch) -> None:
    settings = _line_settings(test_settings)
    monkeypatch.setattr("app.line_identity.issue_line_link_token", lambda *_args: OFFICIAL_LINK_TOKEN)
    app = build_app(settings=settings)

    with TestClient(app) as client:
        scope = _seed_line_scope(app, role="customer_admin", bind=False)
        nonce = _confirm_flow_and_get_nonce(client, app, settings, scope)
        with app.state.session_factory() as session:
            conflicting_user = seed_user(
                session,
                email="line-conflicting-user@example.test",
                password=PASSWORD,
                org_roles=[(scope.organization_id, "customer_admin")],
            )
            session.add(
                LineUserBinding(
                    destination_id=DESTINATION_ID,
                    line_user_id=LINE_USER_ID,
                    user_id=conflicting_user.id,
                    site_id=scope.site_id,
                    is_active=True,
                )
            )
            session.commit()

        response = _post_line_events(
            client,
            settings,
            [_account_link_event(nonce, event_id="evt-account-link-conflict")],
        )

    assert response.status_code == 200, response.text
    assert response.json() == {"processed": 1, "skipped": 0}
    with app.state.session_factory() as session:
        attempt = session.exec(select(LineAccountLinkAttempt)).one()
        assert attempt.status == "failed"
        assert attempt.is_current is None
        assert attempt.consumed_at is not None
        assert attempt.encrypted_link_token is None
        assert attempt.redirect_token_hash is None
        record = session.exec(
            select(LineWebhookEventRecord).where(
                LineWebhookEventRecord.event_key == "evt-account-link-conflict"
            )
        ).one()
        assert record.processed_status == "failed"
        assert record.error_message == "LineAccountLinkConflictError"


def test_account_link_expiry_retirement_survives_webhook_failure_recording(test_settings, monkeypatch) -> None:
    settings = _line_settings(test_settings)
    monkeypatch.setattr("app.line_identity.issue_line_link_token", lambda *_args: OFFICIAL_LINK_TOKEN)
    app = build_app(settings=settings)

    with TestClient(app) as client:
        scope = _seed_line_scope(app, role="customer_admin", bind=False)
        nonce = _confirm_flow_and_get_nonce(client, app, settings, scope)
        with app.state.session_factory() as session:
            attempt = session.exec(select(LineAccountLinkAttempt)).one()
            attempt.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
            session.add(attempt)
            session.commit()

        response = _post_line_events(
            client,
            settings,
            [_account_link_event(nonce, event_id="evt-account-link-expired")],
        )

    assert response.status_code == 200, response.text
    assert response.json() == {"processed": 1, "skipped": 0}
    with app.state.session_factory() as session:
        attempt = session.exec(select(LineAccountLinkAttempt)).one()
        assert attempt.status == "expired"
        assert attempt.is_current is None
        assert attempt.consumed_at is None
        assert attempt.encrypted_link_token is None
        assert attempt.redirect_token_hash is None
        record = session.exec(
            select(LineWebhookEventRecord).where(
                LineWebhookEventRecord.event_key == "evt-account-link-expired"
            )
        ).one()
        assert record.processed_status == "failed"
        assert record.error_message == "LineAccountLinkError"


def test_account_link_reply_failure_retries_without_consuming_nonce_twice(test_settings, monkeypatch) -> None:
    settings = _line_settings(test_settings)
    monkeypatch.setattr("app.line_identity.issue_line_link_token", lambda *_args: OFFICIAL_LINK_TOKEN)
    reply_attempts: list[dict] = []
    consume_calls = 0
    real_consume = line_router.consume_line_account_link

    def counted_consume(*args, **kwargs):
        nonlocal consume_calls
        consume_calls += 1
        return real_consume(*args, **kwargs)

    def flaky_reply_line_messages(_settings, reply_token, messages):
        reply_attempts.append({"replyToken": reply_token, "messages": messages})
        if len(reply_attempts) == 1:
            raise LineBotDeliveryError("line_api_503")
        return {"status": "ok"}

    monkeypatch.setattr("app.routers.line.consume_line_account_link", counted_consume)
    monkeypatch.setattr("app.routers.line.reply_line_messages", flaky_reply_line_messages)
    app = build_app(settings=settings)

    with TestClient(app) as client:
        scope = _seed_line_scope(app, role="customer_admin", bind=False)
        flow_token = _create_flow(app, settings)
        headers = _login_web(client, email=scope.email)
        confirmed = client.post(
            "/v1/line/account-links/complete",
            headers={**headers, "Origin": APP_ORIGIN},
            json={"flowToken": flow_token, "siteId": scope.site_id},
        )
        redirect_path = urlsplit(confirmed.json()["accountLinkUrl"]).path
        redirect = client.get(redirect_path, follow_redirects=False)
        nonce = parse_qs(urlsplit(redirect.headers["location"]).query)["nonce"][0]

        first = _post_line_events(
            client,
            settings,
            [
                _account_link_event(
                    nonce,
                    event_id="evt-account-link-retry",
                    reply_token="reply-first",
                )
            ],
        )

        assert first.status_code == 503, first.text
        with app.state.session_factory() as session:
            bindings = session.exec(select(LineUserBinding)).all()
            assert len(bindings) == 1
            assert bindings[0].is_active is True
            record = session.exec(
                select(LineWebhookEventRecord).where(
                    LineWebhookEventRecord.event_key == "evt-account-link-retry"
                )
            ).one()
            assert record.processed_status == "received"
            assert record.encrypted_reply_messages is not None

        retry = _post_line_events(
            client,
            settings,
            [
                _account_link_event(
                    nonce,
                    event_id="evt-account-link-retry",
                    reply_token="reply-retry",
                )
            ],
        )

    assert retry.status_code == 200, retry.text
    assert retry.json() == {"processed": 1, "skipped": 0}
    assert consume_calls == 1
    assert [attempt["replyToken"] for attempt in reply_attempts] == ["reply-first", "reply-retry"]
    assert reply_attempts[0]["messages"] == reply_attempts[1]["messages"]
    with app.state.session_factory() as session:
        assert len(session.exec(select(LineUserBinding)).all()) == 1
        record = session.exec(
            select(LineWebhookEventRecord).where(
                LineWebhookEventRecord.event_key == "evt-account-link-retry"
            )
        ).one()
        assert record.processed_status == "processed"
        assert record.encrypted_reply_messages is None


def test_failed_account_link_without_source_retires_attempt(test_settings, monkeypatch) -> None:
    settings = _line_settings(test_settings)
    monkeypatch.setattr("app.line_identity.issue_line_link_token", lambda *_args: OFFICIAL_LINK_TOKEN)
    app = build_app(settings=settings)

    with TestClient(app) as client:
        scope = _seed_line_scope(app, role="customer_admin", bind=False)
        flow_token = _create_flow(app, settings)
        headers = _login_web(client, email=scope.email)
        confirmed = client.post(
            "/v1/line/account-links/complete",
            headers={**headers, "Origin": APP_ORIGIN},
            json={"flowToken": flow_token, "siteId": scope.site_id},
        )
        redirect_path = urlsplit(confirmed.json()["accountLinkUrl"]).path
        redirect = client.get(redirect_path, follow_redirects=False)
        nonce = parse_qs(urlsplit(redirect.headers["location"]).query)["nonce"][0]
        failed = _post_line_events(
            client,
            settings,
            [
                _account_link_event(
                    nonce,
                    event_id="evt-account-link-failed",
                    result="failed",
                    include_source=False,
                )
            ],
        )
        redelivery = _post_line_events(
            client,
            settings,
            [
                _account_link_event(
                    nonce,
                    event_id="evt-account-link-failed",
                    result="failed",
                    include_source=False,
                )
            ],
        )

    assert failed.status_code == 200, failed.text
    assert failed.json() == {"processed": 1, "skipped": 0}
    assert redelivery.status_code == 200, redelivery.text
    assert redelivery.json() == {"processed": 0, "skipped": 1}
    with app.state.session_factory() as session:
        attempt = session.exec(select(LineAccountLinkAttempt)).one()
        assert attempt.status == "failed"
        assert attempt.consumed_at is not None
        assert attempt.encrypted_link_token is None
        assert attempt.redirect_token_hash is None
        assert session.exec(select(LineUserBinding)).all() == []
        record = session.exec(
            select(LineWebhookEventRecord).where(
                LineWebhookEventRecord.event_key == "evt-account-link-failed"
            )
        ).one()
        assert record.processed_status == "processed"
        assert record.encrypted_reply_messages is None


def test_linked_direct_read_is_scoped_to_selected_site(test_settings, monkeypatch) -> None:
    settings = _line_settings(test_settings)
    replies = _capture_replies(monkeypatch)
    app = build_app(settings=settings)

    with TestClient(app) as client:
        scope = _seed_line_scope(app, role="customer_viewer", bind=True)
        with app.state.session_factory() as session:
            now = datetime.now(timezone.utc)
            session.add(
                IncidentRecord(
                    organization_id=scope.organization_id,
                    site_id=scope.site_id,
                    title="ALLOWED_SITE_MARKER",
                    severity="high",
                    status="pending_review",
                    source="camera",
                    created_at=now,
                    updated_at=now,
                )
            )
            session.add(
                IncidentRecord(
                    organization_id=scope.organization_id,
                    site_id=scope.other_site_id,
                    title="FORBIDDEN_SITE_MARKER",
                    severity="critical",
                    status="pending_review",
                    source="camera",
                    created_at=now,
                    updated_at=now,
                )
            )
            session.commit()

        response = _post_line_events(client, settings, [_message_event("異常", event_id="evt-site-read")])

    assert response.status_code == 200, response.text
    reply_payload = json.dumps(replies, ensure_ascii=False)
    assert "ALLOWED_SITE_MARKER" in reply_payload
    assert "FORBIDDEN_SITE_MARKER" not in reply_payload
    assert "今日新增：1 件" in reply_payload


def test_viewer_cannot_create_incident_from_direct_postback(test_settings, monkeypatch) -> None:
    settings = _line_settings(test_settings)
    replies = _capture_replies(monkeypatch)
    app = build_app(settings=settings)

    with TestClient(app) as client:
        _seed_line_scope(app, role="customer_viewer", bind=True)
        response = _post_line_events(
            client,
            settings,
            [
                _postback_event(
                    "action=report_machine_incident&machineId=m-hc600",
                    event_id="evt-viewer-write",
                )
            ],
        )

    assert response.status_code == 200, response.text
    with app.state.session_factory() as session:
        assert session.exec(select(IncidentRecord)).all() == []
    reply_payload = json.dumps(replies, ensure_ascii=False)
    assert "沒有此場域的寫入權限" in reply_payload
    assert "已建立待確認異常" not in reply_payload
    assert "處理 LINE 訊息時發生錯誤" not in reply_payload


def test_cross_site_incident_postback_never_mutates_or_leaks_incident(test_settings, monkeypatch) -> None:
    settings = _line_settings(test_settings)
    replies = _capture_replies(monkeypatch)
    app = build_app(settings=settings)

    with TestClient(app) as client:
        scope = _seed_line_scope(app, role="customer_admin", bind=True)
        with app.state.session_factory() as session:
            incident = IncidentRecord(
                organization_id=scope.organization_id,
                site_id=scope.other_site_id,
                title="CROSS_SITE_SECRET_MARKER",
                severity="high",
                status="pending_review",
                source="camera",
            )
            session.add(incident)
            session.commit()
            incident_id = incident.id

        response = _post_line_events(
            client,
            settings,
            [
                _postback_event(
                    f"action=confirm_incident&incidentId={incident_id}",
                    event_id="evt-cross-site",
                )
            ],
        )

    assert response.status_code == 200, response.text
    with app.state.session_factory() as session:
        incident = session.get(IncidentRecord, incident_id)
        assert incident is not None
        assert incident.status == "pending_review"
        histories = session.exec(
            select(IncidentHistoryRecord).where(IncidentHistoryRecord.incident_id == incident_id)
        ).all()
        assert histories == []
    reply_payload = json.dumps(replies, ensure_ascii=False)
    assert "CROSS_SITE_SECRET_MARKER" not in reply_payload
    assert "已確認異常" not in reply_payload
    assert "處理 LINE 訊息時發生錯誤" not in reply_payload


def test_unlink_takes_effect_before_next_direct_event(test_settings, monkeypatch) -> None:
    settings = _line_settings(test_settings)
    monkeypatch.setattr("app.line_identity.issue_line_link_token", lambda *_args: OFFICIAL_LINK_TOKEN)
    replies = _capture_replies(monkeypatch)
    app = build_app(settings=settings)

    with TestClient(app) as client:
        scope = _seed_line_scope(app, role="customer_admin", bind=True)
        with app.state.session_factory() as session:
            session.add(
                IncidentRecord(
                    organization_id=scope.organization_id,
                    site_id=scope.site_id,
                    title="MUST_NOT_APPEAR_AFTER_UNLINK",
                    severity="high",
                    status="pending_review",
                    source="camera",
                )
            )
            session.commit()

        response = _post_line_events(
            client,
            settings,
            [
                _message_event("解除連結", event_id="evt-unlink", reply_token="reply-unlink"),
                _message_event("連結帳號", event_id="evt-after-unlink", reply_token="reply-after-unlink"),
            ],
        )

    assert response.status_code == 200, response.text
    assert response.json() == {"processed": 2, "skipped": 0}
    assert len(replies) == 2
    assert "已解除" in json.dumps(replies[0], ensure_ascii=False)
    assert "MUST_NOT_APPEAR_AFTER_UNLINK" not in json.dumps(replies[1], ensure_ascii=False)
    relink_url = _only_uri(replies[1]["messages"])
    assert relink_url.startswith(f"{APP_ORIGIN}/line/link#flow=")

    with app.state.session_factory() as session:
        binding = session.exec(
            select(LineUserBinding).where(
                LineUserBinding.destination_id == DESTINATION_ID,
                LineUserBinding.line_user_id == LINE_USER_ID,
            )
        ).one()
        assert binding.is_active is False
        assert len(session.exec(select(LineAccountLinkAttempt)).all()) == 1


def _line_settings(test_settings):
    return replace(
        test_settings,
        app_origin=APP_ORIGIN,
        line_public_base_url="https://api.example.test",
        line_channel_access_token="channel-token",
        line_channel_secret="channel-secret",
        line_webhook_enabled=True,
        line_destination_id=DESTINATION_ID,
        line_account_linking_enabled=True,
        line_account_link_encryption_keys=(Fernet.generate_key().decode("ascii"),),
    )


def _seed_line_scope(app, *, role: str, bind: bool) -> SeededLineScope:
    layout = load_floorplan_layout("jingcheng")
    email = f"line-{role}-{int(bind)}@example.test"
    with app.state.session_factory() as session:
        organization = seed_organization(session, name=f"LINE {role} Org")
        user = seed_user(
            session,
            email=email,
            password=PASSWORD,
            org_roles=[(organization.id, role)],
        )
        site = Site(
            id=layout.site_id,
            organization_id=organization.id,
            name="靚程工廠",
            address="台南市永康區工業路 1 號",
            lat=23.0,
            lng=120.2,
        )
        other_site = Site(
            organization_id=organization.id,
            name="其他場域",
            address="不得由已選場域讀取",
            lat=23.1,
            lng=120.3,
        )
        session.add(site)
        session.add(other_site)
        session.flush()
        if bind:
            session.add(
                LineUserBinding(
                    destination_id=DESTINATION_ID,
                    line_user_id=LINE_USER_ID,
                    user_id=user.id,
                    site_id=site.id,
                    is_active=True,
                )
            )
        session.commit()
        return SeededLineScope(
            user_id=user.id,
            email=email,
            organization_id=organization.id,
            site_id=site.id,
            other_site_id=other_site.id,
        )


def _create_flow(app, settings) -> str:
    with app.state.session_factory() as session:
        started = create_line_account_link_attempt(
            session,
            settings,
            destination_id=DESTINATION_ID,
            line_user_id=LINE_USER_ID,
        )
        session.commit()
        return started.flow_token


def _confirm_flow_and_get_nonce(
    client: TestClient,
    app,
    settings,
    scope: SeededLineScope,
) -> str:
    flow_token = _create_flow(app, settings)
    headers = _login_web(client, email=scope.email)
    confirmed = client.post(
        "/v1/line/account-links/complete",
        headers={**headers, "Origin": APP_ORIGIN},
        json={"flowToken": flow_token, "siteId": scope.site_id},
    )
    assert confirmed.status_code == 200, confirmed.text
    redirect_path = urlsplit(confirmed.json()["accountLinkUrl"]).path
    redirect = client.get(redirect_path, follow_redirects=False)
    assert redirect.status_code == 303, redirect.text
    return parse_qs(urlsplit(redirect.headers["location"]).query)["nonce"][0]


def _login_web(client: TestClient, *, email: str) -> dict[str, str]:
    response = client.post(
        "/v1/web/session/login",
        headers={"Origin": APP_ORIGIN},
        json={"email": email, "password": PASSWORD},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['accessToken']}"}


def _capture_replies(monkeypatch) -> list[dict]:
    replies: list[dict] = []

    def fake_reply_line_messages(_settings, reply_token, messages):
        replies.append({"replyToken": reply_token, "messages": messages})
        return {"status": "ok"}

    monkeypatch.setattr("app.routers.line.reply_line_messages", fake_reply_line_messages)
    return replies


def _post_line_events(
    client: TestClient,
    settings,
    events: list[dict],
    *,
    destination_id: str = DESTINATION_ID,
):
    payload = {"destination": destination_id, "events": events}
    raw_body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    signature = base64.b64encode(
        hmac.new(settings.line_channel_secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    ).decode("utf-8")
    return client.post(
        "/v1/line/webhook",
        content=raw_body,
        headers={"x-line-signature": signature, "content-type": "application/json"},
    )


def _message_event(
    text: str,
    *,
    event_id: str,
    reply_token: str | None = None,
) -> dict:
    return {
        "type": "message",
        "webhookEventId": event_id,
        "replyToken": reply_token or f"reply-{event_id}",
        "source": {"type": "user", "userId": LINE_USER_ID},
        "timestamp": 1780000000000,
        "message": {"id": f"message-{event_id}", "type": "text", "text": text},
    }


def _postback_event(data: str, *, event_id: str) -> dict:
    return {
        "type": "postback",
        "webhookEventId": event_id,
        "replyToken": f"reply-{event_id}",
        "source": {"type": "user", "userId": LINE_USER_ID},
        "timestamp": 1780000000000,
        "postback": {"data": data},
    }


def _account_link_event(
    nonce: str,
    *,
    event_id: str,
    result: str = "ok",
    include_source: bool = True,
    reply_token: str | None = None,
) -> dict:
    event = {
        "type": "accountLink",
        "webhookEventId": event_id,
        "timestamp": 1780000000000,
        "link": {"result": result, "nonce": nonce},
    }
    if reply_token is not None:
        event["replyToken"] = reply_token
    if include_source:
        event["source"] = {"type": "user", "userId": LINE_USER_ID}
    return event


def _only_uri(value) -> str:
    uris: list[str] = []

    def visit(item) -> None:
        if isinstance(item, dict):
            uri = item.get("uri")
            if isinstance(uri, str):
                uris.append(uri)
            for child in item.values():
                visit(child)
        elif isinstance(item, list):
            for child in item:
                visit(child)

    visit(value)
    assert len(uris) == 1, uris
    return uris[0]
