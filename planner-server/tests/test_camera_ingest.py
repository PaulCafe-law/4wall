from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib

from app.models import CameraDevice, CameraFrame, CameraGaugeReading, CameraOcrObservation, CameraPersonObservation
from app.routers.camera_ingest import MAX_FRAME_SIZE_BYTES
from app.security import hash_camera_device_token, verify_camera_device_token
from sqlmodel import select
from tests.helpers import login_web, seed_organization, seed_site, seed_user


PASSWORD = "Password123!"


def test_camera_device_uploads_frame_through_local_intent(client, session_factory) -> None:
    token = "fwcam_test_device_token"
    with session_factory() as session:
        org = seed_organization(session, name="Camera Org")
        site = seed_site(session, organization_id=org.id, name="Factory A")
        camera = _seed_camera(session, org.id, site.id, token=token)
        camera_id = camera.id
        session.commit()

    frame_bytes = b"not-real-jpeg-but-good-enough-for-storage"
    checksum = hashlib.sha256(frame_bytes).hexdigest()
    headers = {"Authorization": f"Bearer {token}"}
    intent = client.post(
        "/v1/camera-ingest/upload-intents",
        headers=headers,
        json={
            "frameId": "frame-001",
            "capturedAt": "2026-06-19T02:00:00Z",
            "contentType": "image/jpeg",
            "checksumSha256": checksum,
            "sizeBytes": len(frame_bytes),
            "width": 1280,
            "height": 720,
        },
    )
    assert intent.status_code == 200, intent.text
    intent_body = intent.json()
    assert intent_body["cameraId"] == camera_id
    assert intent_body["uploadRequiresAuth"] is True
    assert intent_body["uploadUrl"] == "/v1/camera-ingest/frames/frame-001/upload"

    upload = client.put(intent_body["uploadUrl"], headers=headers, content=frame_bytes)
    assert upload.status_code == 204, upload.text

    complete = client.post(
        "/v1/camera-ingest/frames/frame-001/complete",
        headers=headers,
        json={"checksumSha256": checksum, "sizeBytes": len(frame_bytes), "width": 1280, "height": 720},
    )
    assert complete.status_code == 200, complete.text
    complete_body = complete.json()
    assert complete_body["uploadStatus"] == "uploaded"
    assert complete_body["analysisStatus"] == "queued"
    assert complete_body["checksumSha256"] == checksum
    assert complete_body["sizeBytes"] == len(frame_bytes)

    status = client.get("/v1/camera-ingest/frames/frame-001", headers=headers)
    assert status.status_code == 200, status.text
    assert status.json()["frameId"] == "frame-001"
    assert status.json()["analysisStatus"] == "queued"
    assert status.json()["errorMessage"] is None


def test_camera_token_cannot_complete_another_camera_frame(client, session_factory) -> None:
    token_a = "fwcam_camera_a"
    token_b = "fwcam_camera_b"
    with session_factory() as session:
        org = seed_organization(session, name="Scope Org")
        camera_a = _seed_camera(session, org.id, None, token=token_a)
        camera_a_id = camera_a.id
        _seed_camera(session, org.id, None, token=token_b)
        session.commit()

    frame_bytes = b"frame-a"
    checksum = hashlib.sha256(frame_bytes).hexdigest()
    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}
    intent = client.post(
        "/v1/camera-ingest/upload-intents",
        headers=headers_a,
        json={
            "frameId": "scoped-frame",
            "capturedAt": "2026-06-19T02:00:00Z",
            "checksumSha256": checksum,
            "sizeBytes": len(frame_bytes),
        },
    )
    assert intent.status_code == 200, intent.text
    assert intent.json()["cameraId"] == camera_a_id
    assert client.put(intent.json()["uploadUrl"], headers=headers_a, content=frame_bytes).status_code == 204

    blocked = client.post(
        "/v1/camera-ingest/frames/scoped-frame/complete",
        headers=headers_b,
        json={"checksumSha256": checksum},
    )
    assert blocked.status_code == 403
    assert blocked.json()["detail"] == "camera_frame_scope_mismatch"

    blocked_status = client.get("/v1/camera-ingest/frames/scoped-frame", headers=headers_b)
    assert blocked_status.status_code == 403
    assert blocked_status.json()["detail"] == "camera_frame_scope_mismatch"


def test_expired_upload_intent_rejects_upload(client, session_factory) -> None:
    token = "fwcam_expired"
    with session_factory() as session:
        org = seed_organization(session, name="Expired Org")
        _seed_camera(session, org.id, None, token=token)
        session.commit()

    headers = {"Authorization": f"Bearer {token}"}
    frame_bytes = b"late-frame"
    intent = client.post(
        "/v1/camera-ingest/upload-intents",
        headers=headers,
        json={
            "frameId": "expired-frame",
            "capturedAt": "2026-06-19T02:00:00Z",
            "checksumSha256": hashlib.sha256(frame_bytes).hexdigest(),
            "sizeBytes": len(frame_bytes),
        },
    )
    assert intent.status_code == 200, intent.text
    with session_factory() as session:
        frame = session.get(CameraFrame, "expired-frame")
        frame.upload_expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        session.add(frame)
        session.commit()

    upload = client.put(intent.json()["uploadUrl"], headers=headers, content=b"late-frame")
    assert upload.status_code == 422
    assert upload.json()["detail"] == "upload_intent_expired"


def test_oversized_frame_intent_is_rejected(client, session_factory) -> None:
    token = "fwcam_too_large"
    with session_factory() as session:
        org = seed_organization(session, name="Too Large Org")
        _seed_camera(session, org.id, None, token=token)
        session.commit()

    response = client.post(
        "/v1/camera-ingest/upload-intents",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "frameId": "too-large-frame",
            "capturedAt": "2026-06-19T02:00:00Z",
            "checksumSha256": hashlib.sha256(b"placeholder").hexdigest(),
            "sizeBytes": MAX_FRAME_SIZE_BYTES + 1,
        },
    )

    assert response.status_code == 422


def test_checksum_mismatch_fails_completion(client, session_factory) -> None:
    token = "fwcam_checksum"
    with session_factory() as session:
        org = seed_organization(session, name="Checksum Org")
        _seed_camera(session, org.id, None, token=token)
        session.commit()

    headers = {"Authorization": f"Bearer {token}"}
    uploaded = b"actual"
    expected_checksum = hashlib.sha256(b"expected").hexdigest()
    intent = client.post(
        "/v1/camera-ingest/upload-intents",
        headers=headers,
        json={
            "frameId": "bad-checksum",
            "capturedAt": "2026-06-19T02:00:00Z",
            "checksumSha256": expected_checksum,
            "sizeBytes": len(uploaded),
        },
    )
    assert intent.status_code == 200, intent.text
    assert client.put(intent.json()["uploadUrl"], headers=headers, content=uploaded).status_code == 204
    mismatch = client.post(
        "/v1/camera-ingest/frames/bad-checksum/complete",
        headers=headers,
        json={"checksumSha256": expected_checksum},
    )
    assert mismatch.status_code == 422
    assert mismatch.json()["detail"] == "checksum_mismatch"


def test_watch_zones_are_org_scoped(client, session_factory) -> None:
    token = "fwcam_watch_zone"
    with session_factory() as session:
        org_a = seed_organization(session, name="Watch A")
        org_b = seed_organization(session, name="Watch B")
        camera = _seed_camera(session, org_a.id, None, token=token)
        camera_id = camera.id
        seed_user(session, email="admin@watch.test", password=PASSWORD, org_roles=[(org_a.id, "customer_admin")])
        seed_user(session, email="viewer@other.test", password=PASSWORD, org_roles=[(org_b.id, "customer_admin")])
        session.commit()

    admin_headers, _ = login_web(client, email="admin@watch.test", password=PASSWORD)
    updated = client.patch(
        f"/v1/cameras/{camera_id}/watch-zones",
        headers=admin_headers,
        json={
            "zones": [
                {
                    "name": "Main stack light",
                    "equipmentName": "CNC-01 light",
                    "roi": {"type": "box", "x": 0.1, "y": 0.2, "w": 0.2, "h": 0.3},
                    "expectedState": "green",
                    "alertOnStates": ["red", "off"],
                    "minConfidence": 0.8,
                    "severity": "high",
                }
            ]
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["zones"][0]["equipmentName"] == "CNC-01 light"

    other_headers, _ = login_web(client, email="viewer@other.test", password=PASSWORD)
    blocked = client.get(f"/v1/cameras/{camera_id}/watch-zones", headers=other_headers)
    assert blocked.status_code == 403


def test_camera_heartbeat_updates_policy_response(client, session_factory) -> None:
    token = "fwcam_heartbeat"
    with session_factory() as session:
        org = seed_organization(session, name="Heartbeat Org")
        camera = _seed_camera(session, org.id, None, token=token)
        camera.sampling_interval_seconds = 10
        camera.retention_days = 7
        camera.local_spool_hours = 24
        session.add(camera)
        session.commit()

    response = client.post(
        "/v1/camera-ingest/heartbeat",
        headers={"Authorization": f"Bearer {token}"},
        json={"localSpoolCount": 3, "lastCapturedAt": "2026-06-19T02:03:00Z", "lastError": None},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["samplingIntervalSeconds"] == 10
    assert body["retentionDays"] == 7
    assert body["localSpoolHours"] == 24


def test_camera_device_config_is_device_scoped(client, session_factory) -> None:
    token_a = "fwcam_config_a"
    token_b = "fwcam_config_b"
    with session_factory() as session:
        org = seed_organization(session, name="Config Org")
        camera_a = _seed_camera(session, org.id, None, token=token_a)
        camera_a.name = "Config Camera A"
        camera_a.sampling_interval_seconds = 12
        camera_a.retention_days = 5
        camera_a.local_spool_hours = 18
        camera_a_id = camera_a.id
        _seed_camera(session, org.id, None, token=token_b)
        session.commit()

    response = client.get("/v1/camera-ingest/config", headers={"Authorization": f"Bearer {token_a}"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["cameraId"] == camera_a_id
    assert body["name"] == "Config Camera A"
    assert body["status"] == "active"
    assert body["rtspConfigured"] is True
    assert body["samplingIntervalSeconds"] == 12
    assert body["retentionDays"] == 5
    assert body["localSpoolHours"] == 18


def test_camera_health_list_is_org_scoped_and_counts_frames(client, session_factory) -> None:
    token_a = "fwcam_health_a"
    token_b = "fwcam_health_b"
    captured_at = datetime(2026, 6, 19, 3, 0, tzinfo=timezone.utc)
    with session_factory() as session:
        org_a = seed_organization(session, name="Health A")
        org_b = seed_organization(session, name="Health B")
        site = seed_site(session, organization_id=org_a.id, name="Health Site")
        camera_a = _seed_camera(session, org_a.id, site.id, token=token_a)
        camera_a.name = "Health Camera A"
        camera_a.last_heartbeat_at = captured_at
        camera_a.last_frame_at = captured_at
        camera_a_id = camera_a.id
        _seed_camera(session, org_b.id, None, token=token_b)
        session.add(
            CameraFrame(
                id="health-frame",
                camera_id=camera_a.id,
                organization_id=org_a.id,
                site_id=site.id,
                captured_at=captured_at,
                storage_key=f"camera-frames/{org_a.id}/{camera_a.id}/health-frame.jpg",
                content_type="image/jpeg",
                checksum_sha256=hashlib.sha256(b"frame").hexdigest(),
                size_bytes=5,
                upload_status="uploaded",
                analysis_status="queued",
                upload_expires_at=captured_at + timedelta(minutes=15),
                completed_at=captured_at,
            )
        )
        seed_user(session, email="admin@health-a.test", password=PASSWORD, org_roles=[(org_a.id, "customer_admin")])
        seed_user(session, email="admin@health-b.test", password=PASSWORD, org_roles=[(org_b.id, "customer_admin")])
        session.commit()

    admin_headers, _ = login_web(client, email="admin@health-a.test", password=PASSWORD)
    listed = client.get("/v1/cameras", headers=admin_headers)
    assert listed.status_code == 200, listed.text
    body = listed.json()
    assert [item["cameraId"] for item in body["cameras"]] == [camera_a_id]
    assert body["cameras"][0]["name"] == "Health Camera A"
    assert body["cameras"][0]["uploadedFrameCount"] == 1
    assert body["cameras"][0]["queuedFrameCount"] == 1
    assert body["cameras"][0]["latestFrame"]["frameId"] == "health-frame"

    detail = client.get(f"/v1/cameras/{camera_a_id}", headers=admin_headers)
    assert detail.status_code == 200, detail.text
    assert detail.json()["cameraId"] == camera_a_id

    other_headers, _ = login_web(client, email="admin@health-b.test", password=PASSWORD)
    blocked = client.get(f"/v1/cameras/{camera_a_id}", headers=other_headers)
    assert blocked.status_code == 403


def test_camera_device_submits_gauge_readings_and_web_list_shows_latest_per_gauge(client, session_factory) -> None:
    token = "fwcam_gauge_reader"
    with session_factory() as session:
        org = seed_organization(session, name="Gauge Org")
        site = seed_site(session, organization_id=org.id, name="Gauge Site")
        camera = _seed_camera(session, org.id, site.id, token=token)
        camera.name = "PoE Camera 192.168.1.10"
        org_id = org.id
        site_id = site.id
        camera_id = camera.id
        seed_user(session, email="admin@gauge.test", password=PASSWORD, org_roles=[(org.id, "customer_admin")])
        session.commit()

    response = client.post(
        "/v1/camera-ingest/gauge-readings",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "readings": [
                {
                    "gaugeId": "press_am_meter",
                    "label": "PRESS AM METER",
                    "value": 3.9,
                    "unit": "A",
                    "confidence": 0.91,
                    "rawPosition": 0.39,
                    "status": "ok",
                    "source": "live",
                    "capturedAt": "2026-07-03T01:00:00+08:00",
                    "metadata": {"method": "red"},
                },
                {
                    "gaugeId": "flow_am_meter",
                    "label": "FLOW AM METER",
                    "value": None,
                    "unit": "A",
                    "confidence": 0.2,
                    "rawPosition": None,
                    "status": "degraded",
                    "source": "live",
                    "capturedAt": "2026-07-03T01:00:00+08:00",
                    "metadata": {"reason": "meter_crop_too_small"},
                },
            ]
        },
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["cameraId"] == camera_id
    assert [reading["gaugeId"] for reading in body["readings"]] == ["press_am_meter", "flow_am_meter"]
    assert body["readings"][0]["value"] == 3.9

    with session_factory() as session:
        stored = session.exec(select(CameraGaugeReading).where(CameraGaugeReading.camera_id == camera_id)).all()
        assert len(stored) == 2
        assert {reading.organization_id for reading in stored} == {org_id}
        assert {reading.site_id for reading in stored} == {site_id}

    admin_headers, _ = login_web(client, email="admin@gauge.test", password=PASSWORD)
    listed = client.get("/v1/cameras", headers=admin_headers)
    assert listed.status_code == 200, listed.text
    listed_camera = listed.json()["cameras"][0]
    assert listed_camera["cameraId"] == camera_id
    assert [reading["gaugeId"] for reading in listed_camera["latestGaugeReadings"]] == [
        "press_am_meter",
        "flow_am_meter",
    ]
    assert listed_camera["latestGaugeReadings"][1]["status"] == "degraded"


def test_camera_device_submits_ocr_observation_and_web_list_shows_latest(client, session_factory) -> None:
    token = "fwcam_hmi_ocr"
    with session_factory() as session:
        org = seed_organization(session, name="OCR Org")
        site = seed_site(session, organization_id=org.id, name="OCR Site")
        camera = _seed_camera(session, org.id, site.id, token=token)
        camera.name = "PoE Camera 192.168.1.10"
        org_id = org.id
        site_id = site.id
        camera_id = camera.id
        seed_user(session, email="admin@ocr.test", password=PASSWORD, org_roles=[(org.id, "customer_admin")])
        session.commit()

    response = client.post(
        "/v1/camera-ingest/ocr-observations",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "mode": "machine_monitor",
            "modeConfidence": 0.86,
            "source": "live",
            "capturedAt": "2026-07-04T10:00:00+08:00",
            "rawOcrLines": [
                {"text": "機器監視", "confidence": 0.91, "box": [[0, 0], [10, 0], [10, 10], [0, 10]], "region": "hmi"},
                {"text": "射出四段", "confidence": 0.88, "region": "hmi"},
            ],
            "structuredFields": {
                "operationMode": {"value": "手動", "confidence": 0.78},
                "pressureBar": {"value": 0, "unit": "Bar", "confidence": 0.83},
            },
            "workOrderRawText": "HC600 生产日期 预计总数 后处理",
            "gptSummary": {"summary": "HC600 生产中，预计后处理。", "machine": "HC600"},
            "summaryStatus": "ok",
        },
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["cameraId"] == camera_id
    assert body["mode"] == "machine_monitor"
    assert body["summaryStatus"] == "ok"
    assert body["rawOcrLines"][0]["text"] == "機器監視"
    assert body["workOrderRawText"] == "HC600 生產日期 預計總數 後處理"
    assert body["gptSummary"]["summary"] == "HC600 生產中，預計後處理。"

    with session_factory() as session:
        stored = session.exec(select(CameraOcrObservation).where(CameraOcrObservation.camera_id == camera_id)).all()
        assert len(stored) == 1
        assert stored[0].organization_id == org_id
        assert stored[0].site_id == site_id
        assert stored[0].structured_fields_json["pressureBar"]["value"] == 0

    admin_headers, _ = login_web(client, email="admin@ocr.test", password=PASSWORD)
    listed = client.get("/v1/cameras", headers=admin_headers)
    assert listed.status_code == 200, listed.text
    latest = listed.json()["cameras"][0]["latestOcrObservation"]
    assert latest["mode"] == "machine_monitor"
    assert latest["workOrderRawText"] == "HC600 生產日期 預計總數 後處理"
    assert latest["gptSummary"]["machine"] == "HC600"


def test_camera_device_submits_person_observation_and_web_list_shows_latest(client, session_factory) -> None:
    token = "fwcam_person_presence"
    with session_factory() as session:
        org = seed_organization(session, name="Person Presence Org")
        site = seed_site(session, organization_id=org.id, name="Person Presence Site")
        camera = _seed_camera(session, org.id, site.id, token=token)
        camera.name = "PoE Camera 192.168.1.31"
        org_id = org.id
        site_id = site.id
        camera_id = camera.id
        seed_user(session, email="admin@presence.test", password=PASSWORD, org_roles=[(org.id, "customer_admin")])
        session.commit()

    response = client.post(
        "/v1/camera-ingest/person-observations",
        headers={"Authorization": f"Bearer {token}"},
        json=_person_observation_payload(),
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["cameraId"] == camera_id
    assert body["personCount"] == 2
    assert body["detections"][0]["bbox"] == [100, 120, 40, 160]
    assert body["detections"][0]["floorPosition"] == {"x": 1.25, "z": -3.5}

    with session_factory() as session:
        stored = session.exec(
            select(CameraPersonObservation).where(CameraPersonObservation.camera_id == camera_id)
        ).all()
        assert len(stored) == 1
        assert stored[0].organization_id == org_id
        assert stored[0].site_id == site_id
        assert stored[0].person_count == 2
        assert stored[0].detections_json[1]["floorPosition"] is None

    admin_headers, _ = login_web(client, email="admin@presence.test", password=PASSWORD)
    listed = client.get("/v1/cameras", headers=admin_headers)
    assert listed.status_code == 200, listed.text
    latest = listed.json()["cameras"][0]["latestPersonObservation"]
    assert latest["cameraId"] == camera_id
    assert latest["personCount"] == 2
    assert latest["calibrationId"] == "overview-h-20260704"
    assert latest["detectorName"] == "paddledet_ppyoloe_plus_person"


def test_camera_device_submits_empty_person_observation_as_zero_people(client, session_factory) -> None:
    token = "fwcam_zero_people"
    with session_factory() as session:
        org = seed_organization(session, name="No People Org")
        camera = _seed_camera(session, org.id, None, token=token)
        camera_id = camera.id
        session.commit()

    response = client.post(
        "/v1/camera-ingest/person-observations",
        headers={"Authorization": f"Bearer {token}"},
        json=_person_observation_payload(detections=[]),
    )

    assert response.status_code == 200, response.text
    assert response.json()["personCount"] == 0
    with session_factory() as session:
        stored = session.exec(
            select(CameraPersonObservation).where(CameraPersonObservation.camera_id == camera_id)
        ).one()
        assert stored.person_count == 0
        assert stored.detections_json == []


def test_person_observation_rejects_invalid_geometry(client, session_factory) -> None:
    token = "fwcam_bad_presence"
    with session_factory() as session:
        org = seed_organization(session, name="Bad Presence Org")
        _seed_camera(session, org.id, None, token=token)
        session.commit()

    invalid_payloads = [
        _person_observation_payload(detections=[{"bbox": [100, 120, -1, 160], "confidence": 0.8, "footPoint": [120, 280]}]),
        _person_observation_payload(detections=[{"bbox": [2500, 120, 80, 160], "confidence": 0.8, "footPoint": [2540, 280]}]),
        _person_observation_payload(detections=[{"bbox": [100, 120, 40, 160], "confidence": 1.2, "footPoint": [120, 280]}]),
        _person_observation_payload(detections=[{"bbox": [100, 120, 40, 160], "confidence": 0.8, "footPoint": [3000, 280]}]),
    ]

    for payload in invalid_payloads:
        response = client.post(
            "/v1/camera-ingest/person-observations",
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
        )
        assert response.status_code == 422, response.text


def test_person_observation_rejects_more_than_fifty_detections(client, session_factory) -> None:
    token = "fwcam_too_many_people"
    with session_factory() as session:
        org = seed_organization(session, name="Too Many People Org")
        _seed_camera(session, org.id, None, token=token)
        session.commit()

    detection = {"bbox": [100, 120, 40, 160], "confidence": 0.8, "footPoint": [120, 280], "floorPosition": None}
    response = client.post(
        "/v1/camera-ingest/person-observations",
        headers={"Authorization": f"Bearer {token}"},
        json=_person_observation_payload(detections=[detection for _ in range(51)]),
    )

    assert response.status_code == 422, response.text


def test_gauge_reading_frame_id_must_belong_to_authenticated_camera(client, session_factory) -> None:
    token_a = "fwcam_gauge_a"
    token_b = "fwcam_gauge_b"
    captured_at = datetime(2026, 7, 3, 1, 0, tzinfo=timezone.utc)
    with session_factory() as session:
        org = seed_organization(session, name="Gauge Scope Org")
        camera_a = _seed_camera(session, org.id, None, token=token_a)
        camera_b = _seed_camera(session, org.id, None, token=token_b)
        session.add(
            CameraFrame(
                id="camera-a-frame",
                camera_id=camera_a.id,
                organization_id=org.id,
                site_id=None,
                captured_at=captured_at,
                storage_key=f"camera-frames/{org.id}/{camera_a.id}/camera-a-frame.jpg",
                content_type="image/jpeg",
                checksum_sha256=hashlib.sha256(b"frame").hexdigest(),
                size_bytes=5,
                upload_status="uploaded",
                analysis_status="queued",
                upload_expires_at=captured_at + timedelta(minutes=15),
                completed_at=captured_at,
            )
        )
        session.commit()

    blocked = client.post(
        "/v1/camera-ingest/gauge-readings",
        headers={"Authorization": f"Bearer {token_b}"},
        json={
            "readings": [
                {
                    "gaugeId": "press_am_meter",
                    "value": 1.0,
                    "unit": "A",
                    "confidence": 0.9,
                    "status": "ok",
                    "source": "live",
                    "capturedAt": "2026-07-03T01:00:00Z",
                    "frameId": "camera-a-frame",
                }
            ]
        },
    )

    assert blocked.status_code == 403
    assert blocked.json()["detail"] == "camera_frame_scope_mismatch"


def test_ocr_observation_frame_id_must_belong_to_authenticated_camera(client, session_factory) -> None:
    token_a = "fwcam_ocr_a"
    token_b = "fwcam_ocr_b"
    captured_at = datetime(2026, 7, 4, 2, 0, tzinfo=timezone.utc)
    with session_factory() as session:
        org = seed_organization(session, name="OCR Scope Org")
        camera_a = _seed_camera(session, org.id, None, token=token_a)
        camera_b = _seed_camera(session, org.id, None, token=token_b)
        session.add(
            CameraFrame(
                id="ocr-camera-a-frame",
                camera_id=camera_a.id,
                organization_id=org.id,
                site_id=None,
                captured_at=captured_at,
                storage_key=f"camera-frames/{org.id}/{camera_a.id}/ocr-camera-a-frame.jpg",
                content_type="image/jpeg",
                checksum_sha256=hashlib.sha256(b"frame").hexdigest(),
                size_bytes=5,
                upload_status="uploaded",
                analysis_status="queued",
                upload_expires_at=captured_at + timedelta(minutes=15),
                completed_at=captured_at,
            )
        )
        session.commit()

    blocked = client.post(
        "/v1/camera-ingest/ocr-observations",
        headers={"Authorization": f"Bearer {token_b}"},
        json={
            "mode": "unknown",
            "modeConfidence": 0,
            "source": "live",
            "capturedAt": "2026-07-04T02:00:00Z",
            "frameId": "ocr-camera-a-frame",
            "rawOcrLines": [],
            "structuredFields": {},
            "summaryStatus": "unknown",
        },
    )

    assert blocked.status_code == 403
    assert blocked.json()["detail"] == "camera_frame_scope_mismatch"


def test_person_observation_frame_id_must_belong_to_authenticated_camera(client, session_factory) -> None:
    token_a = "fwcam_person_a"
    token_b = "fwcam_person_b"
    captured_at = datetime(2026, 7, 4, 3, 0, tzinfo=timezone.utc)
    with session_factory() as session:
        org = seed_organization(session, name="Person Scope Org")
        camera_a = _seed_camera(session, org.id, None, token=token_a)
        _seed_camera(session, org.id, None, token=token_b)
        session.add(
            CameraFrame(
                id="person-camera-a-frame",
                camera_id=camera_a.id,
                organization_id=org.id,
                site_id=None,
                captured_at=captured_at,
                storage_key=f"camera-frames/{org.id}/{camera_a.id}/person-camera-a-frame.jpg",
                content_type="image/jpeg",
                checksum_sha256=hashlib.sha256(b"frame").hexdigest(),
                size_bytes=5,
                upload_status="uploaded",
                analysis_status="queued",
                upload_expires_at=captured_at + timedelta(minutes=15),
                completed_at=captured_at,
            )
        )
        session.commit()

    blocked = client.post(
        "/v1/camera-ingest/person-observations",
        headers={"Authorization": f"Bearer {token_b}"},
        json=_person_observation_payload(frameId="person-camera-a-frame"),
    )
    missing = client.post(
        "/v1/camera-ingest/person-observations",
        headers={"Authorization": f"Bearer {token_b}"},
        json=_person_observation_payload(frameId="missing-person-frame"),
    )

    assert blocked.status_code == 403
    assert blocked.json()["detail"] == "camera_frame_scope_mismatch"
    assert missing.status_code == 404
    assert missing.json()["detail"] == "camera_frame_not_found"


def test_platform_admin_can_provision_camera_device_and_receives_one_time_token(client, session_factory) -> None:
    with session_factory() as session:
        org = seed_organization(session, name="Provision Org")
        site = seed_site(session, organization_id=org.id, name="Provision Site")
        seed_user(session, email="platform@camera.test", password=PASSWORD, global_roles=["platform_admin"])
        org_id = org.id
        site_id = site.id
        session.commit()

    headers, _ = login_web(client, email="platform@camera.test", password=PASSWORD)
    response = client.post(
        "/v1/cameras",
        headers=headers,
        json={
            "organizationId": org_id,
            "siteId": site_id,
            "name": "PoE Camera 192.168.1.10",
            "status": "active",
            "rtspConfigured": True,
            "samplingIntervalSeconds": 10,
            "retentionDays": 7,
            "localSpoolHours": 24,
        },
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["cameraId"]
    assert body["organizationId"] == org_id
    assert body["siteId"] == site_id
    assert body["name"] == "PoE Camera 192.168.1.10"
    assert body["deviceToken"].startswith("fwcam_")
    assert body["deviceTokenWarning"]

    with session_factory() as session:
        camera = session.get(CameraDevice, body["cameraId"])
        assert camera is not None
        assert verify_camera_device_token(body["deviceToken"], camera.device_token_hash)
        assert camera.created_by_user_id is not None

    listed = client.get("/v1/cameras", headers=headers)
    assert listed.status_code == 200, listed.text
    listed_camera = next(item for item in listed.json()["cameras"] if item["cameraId"] == body["cameraId"])
    assert "deviceToken" not in listed_camera


def test_customer_admin_cannot_provision_camera_for_another_org(client, session_factory) -> None:
    with session_factory() as session:
        org_a = seed_organization(session, name="Provision A")
        org_b = seed_organization(session, name="Provision B")
        seed_user(session, email="admin@provision-a.test", password=PASSWORD, org_roles=[(org_a.id, "customer_admin")])
        org_b_id = org_b.id
        session.commit()

    headers, _ = login_web(client, email="admin@provision-a.test", password=PASSWORD)
    response = client.post(
        "/v1/cameras",
        headers=headers,
        json={
            "organizationId": org_b_id,
            "name": "Blocked Camera",
            "rtspConfigured": True,
        },
    )

    assert response.status_code == 403


def test_camera_provision_rejects_site_from_other_organization(client, session_factory) -> None:
    with session_factory() as session:
        org_a = seed_organization(session, name="Provision Site A")
        org_b = seed_organization(session, name="Provision Site B")
        site_b = seed_site(session, organization_id=org_b.id, name="Other Org Site")
        seed_user(session, email="platform@site-mismatch.test", password=PASSWORD, global_roles=["platform_admin"])
        org_a_id = org_a.id
        site_b_id = site_b.id
        session.commit()

    headers, _ = login_web(client, email="platform@site-mismatch.test", password=PASSWORD)
    response = client.post(
        "/v1/cameras",
        headers=headers,
        json={
            "organizationId": org_a_id,
            "siteId": site_b_id,
            "name": "Mismatched Site Camera",
            "rtspConfigured": True,
        },
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "site_not_found"


def test_customer_admin_can_rotate_camera_device_token(client, session_factory) -> None:
    old_token = "fwcam_old_rotate"
    with session_factory() as session:
        org = seed_organization(session, name="Rotate Org")
        camera = _seed_camera(session, org.id, None, token=old_token)
        camera_id = camera.id
        seed_user(session, email="admin@rotate.test", password=PASSWORD, org_roles=[(org.id, "customer_admin")])
        session.commit()

    headers, _ = login_web(client, email="admin@rotate.test", password=PASSWORD)
    response = client.post(f"/v1/cameras/{camera_id}/device-token", headers=headers)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["cameraId"] == camera_id
    assert body["deviceToken"].startswith("fwcam_")
    assert body["deviceToken"] != old_token
    assert body["deviceTokenWarning"]

    with session_factory() as session:
        camera = session.get(CameraDevice, camera_id)
        assert camera is not None
        assert verify_camera_device_token(body["deviceToken"], camera.device_token_hash)
        assert not verify_camera_device_token(old_token, camera.device_token_hash)

    listed = client.get("/v1/cameras", headers=headers)
    assert listed.status_code == 200, listed.text
    listed_camera = next(item for item in listed.json()["cameras"] if item["cameraId"] == camera_id)
    assert "deviceToken" not in listed_camera


def test_camera_device_token_rotation_is_org_scoped(client, session_factory) -> None:
    with session_factory() as session:
        org_a = seed_organization(session, name="Rotate Scope A")
        org_b = seed_organization(session, name="Rotate Scope B")
        camera = _seed_camera(session, org_a.id, None, token="fwcam_rotate_scope")
        camera_id = camera.id
        seed_user(session, email="admin@rotate-other.test", password=PASSWORD, org_roles=[(org_b.id, "customer_admin")])
        session.commit()

    headers, _ = login_web(client, email="admin@rotate-other.test", password=PASSWORD)
    response = client.post(f"/v1/cameras/{camera_id}/device-token", headers=headers)

    assert response.status_code == 403


def test_latest_frame_image_is_web_org_scoped(client, session_factory) -> None:
    token = "fwcam_latest_frame"
    frame_bytes = b"\xff\xd8latest-frame\xff\xd9"
    checksum = hashlib.sha256(frame_bytes).hexdigest()
    with session_factory() as session:
        org_a = seed_organization(session, name="Latest Frame A")
        org_b = seed_organization(session, name="Latest Frame B")
        site = seed_site(session, organization_id=org_a.id, name="Latest Frame Site")
        camera = _seed_camera(session, org_a.id, site.id, token=token)
        camera_id = camera.id
        seed_user(session, email="admin@latest-a.test", password=PASSWORD, org_roles=[(org_a.id, "customer_admin")])
        seed_user(session, email="admin@latest-b.test", password=PASSWORD, org_roles=[(org_b.id, "customer_admin")])
        session.commit()

    camera_headers = {"Authorization": f"Bearer {token}"}
    intent = client.post(
        "/v1/camera-ingest/upload-intents",
        headers=camera_headers,
        json={
            "frameId": "latest-frame",
            "capturedAt": "2026-06-19T03:10:00Z",
            "contentType": "image/jpeg",
            "checksumSha256": checksum,
            "sizeBytes": len(frame_bytes),
        },
    )
    assert intent.status_code == 200, intent.text
    assert client.put(intent.json()["uploadUrl"], headers=camera_headers, content=frame_bytes).status_code == 204
    complete = client.post(
        "/v1/camera-ingest/frames/latest-frame/complete",
        headers=camera_headers,
        json={"checksumSha256": checksum, "sizeBytes": len(frame_bytes)},
    )
    assert complete.status_code == 200, complete.text

    admin_headers, _ = login_web(client, email="admin@latest-a.test", password=PASSWORD)
    image = client.get(f"/v1/cameras/{camera_id}/latest-frame/image", headers=admin_headers)
    assert image.status_code == 200, image.text
    assert image.content == frame_bytes
    assert image.headers["content-type"] == "image/jpeg"
    assert image.headers["cache-control"] == "private, no-store"
    assert image.headers["x-camera-frame-id"] == "latest-frame"

    other_headers, _ = login_web(client, email="admin@latest-b.test", password=PASSWORD)
    blocked = client.get(f"/v1/cameras/{camera_id}/latest-frame/image", headers=other_headers)
    assert blocked.status_code == 403


def test_latest_frame_image_is_available_to_same_camera_device_token(client, session_factory) -> None:
    token_a = "fwcam_latest_frame_device_a"
    token_b = "fwcam_latest_frame_device_b"
    frame_bytes = b"\xff\xd8device-latest-frame\xff\xd9"
    checksum = hashlib.sha256(frame_bytes).hexdigest()
    with session_factory() as session:
        org = seed_organization(session, name="Latest Frame Device")
        camera = _seed_camera(session, org.id, None, token=token_a)
        camera_id = camera.id
        _seed_camera(session, org.id, None, token=token_b)
        session.commit()

    headers_a = {"Authorization": f"Bearer {token_a}"}
    intent = client.post(
        "/v1/camera-ingest/upload-intents",
        headers=headers_a,
        json={
            "frameId": "device-latest-frame",
            "capturedAt": "2026-06-19T03:10:00Z",
            "contentType": "image/jpeg",
            "checksumSha256": checksum,
            "sizeBytes": len(frame_bytes),
        },
    )
    assert intent.status_code == 200, intent.text
    assert client.put(intent.json()["uploadUrl"], headers=headers_a, content=frame_bytes).status_code == 204
    complete = client.post(
        "/v1/camera-ingest/frames/device-latest-frame/complete",
        headers=headers_a,
        json={"checksumSha256": checksum, "sizeBytes": len(frame_bytes)},
    )
    assert complete.status_code == 200, complete.text

    image = client.get("/v1/camera-ingest/latest-frame/image", headers=headers_a)
    assert image.status_code == 200, image.text
    assert image.content == frame_bytes
    assert image.headers["content-type"] == "image/jpeg"
    assert image.headers["x-camera-frame-id"] == "device-latest-frame"
    assert image.headers["x-camera-captured-at"] == "2026-06-19T03:10:00Z"

    other_image = client.get("/v1/camera-ingest/latest-frame/image", headers={"Authorization": f"Bearer {token_b}"})
    assert other_image.status_code == 404
    assert other_image.json()["detail"] == "camera_latest_frame_not_found"

    with session_factory() as session:
        stored_camera = session.get(CameraDevice, camera_id)
        assert stored_camera is not None


def test_latest_frame_image_returns_404_without_uploaded_frame(client, session_factory) -> None:
    token = "fwcam_no_latest"
    with session_factory() as session:
        org = seed_organization(session, name="No Latest Org")
        camera = _seed_camera(session, org.id, None, token=token)
        camera_id = camera.id
        seed_user(session, email="admin@no-latest.test", password=PASSWORD, org_roles=[(org.id, "customer_admin")])
        session.commit()

    admin_headers, _ = login_web(client, email="admin@no-latest.test", password=PASSWORD)
    response = client.get(f"/v1/cameras/{camera_id}/latest-frame/image", headers=admin_headers)

    assert response.status_code == 404
    assert response.json()["detail"] == "camera_latest_frame_not_found"


def _person_observation_payload(**overrides) -> dict:
    payload = {
        "source": "live",
        "capturedAt": "2026-07-04T10:00:00+08:00",
        "imageWidth": 2560,
        "imageHeight": 1440,
        "calibrationId": "overview-h-20260704",
        "detectorName": "paddledet_ppyoloe_plus_person",
        "detections": [
            {
                "bbox": [100, 120, 40, 160],
                "confidence": 0.92,
                "footPoint": [120, 280],
                "floorPosition": {"x": 1.25, "z": -3.5},
            },
            {
                "bbox": [200, 150, 42, 180],
                "confidence": 0.81,
                "footPoint": [221, 330],
                "floorPosition": None,
            },
        ],
    }
    payload.update(overrides)
    return payload


def _seed_camera(session, organization_id: str, site_id: str | None, *, token: str) -> CameraDevice:
    camera = CameraDevice(
        organization_id=organization_id,
        site_id=site_id,
        name=f"Camera {token[-4:]}",
        device_token_hash=hash_camera_device_token(token),
        rtsp_configured=True,
    )
    session.add(camera)
    session.flush()
    return camera
