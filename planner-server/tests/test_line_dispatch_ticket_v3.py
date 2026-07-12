from __future__ import annotations

from datetime import datetime, timedelta, timezone
from io import BytesIO
from uuid import uuid4

from PIL import Image

from app.line_dispatch_ticket import (
    DispatchTicketCropError,
    crop_dispatch_ticket_png,
    find_latest_line_crop_capture,
    find_latest_work_order_capture,
)
from app.models import CameraDevice, CameraFrame, CameraOcrObservation
from tests.helpers import seed_organization, seed_site


def _evidence(*, roi=(2, 1, 3, 2), frame_size=(8, 4), aligned=True) -> dict:
    status = "ok" if aligned else "invalid"
    return {
        "workOrder": {
            "alignmentStatus": status,
            "currentEvidence": aligned,
            "fields": {"machineNo": {"value": "HC600"}},
            "quantities": {"total": {"left": {"value": 10}, "right": {"value": "unknown"}}},
        },
        "captureRegions": {
            "calibrationId": "jingcheng-hc600-20260712-v2",
            "frameSize": list(frame_size),
            "hmi": {"roi": [0, 0, 1, 1], "alignmentStatus": "unverified"},
            "workOrder": {"roi": list(roi), "alignmentStatus": status},
        },
    }


def _scope(session):
    org = seed_organization(session, name=f"Dispatch {uuid4().hex[:6]}")
    site = seed_site(session, organization_id=org.id, name="Jingcheng")
    camera = CameraDevice(
        organization_id=org.id,
        site_id=site.id,
        name="PoE Camera 192.168.1.10",
        device_token_hash=f"hash-{uuid4().hex}",
    )
    session.add(camera)
    session.flush()
    return org, site, camera


def _frame(session, *, camera, org, site, frame_id, at, width=8, height=4):
    frame = CameraFrame(
        id=frame_id,
        camera_id=camera.id,
        organization_id=org.id,
        site_id=site.id,
        captured_at=at,
        storage_key=f"frames/{frame_id}.png",
        content_type="image/png",
        width=width,
        height=height,
        upload_status="uploaded",
        analysis_status="complete",
        upload_expires_at=at + timedelta(minutes=10),
        created_at=at,
    )
    session.add(frame)
    session.flush()
    return frame


def _observation(
    session,
    *,
    camera,
    org,
    site,
    frame_id,
    at,
    structured=None,
    received_at=None,
    source="live",
):
    observation = CameraOcrObservation(
        camera_id=camera.id,
        organization_id=org.id,
        site_id=site.id,
        frame_id=frame_id,
        mode="machine_monitor",
        mode_confidence=0.9,
        source=source,
        captured_at=at,
        created_at=received_at or at,
        structured_fields_json=_evidence() if structured is None else structured,
    )
    session.add(observation)
    session.flush()
    return observation


def test_capture_uses_observation_exact_frame_not_camera_newest(client, session_factory) -> None:
    now = datetime.now(timezone.utc)
    with session_factory() as session:
        org, site, camera = _scope(session)
        exact = _frame(session, camera=camera, org=org, site=site, frame_id="frame-exact", at=now - timedelta(seconds=30))
        _frame(session, camera=camera, org=org, site=site, frame_id="frame-newer", at=now - timedelta(seconds=5))
        _observation(session, camera=camera, org=org, site=site, frame_id=exact.id, at=now - timedelta(seconds=30))
        session.commit()

        capture = find_latest_work_order_capture(
            session, organization_id=org.id, site_id=site.id, now=now
        )

    assert capture is not None
    assert capture.frame.id == "frame-exact"
    assert capture.observation.frame_id == "frame-exact"
    assert capture.work_order_roi == (2, 1, 3, 2)
    assert capture.hmi_roi == (0, 0, 1, 1)


def test_capture_rejects_cross_camera_frame_and_stale_received_observation(client, session_factory) -> None:
    now = datetime.now(timezone.utc)
    with session_factory() as session:
        org, site, camera = _scope(session)
        other = CameraDevice(
            organization_id=org.id,
            site_id=site.id,
            name="other",
            device_token_hash=f"hash-{uuid4().hex}",
        )
        session.add(other)
        session.flush()
        cross = _frame(session, camera=other, org=org, site=site, frame_id="frame-cross", at=now)
        _observation(session, camera=camera, org=org, site=site, frame_id=cross.id, at=now)
        session.commit()
        assert find_latest_work_order_capture(session, organization_id=org.id, site_id=site.id, now=now) is None


def test_capture_rejects_offline_source_and_frame_timestamp_mismatch(client, session_factory) -> None:
    now = datetime.now(timezone.utc)
    with session_factory() as session:
        org, site, camera = _scope(session)
        frame = _frame(session, camera=camera, org=org, site=site, frame_id="frame-offline", at=now)
        _observation(
            session,
            camera=camera,
            org=org,
            site=site,
            frame_id=frame.id,
            at=now,
            source="offline_file",
        )
        session.commit()
        assert find_latest_work_order_capture(session, organization_id=org.id, site_id=site.id, now=now) is None

    with session_factory() as session:
        org, site, camera = _scope(session)
        frame = _frame(
            session,
            camera=camera,
            org=org,
            site=site,
            frame_id="frame-time-mismatch",
            at=now - timedelta(seconds=20),
        )
        _observation(
            session,
            camera=camera,
            org=org,
            site=site,
            frame_id=frame.id,
            at=now,
        )
        session.commit()
        assert find_latest_work_order_capture(session, organization_id=org.id, site_id=site.id, now=now) is None

    with session_factory() as session:
        org, site, camera = _scope(session)
        frame = _frame(session, camera=camera, org=org, site=site, frame_id="frame-stale-received", at=now)
        _observation(
            session,
            camera=camera,
            org=org,
            site=site,
            frame_id=frame.id,
            at=now,
            received_at=now - timedelta(minutes=4),
        )
        session.commit()
        assert find_latest_work_order_capture(session, organization_id=org.id, site_id=site.id, now=now) is None


def test_capture_rejects_invalid_alignment_and_out_of_bounds_roi(client, session_factory) -> None:
    now = datetime.now(timezone.utc)
    for structured in (_evidence(aligned=False), _evidence(roi=(7, 3, 2, 2))):
        with session_factory() as session:
            org, site, camera = _scope(session)
            frame = _frame(session, camera=camera, org=org, site=site, frame_id=f"frame-{uuid4().hex}", at=now)
            _observation(
                session, camera=camera, org=org, site=site, frame_id=frame.id, at=now, structured=structured
            )
            session.commit()
            assert find_latest_work_order_capture(
                session, organization_id=org.id, site_id=site.id, now=now
            ) is None


def test_line_crop_capture_accepts_invalid_ocr_alignment_but_keeps_roi_validation(client, session_factory) -> None:
    now = datetime.now(timezone.utc)
    with session_factory() as session:
        org, site, camera = _scope(session)
        frame = _frame(session, camera=camera, org=org, site=site, frame_id="frame-line-direct", at=now)
        _observation(
            session,
            camera=camera,
            org=org,
            site=site,
            frame_id=frame.id,
            at=now,
            structured=_evidence(aligned=False),
        )
        session.commit()

        capture = find_latest_line_crop_capture(session, organization_id=org.id, site_id=site.id, now=now)

    assert capture is not None
    assert capture.frame.id == "frame-line-direct"
    assert capture.work_order_roi == (2, 1, 3, 2)
    assert capture.hmi_roi == (0, 0, 1, 1)


def test_crop_uses_exact_pixel_roi_content() -> None:
    image = Image.new("RGB", (8, 4), color=(255, 0, 0))
    for y in range(1, 3):
        for x in range(2, 5):
            image.putpixel((x, y), (0, 255, 0))
    source = BytesIO()
    image.save(source, format="PNG")

    cropped_bytes = crop_dispatch_ticket_png(source.getvalue(), roi=(2, 1, 3, 2), frame_size=(8, 4))
    cropped = Image.open(BytesIO(cropped_bytes))

    assert cropped.size == (3, 2)
    assert {cropped.getpixel((x, y)) for y in range(2) for x in range(3)} == {(0, 255, 0)}


def test_crop_rejects_frame_size_mismatch() -> None:
    source = BytesIO()
    Image.new("RGB", (8, 4), color=(0, 0, 0)).save(source, format="PNG")

    try:
        crop_dispatch_ticket_png(source.getvalue(), roi=(2, 1, 3, 2), frame_size=(16, 8))
    except DispatchTicketCropError as exc:
        assert str(exc) == "dispatch_ticket_frame_size_mismatch"
    else:
        raise AssertionError("expected frame-size mismatch to fail closed")


def test_capture_restricts_expected_camera_role_and_newest_missing_evidence_fails_closed(
    client, session_factory
) -> None:
    now = datetime.now(timezone.utc)
    with session_factory() as session:
        org, site, hmi_camera = _scope(session)
        person_camera = CameraDevice(
            organization_id=org.id,
            site_id=site.id,
            name="PoE Camera 192.168.1.31",
            device_token_hash=f"hash-{uuid4().hex}",
        )
        session.add(person_camera)
        session.flush()
        hmi_frame = _frame(
            session,
            camera=hmi_camera,
            org=org,
            site=site,
            frame_id="frame-hmi-valid",
            at=now - timedelta(seconds=20),
        )
        person_frame = _frame(
            session,
            camera=person_camera,
            org=org,
            site=site,
            frame_id="frame-person-forged",
            at=now - timedelta(seconds=10),
        )
        _observation(
            session,
            camera=hmi_camera,
            org=org,
            site=site,
            frame_id=hmi_frame.id,
            at=now - timedelta(seconds=20),
        )
        _observation(
            session,
            camera=person_camera,
            org=org,
            site=site,
            frame_id=person_frame.id,
            at=now - timedelta(seconds=10),
        )
        session.commit()

        capture = find_latest_work_order_capture(
            session,
            organization_id=org.id,
            site_id=site.id,
            camera_ids=(hmi_camera.id,),
            now=now,
        )
        assert capture is not None
        assert capture.frame.id == hmi_frame.id

        newest_hmi_frame = _frame(
            session,
            camera=hmi_camera,
            org=org,
            site=site,
            frame_id="frame-hmi-no-work-order",
            at=now - timedelta(seconds=1),
        )
        _observation(
            session,
            camera=hmi_camera,
            org=org,
            site=site,
            frame_id=newest_hmi_frame.id,
            at=now - timedelta(seconds=1),
            structured={"captureRegions": {}},
        )
        session.commit()

        assert find_latest_work_order_capture(
            session,
            organization_id=org.id,
            site_id=site.id,
            camera_ids=(hmi_camera.id,),
            now=now,
        ) is None
