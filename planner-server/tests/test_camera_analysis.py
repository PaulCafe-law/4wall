from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
from io import BytesIO

from PIL import Image
from sqlmodel import select

from app.camera_analysis import EquipmentStateResult, NoopEquipmentStateProvider, analyze_camera_frame
from app.models import (
    CameraDevice,
    CameraFrame,
    EquipmentStateObservation,
    EquipmentWatchZone,
    IncidentRecord,
)
from app.security import hash_camera_device_token
from tests.helpers import seed_organization


class StaticProvider:
    def __init__(self, result: EquipmentStateResult) -> None:
        self.result = result
        self.calls = 0

    def analyze(self, *, frame, zone, frame_bytes):
        self.calls += 1
        return self.result


class FailingProvider:
    def analyze(self, *, frame, zone, frame_bytes):
        raise RuntimeError("model_timeout")


class InspectingProvider:
    def __init__(self) -> None:
        self.image_size: tuple[int, int] | None = None

    def analyze(self, *, frame, zone, frame_bytes):
        with Image.open(BytesIO(frame_bytes)) as image:
            self.image_size = image.size
        return EquipmentStateResult(state="green", confidence=0.99)


def test_high_confidence_alert_creates_pending_review_incident(app, client, session_factory) -> None:
    with session_factory() as session:
        org = seed_organization(session, name="Analysis Org")
        camera = _seed_camera(session, org.id)
        _seed_zone(session, camera, alert_on_states=["red"], min_confidence=0.8, severity="high")
        frame = _seed_uploaded_frame(session, app.state.artifact_storage, camera, frame_id="alert-frame")
        session.commit()

        observations = analyze_camera_frame(
            session=session,
            storage=app.state.artifact_storage,
            settings=app.state.settings,
            frame=frame,
            provider=StaticProvider(
                EquipmentStateResult(
                    state="red",
                    confidence=0.93,
                    reason="Stack light is red.",
                    raw_output={"label": "red_light"},
                )
            ),
        )

        assert len(observations) == 1
        incident = session.exec(select(IncidentRecord)).one()
        observation = session.exec(select(EquipmentStateObservation)).one()
        assert incident.status == "pending_review"
        assert incident.source == "camera"
        assert incident.severity == "high"
        assert incident.ai_confidence == 0.93
        assert observation.status == "incident_created"
        assert observation.incident_id == incident.id


def test_low_confidence_alert_records_observation_without_incident(app, client, session_factory) -> None:
    with session_factory() as session:
        org = seed_organization(session, name="Low Confidence Org")
        camera = _seed_camera(session, org.id)
        _seed_zone(session, camera, alert_on_states=["red"], min_confidence=0.8)
        frame = _seed_uploaded_frame(session, app.state.artifact_storage, camera, frame_id="low-frame")
        session.commit()

        analyze_camera_frame(
            session=session,
            storage=app.state.artifact_storage,
            settings=app.state.settings,
            frame=frame,
            provider=StaticProvider(EquipmentStateResult(state="red", confidence=0.51, reason="Weak signal.")),
        )

        assert session.exec(select(IncidentRecord)).all() == []
        observation = session.exec(select(EquipmentStateObservation)).one()
        assert observation.status == "recorded"
        assert observation.state == "red"
        assert observation.confidence == 0.51


def test_noop_provider_processes_watch_zone_without_incident(app, client, session_factory) -> None:
    with session_factory() as session:
        org = seed_organization(session, name="Noop Analysis Org")
        camera = _seed_camera(session, org.id)
        _seed_zone(session, camera, alert_on_states=["red"], min_confidence=0.8)
        frame = _seed_uploaded_frame(session, app.state.artifact_storage, camera, frame_id="noop-frame")
        session.commit()

        analyze_camera_frame(
            session=session,
            storage=app.state.artifact_storage,
            settings=app.state.settings,
            frame=frame,
            provider=NoopEquipmentStateProvider(),
        )

        refreshed = session.get(CameraFrame, frame.id)
        assert refreshed.analysis_status == "succeeded"
        assert refreshed.error_message is None
        assert session.exec(select(IncidentRecord)).all() == []
        observation = session.exec(select(EquipmentStateObservation)).one()
        assert observation.status == "recorded"
        assert observation.state == "unknown"
        assert observation.confidence == 0.0
        assert observation.model_output_json == {"provider": "noop"}


def test_noop_provider_does_not_require_valid_roi_crop(app, client, session_factory) -> None:
    with session_factory() as session:
        org = seed_organization(session, name="Noop Tiny Frame Org")
        camera = _seed_camera(session, org.id)
        _seed_zone(session, camera, alert_on_states=["red"], min_confidence=0.8)
        frame = _seed_uploaded_frame(
            session,
            app.state.artifact_storage,
            camera,
            frame_id="noop-tiny-frame",
            payload=_jpeg_bytes(size=(1, 1)),
        )
        session.commit()

        analyze_camera_frame(
            session=session,
            storage=app.state.artifact_storage,
            settings=app.state.settings,
            frame=frame,
            provider=NoopEquipmentStateProvider(),
        )

        refreshed = session.get(CameraFrame, frame.id)
        assert refreshed.analysis_status == "succeeded"
        assert refreshed.error_message is None
        observation = session.exec(select(EquipmentStateObservation)).one()
        assert observation.status == "recorded"
        assert observation.state == "unknown"
        assert observation.confidence == 0.0


def test_provider_failure_marks_frame_failed(app, client, session_factory) -> None:
    with session_factory() as session:
        org = seed_organization(session, name="Failure Org")
        camera = _seed_camera(session, org.id)
        _seed_zone(session, camera, alert_on_states=["red"])
        frame = _seed_uploaded_frame(session, app.state.artifact_storage, camera, frame_id="failed-frame")
        session.commit()

        analyze_camera_frame(
            session=session,
            storage=app.state.artifact_storage,
            settings=app.state.settings,
            frame=frame,
            provider=FailingProvider(),
        )

        refreshed = session.get(CameraFrame, frame.id)
        observation = session.exec(select(EquipmentStateObservation)).one()
        assert refreshed.analysis_status == "failed"
        assert refreshed.error_message == "all_watch_zone_analysis_failed"
        assert observation.status == "failed"
        assert observation.reason == "model_timeout"


def test_roi_crop_bytes_are_sent_to_provider(app, client, session_factory) -> None:
    with session_factory() as session:
        org = seed_organization(session, name="ROI Org")
        camera = _seed_camera(session, org.id)
        _seed_zone(session, camera, alert_on_states=["red"])
        frame = _seed_uploaded_frame(
            session,
            app.state.artifact_storage,
            camera,
            frame_id="roi-frame",
            payload=_jpeg_bytes(size=(100, 80)),
        )
        session.commit()

        provider = InspectingProvider()
        analyze_camera_frame(
            session=session,
            storage=app.state.artifact_storage,
            settings=app.state.settings,
            frame=frame,
            provider=provider,
        )

        assert provider.image_size == (30, 32)


def test_unsupported_image_format_is_not_sent_to_provider(app, client, session_factory) -> None:
    with session_factory() as session:
        org = seed_organization(session, name="Unsupported Analysis Image Org")
        camera = _seed_camera(session, org.id)
        _seed_zone(session, camera, alert_on_states=["red"])
        frame = _seed_uploaded_frame(
            session,
            app.state.artifact_storage,
            camera,
            frame_id="unsupported-image-frame",
            payload=_image_bytes("GIF"),
        )
        session.commit()

        provider = StaticProvider(EquipmentStateResult(state="red", confidence=0.95))
        observations = analyze_camera_frame(
            session=session,
            storage=app.state.artifact_storage,
            settings=app.state.settings,
            frame=frame,
            provider=provider,
        )

        refreshed = session.get(CameraFrame, frame.id)
        assert provider.calls == 0
        assert refreshed is not None
        assert refreshed.analysis_status == "failed"
        assert refreshed.error_message == "all_watch_zone_analysis_failed"
        assert len(observations) == 1
        assert observations[0].status == "failed"


def test_duplicate_frame_within_heartbeat_window_skips_provider(app, client, session_factory) -> None:
    with session_factory() as session:
        org = seed_organization(session, name="Duplicate Org")
        camera = _seed_camera(session, org.id)
        _seed_zone(session, camera, alert_on_states=["red"])
        first = _seed_uploaded_frame(
            session,
            app.state.artifact_storage,
            camera,
            frame_id="first-frame",
            captured_at=datetime(2026, 6, 19, 2, 0, tzinfo=timezone.utc),
            payload=_jpeg_bytes(color=(20, 30, 40)),
        )
        first.analysis_status = "succeeded"
        second = _seed_uploaded_frame(
            session,
            app.state.artifact_storage,
            camera,
            frame_id="second-frame",
            captured_at=datetime(2026, 6, 19, 2, 1, tzinfo=timezone.utc),
            payload=_jpeg_bytes(color=(20, 30, 40)),
        )
        session.add(first)
        session.commit()

        provider = StaticProvider(EquipmentStateResult(state="red", confidence=0.95))
        analyze_camera_frame(
            session=session,
            storage=app.state.artifact_storage,
            settings=app.state.settings,
            frame=second,
            provider=provider,
        )

        refreshed = session.get(CameraFrame, second.id)
        assert provider.calls == 0
        assert refreshed.analysis_status == "skipped"
        assert refreshed.error_message == "duplicate_frame_within_heartbeat_window"
        assert session.exec(select(EquipmentStateObservation)).all() == []


def _seed_camera(session, organization_id: str) -> CameraDevice:
    camera = CameraDevice(
        organization_id=organization_id,
        name="Analysis Camera",
        device_token_hash=hash_camera_device_token("fwcam_analysis"),
        rtsp_configured=True,
    )
    session.add(camera)
    session.flush()
    return camera


def _seed_zone(
    session,
    camera: CameraDevice,
    *,
    alert_on_states: list[str],
    min_confidence: float = 0.8,
    severity: str = "medium",
) -> EquipmentWatchZone:
    zone = EquipmentWatchZone(
        camera_id=camera.id,
        organization_id=camera.organization_id,
        name="Stack light",
        equipment_name="CNC stack light",
        roi_json={"type": "box", "x": 0.1, "y": 0.2, "w": 0.3, "h": 0.4},
        expected_state="green",
        alert_on_states_json=alert_on_states,
        min_confidence=min_confidence,
        severity=severity,
    )
    session.add(zone)
    session.flush()
    return zone


def _seed_uploaded_frame(
    session,
    storage,
    camera: CameraDevice,
    *,
    frame_id: str,
    captured_at: datetime | None = None,
    payload: bytes | None = None,
) -> CameraFrame:
    captured_at = captured_at or datetime(2026, 6, 19, 2, 0, tzinfo=timezone.utc)
    payload = payload or _jpeg_bytes()
    storage_key = f"camera-frames/{camera.organization_id}/{camera.id}/{frame_id}.jpg"
    checksum = hashlib.sha256(payload).hexdigest()
    storage.write(key=storage_key, data=payload, content_type="image/jpeg", cache_control="private, max-age=300")
    frame = CameraFrame(
        id=frame_id,
        camera_id=camera.id,
        organization_id=camera.organization_id,
        captured_at=captured_at,
        storage_key=storage_key,
        content_type="image/jpeg",
        checksum_sha256=checksum,
        size_bytes=len(payload),
        upload_status="uploaded",
        analysis_status="queued",
        upload_expires_at=captured_at + timedelta(minutes=15),
        completed_at=captured_at,
    )
    session.add(frame)
    session.flush()
    return frame


def _jpeg_bytes(*, size: tuple[int, int] = (64, 48), color: tuple[int, int, int] = (120, 80, 40)) -> bytes:
    return _image_bytes("JPEG", size=size, color=color)


def _image_bytes(
    image_format: str,
    *,
    size: tuple[int, int] = (64, 48),
    color: tuple[int, int, int] = (120, 80, 40),
) -> bytes:
    output = BytesIO()
    Image.new("RGB", size, color).save(output, format=image_format)
    return output.getvalue()
