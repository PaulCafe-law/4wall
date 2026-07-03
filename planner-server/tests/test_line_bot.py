from __future__ import annotations

import base64
from dataclasses import replace
import hashlib
import hmac
import json

from fastapi.testclient import TestClient
from sqlmodel import select

from app.line_bot import verify_line_signature
from app.main import build_app
from app.models import IncidentHistoryRecord, IncidentRecord, LineWebhookEventRecord
from tests.helpers import login_web, seed_organization, seed_user


PASSWORD = "Password123!"


def test_line_signature_verification_uses_raw_body() -> None:
    secret = "channel-secret"
    raw_body = b'{"destination":"U00000000000000000000000000000000","events":[]}'
    signature = base64.b64encode(
        hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    ).decode("utf-8")

    assert verify_line_signature(raw_body, signature, secret) is True
    assert verify_line_signature(raw_body + b"\n", signature, secret) is False


def test_line_webhook_postback_updates_incident_and_is_idempotent(test_settings, monkeypatch) -> None:
    settings = replace(
        test_settings,
        line_channel_access_token="test-token",
        line_channel_secret="test-secret",
        line_webhook_enabled=True,
        line_incident_notify_enabled=False,
        line_default_group_id="group-1",
        app_origin=None,
    )
    app = build_app(settings=settings)
    replies: list[str] = []

    def fake_reply_line_messages(_settings, _reply_token, messages):
        replies.extend(message["text"] for message in messages)
        return {"status": "ok"}

    monkeypatch.setattr("app.routers.line.reply_line_messages", fake_reply_line_messages)

    with TestClient(app) as client:
        with app.state.session_factory() as session:
            org = seed_organization(session, name="Line Org")
            org_id = org.id
            seed_user(session, email="line@incident.test", password=PASSWORD, org_roles=[(org_id, "customer_admin")])
            session.commit()

        headers, _ = login_web(client, email="line@incident.test", password=PASSWORD)
        create_response = client.post(
            "/v1/incidents",
            headers=headers,
            json={
                "organizationId": org_id,
                "title": "馬達周邊疑似漏油",
                "severity": "high",
                "source": "camera",
                "location": {"siteName": "工廠 A", "equipmentName": "馬達 M2"},
            },
        )
        incident_id = create_response.json()["incidentId"]
        payload = {
            "destination": "U00000000000000000000000000000000",
            "events": [
                {
                    "type": "postback",
                    "webhookEventId": "webhook-event-1",
                    "replyToken": "reply-token-1",
                    "source": {"type": "user", "userId": "Ulineuser"},
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
