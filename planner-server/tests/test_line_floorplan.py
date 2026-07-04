from __future__ import annotations

import base64
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from io import BytesIO
import hashlib
import hmac
import json
from uuid import uuid4

from fastapi.testclient import TestClient
from PIL import Image
import pytest
from sqlmodel import select

from app.incidents import record_incident_line_notification
from app.line_floorplan.render import clear_floorplan_render_cache
from app.line_floorplan.tokens import (
    FloorplanTokenError,
    create_floorplan_liveview_token,
    create_floorplan_render_token,
    verify_floorplan_liveview_token,
    verify_floorplan_render_token,
)
from app.main import build_app
from app.models import (
    CameraDevice,
    CameraFrame,
    CameraGaugeReading,
    IncidentLineNotificationRecord,
    IncidentRecord,
    LineGroupBinding,
    Site,
)
from tests.helpers import seed_organization


JINGCHENG_SITE_ID = "dd6cbdd3aa744736ad96d2791d689fce"
BOUND_GROUP_ID = "Cjingcheng-bound"


class FakeStorage:
    def __init__(self, get_url: str | None = "https://signed.example.test/frame.jpg") -> None:
        self.get_url = get_url
        self.get_url_calls: list[dict] = []

    def write(self, *, key: str, data: bytes, content_type: str, cache_control: str):
        raise AssertionError("write should not be called")

    def read(self, key: str) -> bytes | None:
        return None

    def delete(self, key: str) -> None:
        return None

    def create_presigned_put_url(
        self,
        *,
        key: str,
        content_type: str,
        cache_control: str,
        expires_in_seconds: int,
    ) -> str | None:
        raise AssertionError("put presign should not be called")

    def create_presigned_get_url(self, *, key: str, expires_in_seconds: int) -> str | None:
        self.get_url_calls.append({"key": key, "expires_in_seconds": expires_in_seconds})
        return self.get_url


def test_floorplan_liveview_token_purpose_and_legacy_render_compatibility(test_settings) -> None:
    settings = _line_settings(test_settings)
    now = datetime.now(timezone.utc)
    liveview_token = create_floorplan_liveview_token(settings, site_slug="jingcheng", group_id=BOUND_GROUP_ID, now=now)
    payload = verify_floorplan_liveview_token(settings, site_slug="jingcheng", token=liveview_token, now=now)

    assert payload.purpose == "liveview"
    assert payload.group_id == BOUND_GROUP_ID
    with pytest.raises(FloorplanTokenError):
        verify_floorplan_liveview_token(
            settings,
            site_slug="jingcheng",
            token=create_floorplan_render_token(settings, site_slug="jingcheng", group_id=BOUND_GROUP_ID, now=now),
            now=now,
        )

    legacy_body = _floorplan_token_body(
        {"groupId": BOUND_GROUP_ID, "issuedAt": int(now.timestamp()), "siteSlug": "jingcheng"}
    )
    legacy_signature = _floorplan_token_signature(settings.auth_secret_key, legacy_body)
    legacy_payload = verify_floorplan_render_token(
        settings,
        site_slug="jingcheng",
        token=f"{legacy_body}.{legacy_signature}",
        now=now,
    )
    assert legacy_payload.purpose == "render"


def test_floorplan_endpoint_token_cache_dimensions_and_rate_limit(test_settings) -> None:
    clear_floorplan_render_cache()
    storage = FakeStorage()
    settings = _line_settings(test_settings)
    app = build_app(settings=settings, artifact_storage=storage)
    with TestClient(app) as client:
        _seed_scope(app)
        token = create_floorplan_render_token(settings, site_slug="jingcheng", group_id=BOUND_GROUP_ID)

        first = client.get(f"/v1/line/floorplan/jingcheng/{token}/1040")
        second = client.get(f"/v1/line/floorplan/jingcheng/{token}/1040")
        image = Image.open(BytesIO(first.content))

        assert first.status_code == 200, first.text
        assert first.headers["content-type"] == "image/png"
        assert first.headers["x-line-floorplan-cache"] == "miss"
        assert second.status_code == 200, second.text
        assert second.headers["x-line-floorplan-cache"] == "hit"
        assert image.size == (1040, 700)
        assert client.get(f"/v1/line/floorplan/jingcheng/{token}/999").status_code == 422
        assert client.get(f"/v1/line/floorplan/unknown/{token}/1040").status_code == 404
        assert client.get("/v1/line/floorplan/jingcheng/bad-token/1040").status_code == 403

        expired_token = create_floorplan_render_token(
            settings,
            site_slug="jingcheng",
            group_id=BOUND_GROUP_ID,
            now=datetime.now(timezone.utc) - timedelta(minutes=11),
        )
        assert client.get(f"/v1/line/floorplan/jingcheng/{expired_token}/1040").status_code == 403

        statuses = [client.get(f"/v1/line/floorplan/jingcheng/{token}/240").status_code for _ in range(121)]
        assert 429 in statuses


def test_liveview_state_endpoint_token_cache_and_no_leakage(test_settings) -> None:
    settings = _line_settings(test_settings, app_origin="https://app.example.test")
    app = build_app(settings=settings, artifact_storage=FakeStorage())
    with TestClient(app) as client:
        _seed_scope(app, with_incident=True)
        token = create_floorplan_liveview_token(settings, site_slug="jingcheng", group_id=BOUND_GROUP_ID)

        first = client.get(f"/v1/line/floorplan/jingcheng/state?token={token}")
        second = client.get(f"/v1/line/floorplan/jingcheng/state?token={token}")

        assert first.status_code == 200, first.text
        assert first.headers["x-line-floorplan-state-cache"] == "miss"
        assert second.status_code == 200, second.text
        assert second.headers["x-line-floorplan-state-cache"] == "hit"
        payload = first.json()
        assert payload["siteSlug"] == "jingcheng"
        assert payload["canvas"] == {"width": 1040, "height": 700}
        assert payload["machines"][0]["id"] == "m-hc600"
        assert payload["machines"][0]["gauges"][0]["gaugeId"] == "press_am_meter"
        assert payload["incidents"][0]["machineId"] == "m-hc600"
        dumped = json.dumps(payload, ensure_ascii=False)
        assert "reporter" not in dumped.lower()
        assert "assignee" not in dumped.lower()
        assert "storage_key" not in dumped.lower()
        assert "pressure drift" not in dumped.lower()
        assert payload["incidents"][0]["title"] == "HC600-01 未結異常"

        render_token = create_floorplan_render_token(settings, site_slug="jingcheng", group_id=BOUND_GROUP_ID)
        assert client.get(f"/v1/line/floorplan/jingcheng/state?token={render_token}").status_code == 403
        assert client.get("/v1/line/floorplan/jingcheng/state").status_code == 403
        assert client.get(f"/v1/line/floorplan/unknown/state?token={token}").status_code == 403


def test_liveview_machine_endpoint_uses_short_presigned_thumbnail(test_settings) -> None:
    settings = _line_settings(test_settings, app_origin="https://app.example.test")
    storage = FakeStorage(get_url="https://signed.example.test/live-thumb.jpg")
    app = build_app(settings=settings, artifact_storage=storage)
    with TestClient(app) as client:
        _seed_scope(app)
        token = create_floorplan_liveview_token(settings, site_slug="jingcheng", group_id=BOUND_GROUP_ID)
        response = client.get(f"/v1/line/floorplan/jingcheng/machine/m-hc600?token={token}")

    assert response.status_code == 200, response.text
    assert storage.get_url_calls == [{"key": "camera-frames/org/camera/frame.jpg", "expires_in_seconds": 600}]
    payload = response.json()
    assert payload["machineId"] == "m-hc600"
    assert payload["thumbnailUrl"] == "https://signed.example.test/live-thumb.jpg"
    assert payload["thumbnailTtlSeconds"] == 600
    assert payload["gauges"][0]["gaugeId"] == "press_am_meter"


def test_liveview_state_endpoint_rate_limits(test_settings) -> None:
    settings = _line_settings(
        test_settings,
        app_origin="https://app.example.test",
    )
    app = build_app(settings=settings, artifact_storage=FakeStorage())
    with TestClient(app) as client:
        _seed_scope(app)
        token = create_floorplan_liveview_token(settings, site_slug="jingcheng", group_id=BOUND_GROUP_ID)
        statuses = [
            client.get(
                f"/v1/line/floorplan/jingcheng/state?token={token}",
                headers={"X-Forwarded-For": "203.0.113.55, 10.0.0.2"},
            ).status_code
            for _ in range(121)
        ]

    assert 429 in statuses


def test_rich_menu_floorplan_postback_replies_imagemap(test_settings, monkeypatch) -> None:
    settings = _line_settings(test_settings, app_origin="https://app.example.test")
    replies = _capture_replies(monkeypatch)
    app = build_app(settings=settings, artifact_storage=FakeStorage())
    with TestClient(app) as client:
        _seed_scope(app)
        response = _post_line_events(client, settings, [_postback_event("floorplan")])

    assert response.status_code == 200, response.text
    message = replies[0]["messages"][0]
    liveview = replies[0]["messages"][1]
    assert message["type"] == "imagemap"
    assert message["baseUrl"].startswith("https://api.example.test/v1/line/floorplan/jingcheng/")
    assert message["baseSize"] == {"width": 1040, "height": 700}
    first_action = message["actions"][0]
    assert first_action["type"] == "message"
    assert first_action["text"] == "機台 m-hc600"
    assert first_action["area"] == {"x": 686, "y": 317, "width": 104, "height": 48}
    hc600_07_action = next(action for action in message["actions"] if action["text"].endswith("m-hc600-007"))
    assert hc600_07_action["area"] == {"x": 221, "y": 234, "width": 48, "height": 104}
    assert liveview["type"] == "flex"
    assert "https://app.example.test/m/floorplan/jingcheng?token=" in json.dumps(liveview)


def test_rich_menu_machines_gauges_and_daily_incidents(test_settings, monkeypatch) -> None:
    settings = _line_settings(test_settings)
    replies = _capture_replies(monkeypatch)
    app = build_app(settings=settings, artifact_storage=FakeStorage())
    with TestClient(app) as client:
        _seed_scope(app, with_incident=True)
        response = _post_line_events(
            client,
            settings,
            [
                _postback_event("machines", event_id="evt-machines", reply_token="reply-machines"),
                _postback_event("gauges", event_id="evt-gauges", reply_token="reply-gauges"),
                _postback_event("daily_incidents", event_id="evt-daily", reply_token="reply-daily"),
            ],
        )

    assert response.status_code == 200, response.text
    assert [reply["messages"][0]["type"] for reply in replies] == ["flex", "flex", "text"]
    assert replies[0]["messages"][0]["contents"]["type"] == "carousel"
    assert "PRESS" in json.dumps(replies[1]["messages"][0], ensure_ascii=False)


def test_text_machine_detail_uses_presigned_thumbnail(test_settings, monkeypatch) -> None:
    settings = _line_settings(test_settings, app_origin="https://app.example.test")
    storage = FakeStorage(get_url="https://signed.example.test/thumb.jpg")
    replies = _capture_replies(monkeypatch)
    app = build_app(settings=settings, artifact_storage=storage)
    with TestClient(app) as client:
        _seed_scope(app)
        response = _post_line_events(client, settings, [_message_event("機台 m-hc600")])

    assert response.status_code == 200, response.text
    assert storage.get_url_calls == [{"key": "camera-frames/org/camera/frame.jpg", "expires_in_seconds": 600}]
    message = replies[0]["messages"][0]
    assert message["type"] == "flex"
    assert message["contents"]["hero"]["url"] == "https://signed.example.test/thumb.jpg"
    dumped = json.dumps(message, ensure_ascii=False)
    assert "PRESS" in dumped
    assert "FLOW" in dumped
    assert "今日異常" in dumped
    assert "https://app.example.test/m/floorplan/jingcheng?token=" in dumped
    assert "focus=machine%3Am-hc600" in dumped


def test_text_machine_detail_degrades_without_public_thumbnail(test_settings, monkeypatch) -> None:
    settings = _line_settings(test_settings)
    replies = _capture_replies(monkeypatch)
    app = build_app(settings=settings, artifact_storage=FakeStorage(get_url=None))
    with TestClient(app) as client:
        _seed_scope(app)
        response = _post_line_events(client, settings, [_message_event("機台 m-hc600")])

    assert response.status_code == 200, response.text
    message = replies[0]["messages"][0]
    assert "hero" not in message["contents"]
    assert "暫無可公開縮圖" in json.dumps(message, ensure_ascii=False)


def test_unbound_group_direct_chat_and_bind_request_do_not_leak_site_data(test_settings, monkeypatch) -> None:
    settings = _line_settings(test_settings)
    replies = _capture_replies(monkeypatch)
    app = build_app(settings=settings, artifact_storage=FakeStorage())
    with TestClient(app) as client:
        response = _post_line_events(
            client,
            settings,
            [
                _message_event("廠區圖", event_id="evt-unbound", reply_token="reply-unbound", group_id="Cunknown"),
                _message_event("廠區圖", event_id="evt-direct", reply_token="reply-direct", source_type="user"),
                _message_event("綁定 靚程", event_id="evt-bind", reply_token="reply-bind", group_id="Cnew"),
            ],
        )

    assert response.status_code == 200, response.text
    texts = [reply["messages"][0]["text"] for reply in replies]
    assert texts[0] == "此群組尚未綁定場域"
    assert texts[1] == "請在已綁定的 LINE 值班群組使用廠區圖功能。"
    assert "已收到綁定請求" in texts[2]
    assert all(reply["messages"][0]["type"] == "text" for reply in replies)


def test_report_machine_incident_creates_pending_review_without_push(test_settings, monkeypatch) -> None:
    settings = _line_settings(test_settings, line_incident_notify_enabled=True, line_default_group_id="Cpush")
    replies = _capture_replies(monkeypatch)

    def fail_push(*_args, **_kwargs):
        raise AssertionError("reply flow must not call push_line_message")

    monkeypatch.setattr("app.incidents.push_line_message", fail_push)
    app = build_app(settings=settings, artifact_storage=FakeStorage())
    with TestClient(app) as client:
        _seed_scope(app)
        response = _post_line_events(client, settings, [_postback_event("report_machine_incident", machine_id="m-hc600")])

        assert response.status_code == 200, response.text
        with app.state.session_factory() as session:
            incidents = session.exec(select(IncidentRecord).where(IncidentRecord.source == "line")).all()
            line_notifications = session.exec(select(IncidentLineNotificationRecord)).all()

    assert len(incidents) == 1
    assert incidents[0].status == "pending_review"
    assert incidents[0].severity == "medium"
    assert incidents[0].location_json["equipmentId"] == "m-hc600"
    assert line_notifications == []
    assert "已建立待確認異常" in replies[0]["messages"][0]["text"]


def test_incident_push_message_adds_liveview_link_without_extra_push(test_settings, monkeypatch) -> None:
    settings = _line_settings(
        test_settings,
        app_origin="https://app.example.test",
        line_incident_notify_enabled=True,
        line_default_group_id=BOUND_GROUP_ID,
    )
    pushed_messages: list[dict] = []

    def fake_push(_settings, target_id, message):
        pushed_messages.append({"target": target_id, "message": message})
        return {"status": "ok"}

    monkeypatch.setattr("app.incidents.push_line_message", fake_push)
    app = build_app(settings=settings, artifact_storage=FakeStorage())
    with TestClient(app):
        _seed_scope(app, with_incident=True)
        with app.state.session_factory() as session:
            incident = session.exec(select(IncidentRecord)).first()
            assert incident is not None
            notification = record_incident_line_notification(session, settings, incident, "incident_created")
            notification_message = notification.message
            session.commit()

    assert len(pushed_messages) == 1
    message_text = pushed_messages[0]["message"]["text"]
    assert pushed_messages[0]["target"] == BOUND_GROUP_ID
    assert "https://app.example.test/m/floorplan/jingcheng?token=" in message_text
    assert "focus=incident%3A" in message_text
    assert notification_message == message_text


def _line_settings(test_settings, **overrides):
    values = {
        "line_channel_access_token": "test-token",
        "line_channel_secret": "test-secret",
        "line_webhook_enabled": True,
        "line_incident_notify_enabled": False,
        "line_default_group_id": None,
        "line_public_base_url": "https://api.example.test",
        "app_origin": None,
    }
    values.update(overrides)
    return replace(test_settings, **values)


def _floorplan_token_body(payload: dict) -> str:
    return base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    ).decode("ascii").rstrip("=")


def _floorplan_token_signature(secret: str, body: str) -> str:
    return base64.urlsafe_b64encode(
        hmac.new(secret.encode("utf-8"), body.encode("ascii"), hashlib.sha256).digest()
    ).decode("ascii").rstrip("=")


def _seed_scope(app, *, with_incident: bool = False) -> None:
    now = datetime.now(timezone.utc)
    with app.state.session_factory() as session:
        org = seed_organization(session, name="Jingcheng Org")
        site = Site(
            id=JINGCHENG_SITE_ID,
            organization_id=org.id,
            name="靚程工廠",
            address="Jingcheng",
            lat=25.0,
            lng=121.0,
        )
        session.add(site)
        camera = CameraDevice(
            id="camera-gauge",
            organization_id=org.id,
            site_id=site.id,
            name="靚程 192.168.1.10 儀表板",
            status="active",
            device_token_hash=f"hash-{uuid4().hex}",
            last_heartbeat_at=now,
            last_frame_at=now,
        )
        session.add(camera)
        session.add(
            CameraFrame(
                id="frame-latest",
                camera_id=camera.id,
                organization_id=org.id,
                site_id=site.id,
                captured_at=now - timedelta(minutes=2),
                storage_key="camera-frames/org/camera/frame.jpg",
                content_type="image/jpeg",
                upload_status="uploaded",
                analysis_status="complete",
                upload_expires_at=now + timedelta(minutes=10),
                completed_at=now - timedelta(minutes=1),
            )
        )
        for gauge_id, label, latest_value, old_value, unit in [
            ("press_am_meter", "PRESS", 121.5, 110.0, "bar"),
            ("flow_am_meter", "FLOW", 42.0, 43.0, "L/min"),
        ]:
            session.add(
                CameraGaugeReading(
                    camera_id=camera.id,
                    organization_id=org.id,
                    site_id=site.id,
                    gauge_id=gauge_id,
                    label=label,
                    value=old_value,
                    unit=unit,
                    confidence=0.88,
                    status="ok",
                    captured_at=now - timedelta(minutes=70),
                )
            )
            session.add(
                CameraGaugeReading(
                    camera_id=camera.id,
                    organization_id=org.id,
                    site_id=site.id,
                    frame_id="frame-latest",
                    gauge_id=gauge_id,
                    label=label,
                    value=latest_value,
                    unit=unit,
                    confidence=0.94,
                    status="ok",
                    captured_at=now - timedelta(minutes=3),
                )
            )
        session.add(
            LineGroupBinding(
                group_id=BOUND_GROUP_ID,
                source_type="group",
                organization_id=org.id,
                site_id=site.id,
                site_slug="jingcheng",
                is_active=True,
            )
        )
        if with_incident:
            session.add(
                IncidentRecord(
                    organization_id=org.id,
                    site_id=site.id,
                    title="HC600-01 pressure drift",
                    status="pending_review",
                    severity="medium",
                    source="camera",
                    location_json={"equipmentId": "m-hc600", "equipmentName": "HC600-01"},
                    created_at=now,
                    updated_at=now,
                )
            )
        session.commit()


def _capture_replies(monkeypatch) -> list[dict]:
    replies: list[dict] = []

    def fake_reply_line_messages(_settings, reply_token, messages):
        replies.append({"replyToken": reply_token, "messages": messages})
        return {"status": "ok"}

    monkeypatch.setattr("app.routers.line.reply_line_messages", fake_reply_line_messages)
    return replies


def _post_line_events(client: TestClient, settings, events: list[dict]):
    payload = {"destination": "U00000000000000000000000000000000", "events": events}
    raw_body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    signature = base64.b64encode(
        hmac.new(settings.line_channel_secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    ).decode("utf-8")
    return client.post(
        "/v1/line/webhook",
        content=raw_body,
        headers={"x-line-signature": signature, "content-type": "application/json"},
    )


def _postback_event(
    action: str,
    *,
    machine_id: str | None = None,
    event_id: str | None = None,
    reply_token: str | None = None,
    group_id: str = BOUND_GROUP_ID,
) -> dict:
    data = f"action={action}"
    if machine_id:
        data += f"&machineId={machine_id}"
    event_id = event_id or f"evt-{action}"
    return {
        "type": "postback",
        "webhookEventId": event_id,
        "replyToken": reply_token or f"reply-{action}",
        "source": {"type": "group", "groupId": group_id, "userId": "Ulineuser"},
        "timestamp": 1770000000000,
        "postback": {"data": data},
    }


def _message_event(
    text: str,
    *,
    event_id: str = "evt-message",
    reply_token: str = "reply-message",
    group_id: str = BOUND_GROUP_ID,
    source_type: str = "group",
) -> dict:
    source = {"type": source_type, "userId": "Ulineuser"}
    if source_type == "group":
        source["groupId"] = group_id
    return {
        "type": "message",
        "webhookEventId": event_id,
        "replyToken": reply_token,
        "source": source,
        "timestamp": 1770000000000,
        "message": {"type": "text", "id": event_id.replace("evt", "msg"), "text": text},
    }
