from __future__ import annotations

import base64
from dataclasses import replace
import hashlib
import hmac
import json
from threading import get_ident

from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from sqlmodel import select

from app.line_bot import verify_line_signature
from app.line_identity import LineConversationScope
from app.main import build_app
from app.models import IncidentHistoryRecord, IncidentRecord, LineUserBinding, LineWebhookEventRecord, Site
import app.routers.line as line_router
from tests.helpers import login_web, seed_organization, seed_user


PASSWORD = "Password123!"
DESTINATION_ID = "U00000000000000000000000000000000"
JINGCHENG_SITE_ID = "dd6cbdd3aa744736ad96d2791d689fce"
LINE_USER_ID = "Ulineuser"


def _configured_line_settings(test_settings, **overrides):
    values = {
        "line_channel_access_token": "test-token",
        "line_channel_secret": "test-secret",
        "line_webhook_enabled": True,
    }
    values.update(overrides)
    return replace(test_settings, **values)


def test_line_signature_verification_uses_raw_body() -> None:
    secret = "channel-secret"
    raw_body = b'{"destination":"U00000000000000000000000000000000","events":[]}'
    signature = base64.b64encode(
        hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    ).decode("utf-8")

    assert verify_line_signature(raw_body, signature, secret) is True
    assert verify_line_signature(raw_body + b"\n", signature, secret) is False


def test_line_webhook_rejects_streamed_body_over_limit_before_signature(test_settings, monkeypatch) -> None:
    settings = _configured_line_settings(test_settings)
    app = build_app(settings=settings)

    def fail_signature_check(*_args, **_kwargs):
        raise AssertionError("oversized body must be rejected before signature verification")

    monkeypatch.setattr(line_router, "verify_line_signature", fail_signature_check)

    def oversized_chunks():
        yield b"{" + (b"x" * (line_router.LINE_WEBHOOK_MAX_BODY_BYTES // 2))
        yield b"x" * (line_router.LINE_WEBHOOK_MAX_BODY_BYTES // 2 + 1)

    with TestClient(app) as client:
        response = client.post(
            "/v1/line/webhook",
            content=oversized_chunks(),
            headers={"x-line-signature": "invalid", "content-type": "application/json"},
        )

    assert response.status_code == 413, response.text
    assert response.json()["detail"] == "line_webhook_body_too_large"
    with app.state.session_factory() as session:
        assert session.exec(select(LineWebhookEventRecord)).all() == []


def test_line_webhook_runs_sync_event_processing_in_threadpool(test_settings, monkeypatch) -> None:
    settings = _configured_line_settings(test_settings)
    app = build_app(settings=settings)
    thread_ids: dict[str, int] = {}

    def fake_verify_signature(*_args, **_kwargs) -> bool:
        thread_ids["event_loop"] = get_ident()
        return True

    def fake_process(*_args, **_kwargs):
        thread_ids["worker"] = get_ident()
        return line_router.LineWebhookResponseDto(processed=0, skipped=0)

    monkeypatch.setattr(line_router, "verify_line_signature", fake_verify_signature)
    monkeypatch.setattr(line_router, "_process_line_webhook_events", fake_process)

    with TestClient(app) as client:
        response = client.post(
            "/v1/line/webhook",
            content=b'{"destination":"Uofficial","events":[]}',
            headers={"x-line-signature": "accepted", "content-type": "application/json"},
        )

    assert response.status_code == 200, response.text
    assert response.json() == {"processed": 0, "skipped": 0}
    assert thread_ids["event_loop"] != thread_ids["worker"]


def test_line_webhook_event_claim_treats_savepoint_unique_conflict_as_duplicate(
    test_settings,
    monkeypatch,
) -> None:
    app = build_app(settings=test_settings)
    with TestClient(app):
        with app.state.session_factory() as session:
            session.add(LineWebhookEventRecord(event_key="duplicate-event"))
            session.commit()
            original_exec = session.exec
            exec_count = 0

            class EmptyResult:
                @staticmethod
                def first():
                    return None

            def simulate_concurrent_insert(statement, *args, **kwargs):
                nonlocal exec_count
                exec_count += 1
                if exec_count == 1:
                    return EmptyResult()
                return original_exec(statement, *args, **kwargs)

            monkeypatch.setattr(session, "exec", simulate_concurrent_insert)
            claimed, is_fresh = line_router._claim_line_webhook_event(
                session,
                event={"type": "message", "source": {"type": "user", "userId": LINE_USER_ID}},
                event_key="duplicate-event",
            )

            assert claimed is None
            assert is_fresh is False
            assert exec_count == 2
            assert len(original_exec(select(LineWebhookEventRecord)).all()) == 1


def test_group_write_identity_is_disabled_with_account_linking_flag(test_settings, monkeypatch) -> None:
    settings = _configured_line_settings(test_settings, line_account_linking_enabled=False)
    replies: list[dict] = []

    def fake_reply(_settings, _reply_token, messages):
        replies.extend(messages)
        return {"status": "ok"}

    monkeypatch.setattr(line_router, "reply_line_messages", fake_reply)
    binding = LineConversationScope(
        destination_id=DESTINATION_ID,
        source_type="group",
        source_id="G-bound",
        organization_id="org-1",
        site_id=JINGCHENG_SITE_ID,
        site_slug="jingcheng",
        actor_user_id=None,
        can_write=True,
    )
    event = {
        "replyToken": "reply-disabled-write",
        "source": {"type": "group", "groupId": "G-bound", "userId": LINE_USER_ID},
    }

    actor = line_router._write_actor_or_reply(None, settings, event, DESTINATION_ID, binding)

    assert actor is False
    assert len(replies) == 1
    assert "沒有此場域的寫入權限" in replies[0]["text"]


def test_line_webhook_postback_updates_incident_and_is_idempotent(test_settings, monkeypatch) -> None:
    settings = _configured_line_settings(
        test_settings,
        line_incident_notify_enabled=False,
        line_default_group_id="group-1",
        line_account_linking_enabled=True,
        line_account_link_encryption_keys=(Fernet.generate_key().decode("ascii"),),
        line_destination_id=DESTINATION_ID,
        line_public_base_url="https://api.example.test",
        app_origin="https://app.example.test",
    )
    app = build_app(settings=settings)
    replies: list[str] = []

    def fake_reply_line_messages(_settings, _reply_token, messages):
        replies.extend(message["text"] for message in messages)
        return {"status": "ok"}

    monkeypatch.setattr("app.routers.line.reply_line_messages", fake_reply_line_messages)

    with TestClient(app, headers={"Origin": "https://app.example.test"}) as client:
        with app.state.session_factory() as session:
            org = seed_organization(session, name="Line Org")
            org_id = org.id
            user = seed_user(
                session,
                email="line@incident.test",
                password=PASSWORD,
                org_roles=[(org_id, "customer_admin")],
            )
            site = Site(
                id=JINGCHENG_SITE_ID,
                organization_id=org_id,
                name="靚程工廠",
                address="Jingcheng",
                lat=25.0,
                lng=121.0,
            )
            session.add(site)
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

        headers, _ = login_web(client, email="line@incident.test", password=PASSWORD)
        create_response = client.post(
            "/v1/incidents",
            headers=headers,
            json={
                "organizationId": org_id,
                "siteId": JINGCHENG_SITE_ID,
                "title": "馬達周邊疑似漏油",
                "severity": "high",
                "source": "camera",
                "location": {"siteName": "工廠 A", "equipmentName": "馬達 M2"},
            },
        )
        incident_id = create_response.json()["incidentId"]
        payload = {
            "destination": DESTINATION_ID,
            "events": [
                {
                    "type": "postback",
                    "webhookEventId": "webhook-event-1",
                    "replyToken": "reply-token-1",
                    "source": {"type": "user", "userId": LINE_USER_ID},
                    "timestamp": 1770000000000,
                    "postback": {"data": f"action=confirm_incident&incidentId={incident_id}"},
                }
            ],
        }
        raw_body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        signature = base64.b64encode(
            hmac.new(settings.line_channel_secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
        ).decode("utf-8")

        first = client.post(
            "/v1/line/webhook",
            content=raw_body,
            headers={"x-line-signature": signature, "content-type": "application/json"},
        )
        second = client.post(
            "/v1/line/webhook",
            content=raw_body,
            headers={"x-line-signature": signature, "content-type": "application/json"},
        )

        assert first.status_code == 200, first.text
        assert first.json() == {"processed": 1, "skipped": 0}
        assert second.status_code == 200, second.text
        assert second.json() == {"processed": 0, "skipped": 1}
        assert replies == ["已確認異常：馬達周邊疑似漏油"]

        with app.state.session_factory() as session:
            incident = session.get(IncidentRecord, incident_id)
            assert incident is not None
            assert incident.status == "confirmed"
            assert len(session.exec(select(LineWebhookEventRecord)).all()) == 1
            histories = session.exec(
                select(IncidentHistoryRecord).where(IncidentHistoryRecord.incident_id == incident_id)
            ).all()
            assert [item.action for item in histories].count("incident.status_changed") == 1
