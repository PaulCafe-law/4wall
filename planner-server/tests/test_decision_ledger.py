from dataclasses import replace
from datetime import datetime, timedelta, timezone
from io import BytesIO

from PIL import Image
from sqlmodel import select

from app.dispatch import (
    build_daily_brief,
    bump_mold_counter,
    create_dispatch_point,
    record_machine_actual,
    reconcile_work_orders,
    reset_mold_counter,
    suggest_assignees,
    zone_occupancy_summary,
)
from app.models import (
    CameraDevice,
    CameraFrame,
    CameraOcrObservation,
    CameraPersonObservation,
    DecisionPointRecord,
    LineGroupBinding,
    MoldMaintenanceRuleRecord,
    SemanticZoneRecord,
    ShiftRosterEntryRecord,
    SkillMatrixEntryRecord,
)
from tests.helpers import login_web, seed_organization, seed_site, seed_user

PASSWORD = "Password123!"
DAY = datetime(2026, 7, 7, 10, 0, tzinfo=timezone.utc)
SITE_TZ = timezone(timedelta(hours=8))
TODAY_LOCAL = datetime.now(timezone.utc).astimezone(SITE_TZ).date().isoformat()


def _seed_org_with_user(session, email="boss@ledger.test"):
    org = seed_organization(session, name="Ledger Org")
    seed_user(
        session,
        email=email,
        password=PASSWORD,
        display_name="Ledger Admin",
        org_roles=[(org.id, "customer_admin")],
    )
    return org


def _seed_roster_and_skills(session, org_id: str) -> None:
    for work_date in {"2026-07-07", TODAY_LOCAL}:
        _seed_roster_for_date(session, org_id, work_date)
    _seed_skills_and_zone(session, org_id)


def _seed_roster_for_date(session, org_id: str, work_date: str) -> None:
    session.add(
        ShiftRosterEntryRecord(
            organization_id=org_id,
            work_date=work_date,
            shift="day",
            person_name="阿華",
            zone_name="成型區",
            machine_nos_json=["HC600-01"],
        )
    )
    session.add(
        ShiftRosterEntryRecord(
            organization_id=org_id,
            work_date=work_date,
            shift="day",
            person_name="美玲",
            zone_name="包裝區",
            machine_nos_json=[],
        )
    )
    session.add(
        ShiftRosterEntryRecord(
            organization_id=org_id,
            work_date=work_date,
            shift="night",
            person_name="志強",
            zone_name="成型區",
            machine_nos_json=["HC600-01"],
        )
    )


def _seed_skills_and_zone(session, org_id: str) -> None:
    session.add(
        SkillMatrixEntryRecord(
            organization_id=org_id, person_name="阿華", machine_no="HC600-01", level=3
        )
    )
    session.add(
        SkillMatrixEntryRecord(
            organization_id=org_id, person_name="美玲", machine_no="HC600-01", level=1
        )
    )
    session.add(
        SemanticZoneRecord(
            organization_id=org_id,
            name="成型區",
            x_min=0.0,
            x_max=10.0,
            z_min=0.0,
            z_max=10.0,
            machine_nos_json=["HC600-01"],
        )
    )


def test_suggest_assignees_ranks_skill_and_zone(client, session_factory) -> None:
    with session_factory() as session:
        org = _seed_org_with_user(session)
        org_id = org.id
        _seed_roster_and_skills(session, org_id)
        session.commit()

    with session_factory() as session:
        candidates = suggest_assignees(
            session, organization_id=org_id, machine_no="HC600-01", occurred_at=DAY
        )
        assert [c["name"] for c in candidates] == ["阿華", "美玲"]
        assert candidates[0]["score"] > candidates[1]["score"]
        # Night worker excluded from a 10:00 event.
        assert all(c["name"] != "志強" for c in candidates)


def test_dispatch_point_shadow_consistency(client, session_factory) -> None:
    with session_factory() as session:
        org = _seed_org_with_user(session)
        org_id = org.id
        _seed_roster_and_skills(session, org_id)
        session.commit()

    with session_factory() as session:
        point = create_dispatch_point(
            session,
            organization_id=org_id,
            site_id=None,
            machine_no="HC600-01",
            occurred_at=DAY,
            source="manual",
            actual_assignee="阿華",
        )
        session.commit()
        assert point.consistent is True
        mismatch = create_dispatch_point(
            session,
            organization_id=org_id,
            site_id=None,
            machine_no="HC600-01",
            occurred_at=DAY,
            source="manual",
            actual_assignee="路人甲",
        )
        session.commit()
        assert mismatch.consistent is False


def _seed_camera_with_work_order(session, org_id: str, site_id: str | None, captured_at: datetime):
    camera = CameraDevice(
        organization_id=org_id,
        site_id=site_id,
        name="poe-cam-1",
        device_token_hash=f"hash-{org_id}",
    )
    session.add(camera)
    session.flush()
    work_order = {
        "template": "hc600_dispatch_sheet_v1",
        "stabilized": True,
        "fields": {
            "machineNo": {"value": "HC600", "confidence": 0.9},
            "moldNo": {"value": "GM096LC", "confidence": 0.9},
        },
        "quantities": {
            "plannedWithHanger": {"left": {"value": 200}, "right": {"value": None}},
            "total": {"left": {"value": 1000}, "right": {"value": None}},
        },
    }
    observation = CameraOcrObservation(
        camera_id=camera.id,
        organization_id=org_id,
        site_id=site_id,
        mode="machine_monitor",
        mode_confidence=0.8,
        captured_at=captured_at,
        structured_fields_json={"workOrder": work_order},
    )
    session.add(observation)
    return camera


def test_reconcile_work_orders_and_line_report(client, session_factory) -> None:
    with session_factory() as session:
        org = _seed_org_with_user(session)
        org_id = org.id
        _seed_camera_with_work_order(session, org_id, None, DAY)
        session.commit()

    with session_factory() as session:
        created = reconcile_work_orders(session, organization_id=org_id, target_date=DAY)
        session.commit()
        assert len(created) == 1
        assert created[0].subject_ref == "HC600"
        assert created[0].plan_json["plannedTotal"] == 1000

        # Idempotent rerun updates instead of duplicating.
        again = reconcile_work_orders(session, organization_id=org_id, target_date=DAY)
        session.commit()
        assert len(again) == 0

        # Within 5% tolerance counts as consistent.
        point = record_machine_actual(
            session,
            organization_id=org_id,
            machine_no="HC600",
            actual_total=980,
            reported_by="line-user",
            reported_at=DAY + timedelta(hours=2),
        )
        session.commit()
        assert point is not None
        assert point.consistent is True

        brief = build_daily_brief(session, organization_id=org_id, target_date=DAY)
        assert "HC600" in brief
        assert "980" in brief


def test_ledger_api_flow_attribution(client, session_factory) -> None:
    with session_factory() as session:
        org = _seed_org_with_user(session)
        org_id = org.id
        _seed_roster_and_skills(session, org_id)
        session.commit()

    headers, _ = login_web(client, email="boss@ledger.test", password=PASSWORD)
    created = client.post(
        "/v1/decision-points/dispatch",
        headers=headers,
        json={
            "organizationId": org_id,
            "machineNo": "HC600-01",
            "occurredAt": DAY.isoformat(),
            "source": "manual",
            "actualAssignee": "路人甲",
        },
    )
    assert created.status_code == 200, created.text
    body = created.json()
    assert body["consistent"] is False
    point_id = body["decisionPointId"]

    listed = client.get(
        "/v1/decision-points",
        headers=headers,
        params={"organizationId": org_id, "mismatchOnly": True, "unattributedOnly": True},
    )
    assert listed.status_code == 200
    assert any(p["decisionPointId"] == point_id for p in listed.json()["decisionPoints"])

    bad = client.post(
        f"/v1/decision-points/{point_id}/attribution",
        headers=headers,
        json={"attribution": "not_a_reason"},
    )
    assert bad.status_code == 422

    attributed = client.post(
        f"/v1/decision-points/{point_id}/attribution",
        headers=headers,
        json={"attribution": "implicit_rule", "note": "老師傅專機,技能表沒記"},
    )
    assert attributed.status_code == 200
    assert attributed.json()["attribution"] == "implicit_rule"

    stats = client.get(
        "/v1/decision-points/stats", headers=headers, params={"organizationId": org_id}
    )
    assert stats.status_code == 200
    stats_body = stats.json()
    assert stats_body["totalPoints"] == 1
    assert stats_body["mismatchedUnattributed"] == 0


def test_dispatch_config_roundtrip(client, session_factory) -> None:
    with session_factory() as session:
        org = _seed_org_with_user(session, email="config@ledger.test")
        org_id = org.id
        session.commit()

    headers, _ = login_web(client, email="config@ledger.test", password=PASSWORD)
    put_roster = client.put(
        "/v1/dispatch-config/roster",
        headers=headers,
        json={
            "organizationId": org_id,
            "workDate": "2026-07-07",
            "entries": [
                {"personName": "阿華", "shift": "day", "zoneName": "成型區", "machineNos": ["HC600-01"]}
            ],
        },
    )
    assert put_roster.status_code == 200, put_roster.text
    got = client.get(
        "/v1/dispatch-config/roster",
        headers=headers,
        params={"organizationId": org_id, "date": "2026-07-07"},
    )
    assert got.json()["entries"][0]["personName"] == "阿華"

    put_skills = client.put(
        "/v1/dispatch-config/skill-matrix",
        headers=headers,
        json={
            "organizationId": org_id,
            "entries": [{"personName": "阿華", "machineNo": "HC600-01", "level": 3}],
        },
    )
    assert put_skills.status_code == 200
    skills = client.get(
        "/v1/dispatch-config/skill-matrix", headers=headers, params={"organizationId": org_id}
    )
    assert skills.json()["entries"][0]["level"] == 3

    put_zones = client.put(
        "/v1/dispatch-config/zones",
        headers=headers,
        json={
            "organizationId": org_id,
            "zones": [
                {"name": "成型區", "xMin": 0, "xMax": 10, "zMin": 0, "zMax": 10, "machineNos": ["HC600-01"]}
            ],
        },
    )
    assert put_zones.status_code == 200


def test_mold_sentinel_threshold_and_reset(client, session_factory, test_settings) -> None:
    with session_factory() as session:
        org = _seed_org_with_user(session, email="mold@ledger.test")
        org_id = org.id
        session.add(
            MoldMaintenanceRuleRecord(
                organization_id=org_id, mold_no="GM096LC", threshold_count=50000
            )
        )
        session.commit()

    with session_factory() as session:
        rule, alerted = bump_mold_counter(
            session, test_settings, organization_id=org_id, mold_no="GM096LC", set_count=49000
        )
        session.commit()
        assert alerted is False
        rule, alerted = bump_mold_counter(
            session, test_settings, organization_id=org_id, mold_no="GM096LC", increment=1500
        )
        session.commit()
        assert alerted is True
        assert rule.current_count == 50500
        # No double alert before reset.
        rule, alerted = bump_mold_counter(
            session, test_settings, organization_id=org_id, mold_no="GM096LC", increment=10
        )
        session.commit()
        assert alerted is False

        rule = reset_mold_counter(
            session, organization_id=org_id, mold_no="GM096LC", actor_name="領班"
        )
        session.commit()
        assert rule.current_count == 0
        # After reset the sentinel arms again.
        rule, alerted = bump_mold_counter(
            session, test_settings, organization_id=org_id, mold_no="GM096LC", set_count=60000
        )
        session.commit()
        assert alerted is True


def test_zone_occupancy_summary(client, session_factory) -> None:
    with session_factory() as session:
        org = _seed_org_with_user(session, email="zone@ledger.test")
        org_id = org.id
        session.add(
            SemanticZoneRecord(
                organization_id=org_id,
                name="成型區",
                x_min=0.0,
                x_max=10.0,
                z_min=0.0,
                z_max=10.0,
                machine_nos_json=["HC600-01"],
            )
        )
        camera = CameraDevice(
            organization_id=org_id, name="poe-cam-z", device_token_hash=f"hash-z-{org_id}"
        )
        session.add(camera)
        session.flush()
        session.add(
            CameraPersonObservation(
                camera_id=camera.id,
                organization_id=org_id,
                captured_at=DAY,
                image_width=2880,
                image_height=1620,
                person_count=2,
                detections_json=[
                    {"floorPosition": {"x": 5.0, "z": 5.0}},
                    {"floorPosition": {"x": 50.0, "z": 50.0}},
                ],
            )
        )
        session.add(
            CameraPersonObservation(
                camera_id=camera.id,
                organization_id=org_id,
                captured_at=DAY + timedelta(minutes=5),
                image_width=2880,
                image_height=1620,
                person_count=0,
                detections_json=[],
            )
        )
        session.commit()

    with session_factory() as session:
        summary = zone_occupancy_summary(
            session,
            organization_id=org_id,
            start=DAY - timedelta(hours=1),
            end=DAY + timedelta(hours=1),
        )
        zone = summary["zones"]["成型區"]
        assert zone["samples"] == 2
        assert zone["occupiedSamples"] == 1
        assert zone["peakPersons"] == 1
        assert summary["unmappedDetections"] == 1


def test_line_dispatch_commands(client, session_factory, test_settings) -> None:
    from app.routers.line import _handle_dispatch_command

    with session_factory() as session:
        org = _seed_org_with_user(session, email="line@ledger.test")
        org_id = org.id
        user = seed_user(
            session,
            email="site-owner@ledger.test",
            password=PASSWORD,
            org_roles=[(org_id, "customer_admin")],
        )
        site = seed_site(session, organization_id=org_id, name="Jingcheng", created_by_user_id=user.id)
        _seed_roster_and_skills(session, org_id)
        _seed_camera_with_work_order(session, org_id, site.id, datetime.now(timezone.utc))
        session.add(
            LineGroupBinding(
                group_id="G-test",
                organization_id=org_id,
                site_id=site.id,
                site_slug="jingcheng",
            )
        )
        session.add(
            MoldMaintenanceRuleRecord(
                organization_id=org_id, mold_no="GM096LC", threshold_count=100
            )
        )
        session.commit()

    with session_factory() as session:
        binding = session.exec(
            __import__("sqlmodel").select(LineGroupBinding).where(LineGroupBinding.group_id == "G-test")
        ).first()
        reconcile_work_orders(session, organization_id=org_id, target_date=datetime.now(timezone.utc))
        session.commit()

        event = {"source": {"type": "group", "groupId": "G-test", "userId": "U-1"}}
        consumed = _handle_dispatch_command(session, test_settings, event, binding, "回報 HC600 數量 1000")
        assert consumed is True
        consumed = _handle_dispatch_command(session, test_settings, event, binding, "派工 HC600-01 阿華")
        assert consumed is True
        consumed = _handle_dispatch_command(session, test_settings, event, binding, "保養完成 GM096LC")
        assert consumed is True
        consumed = _handle_dispatch_command(session, test_settings, event, binding, "今天狀況如何?")
        assert consumed is False

    with session_factory() as session:
        points = session.exec(__import__("sqlmodel").select(DecisionPointRecord)).all()
        types = sorted(p.event_type for p in points)
        assert "dispatch" in types
        assert "maintenance" in types
        plan_point = next(p for p in points if p.event_type == "plan_vs_actual")
        assert plan_point.actual_json["actualTotal"] == 1000
        assert plan_point.consistent is True


def test_incident_assign_creates_shadow_point(client, session_factory) -> None:
    with session_factory() as session:
        org = _seed_org_with_user(session, email="incident@ledger.test")
        org_id = org.id
        _seed_roster_and_skills(session, org_id)
        session.commit()

    headers, _ = login_web(client, email="incident@ledger.test", password=PASSWORD)
    created = client.post(
        "/v1/incidents",
        headers=headers,
        json={
            "organizationId": org_id,
            "title": "HC600-01 模溫異常",
            "severity": "high",
            "source": "ai_detection",
            "location": {"siteName": "靚程", "areaName": "成型區", "equipmentName": "HC600-01"},
        },
    )
    assert created.status_code == 200, created.text
    incident_id = created.json()["incidentId"]

    assigned = client.patch(
        f"/v1/incidents/{incident_id}/assignee",
        headers=headers,
        json={"assigneeName": "阿華"},
    )
    assert assigned.status_code == 200, assigned.text

    with session_factory() as session:
        points = session.exec(
            __import__("sqlmodel").select(DecisionPointRecord).where(
                DecisionPointRecord.source == "incident"
            )
        ).all()
        assert len(points) == 1
        assert points[0].subject_ref == "HC600-01"
        assert points[0].actual_json["assignee"] == "阿華"
        assert points[0].consistent is True


class _DispatchTicketStorage:
    """Minimal ArtifactStorage stand-in: frames in, cropped tickets out."""

    def __init__(self, blobs: dict[str, bytes] | None = None) -> None:
        self.blobs = dict(blobs or {})
        self.writes: list[dict] = []

    def write(self, *, key: str, data: bytes, content_type: str, cache_control: str):
        self.blobs[key] = data
        self.writes.append({"key": key, "content_type": content_type, "cache_control": cache_control})
        return None

    def read(self, key: str) -> bytes | None:
        return self.blobs.get(key)

    def delete(self, key: str) -> None:
        self.blobs.pop(key, None)

    def create_presigned_put_url(self, *, key, content_type, cache_control, expires_in_seconds):
        return None

    def create_presigned_get_url(self, *, key, expires_in_seconds):
        return None


def _ticket_frame_jpeg(width: int = 1280, height: int = 720) -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (width, height), color=(220, 220, 220)).save(buffer, format="JPEG")
    return buffer.getvalue()


def _seed_ticket_frame(
    session,
    *,
    camera_id: str,
    org_id: str,
    site_id: str | None,
    captured_at: datetime,
    frame_id: str = "frame-ticket-1",
    storage_key: str = "camera-frames/test/ticket.jpg",
) -> None:
    session.add(
        CameraFrame(
            id=frame_id,
            camera_id=camera_id,
            organization_id=org_id,
            site_id=site_id,
            captured_at=captured_at,
            storage_key=storage_key,
            content_type="image/jpeg",
            upload_status="uploaded",
            analysis_status="complete",
            upload_expires_at=captured_at + timedelta(minutes=10),
        )
    )


def _capture_line_replies(monkeypatch) -> list[dict]:
    replies: list[dict] = []

    def fake_reply_line_messages(_settings, reply_token, messages):
        replies.append({"replyToken": reply_token, "messages": messages})
        return {"status": "ok"}

    monkeypatch.setattr("app.routers.line.reply_line_messages", fake_reply_line_messages)
    return replies


def test_line_dispatch_ticket_replies_cropped_image_and_summary(
    client, session_factory, test_settings, monkeypatch
) -> None:
    from app.routers.line import _handle_dispatch_command

    settings = replace(test_settings, line_public_base_url="https://api.example.test")
    replies = _capture_line_replies(monkeypatch)
    now = datetime.now(timezone.utc)

    with session_factory() as session:
        org = _seed_org_with_user(session, email="ticket@ledger.test")
        org_id = org.id
        user = seed_user(
            session,
            email="ticket-owner@ledger.test",
            password=PASSWORD,
            org_roles=[(org_id, "customer_admin")],
        )
        site = seed_site(session, organization_id=org_id, name="Jingcheng", created_by_user_id=user.id)
        camera = _seed_camera_with_work_order(session, org_id, site.id, now - timedelta(minutes=5))
        _seed_ticket_frame(
            session, camera_id=camera.id, org_id=org_id, site_id=site.id, captured_at=now - timedelta(minutes=3)
        )
        session.add(
            LineGroupBinding(
                group_id="G-ticket", organization_id=org_id, site_id=site.id, site_slug="jingcheng"
            )
        )
        session.commit()

    storage = _DispatchTicketStorage({"camera-frames/test/ticket.jpg": _ticket_frame_jpeg()})
    event = {"replyToken": "reply-ticket", "source": {"type": "group", "groupId": "G-ticket", "userId": "U-1"}}
    with session_factory() as session:
        binding = session.exec(
            select(LineGroupBinding).where(LineGroupBinding.group_id == "G-ticket")
        ).first()
        consumed = _handle_dispatch_command(session, settings, event, binding, "派工單", storage=storage)

    assert consumed is True
    messages = replies[0]["messages"]
    assert messages[0]["type"] == "image"
    assert messages[0]["originalContentUrl"].startswith(
        "https://api.example.test/v1/line/dispatch-ticket/jingcheng/"
    )
    assert messages[0]["originalContentUrl"].endswith("/frame-ticket-1")
    assert messages[0]["previewImageUrl"] == messages[0]["originalContentUrl"]
    summary = messages[1]["text"]
    assert "HC600" in summary
    assert "1000" in summary
    assert "⚠️ 數字為自動辨識,以圖為準" in summary

    written = storage.blobs["line-dispatch-tickets/frame-ticket-1.png"]
    cropped = Image.open(BytesIO(written))
    # 1280x720 is half the 2560x1440 reference, so ROI [900,120,550,335] halves too.
    assert cropped.size == (275, 168)


def test_line_dispatch_ticket_without_fresh_frame_replies_honest_text(
    client, session_factory, test_settings, monkeypatch
) -> None:
    from app.routers.line import _handle_dispatch_command

    settings = replace(test_settings, line_public_base_url="https://api.example.test")
    replies = _capture_line_replies(monkeypatch)
    now = datetime.now(timezone.utc)

    with session_factory() as session:
        org = _seed_org_with_user(session, email="stale-ticket@ledger.test")
        org_id = org.id
        user = seed_user(
            session,
            email="stale-ticket-owner@ledger.test",
            password=PASSWORD,
            org_roles=[(org_id, "customer_admin")],
        )
        site = seed_site(session, organization_id=org_id, name="Jingcheng", created_by_user_id=user.id)
        site_id = site.id
        camera = _seed_camera_with_work_order(session, org_id, site.id, now - timedelta(minutes=5))
        camera_id = camera.id
        session.add(
            LineGroupBinding(
                group_id="G-stale", organization_id=org_id, site_id=site.id, site_slug="jingcheng"
            )
        )
        session.commit()

    storage = _DispatchTicketStorage({"camera-frames/test/stale.jpg": _ticket_frame_jpeg()})
    event = {"replyToken": "reply-stale", "source": {"type": "group", "groupId": "G-stale", "userId": "U-1"}}
    with session_factory() as session:
        binding = session.exec(
            select(LineGroupBinding).where(LineGroupBinding.group_id == "G-stale")
        ).first()

        # No uploaded frame at all -> honest fallback.
        consumed = _handle_dispatch_command(session, settings, event, binding, "派工單", storage=storage)
        assert consumed is True
        assert replies[-1]["messages"] == [{"type": "text", "text": "目前沒有新的派工單畫面"}]

        # A frame older than 2 hours must not be sent either.
        _seed_ticket_frame(
            session,
            camera_id=camera_id,
            org_id=org_id,
            site_id=site_id,
            captured_at=now - timedelta(hours=3),
            frame_id="frame-stale",
            storage_key="camera-frames/test/stale.jpg",
        )
        session.commit()
        consumed = _handle_dispatch_command(session, settings, event, binding, "派工單", storage=storage)
        assert consumed is True
        assert replies[-1]["messages"] == [{"type": "text", "text": "目前沒有新的派工單畫面"}]

    assert storage.writes == []
