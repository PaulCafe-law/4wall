from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib

from app.models import CameraDevice, CameraFrame
from app.routers.camera_ingest import MAX_FRAME_SIZE_BYTES
from app.security import hash_camera_device_token
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
