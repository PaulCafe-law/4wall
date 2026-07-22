from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlmodel import Session, SQLModel, create_engine

from app.models import CameraFrame, CameraOcrObservation
from scripts.purge_abnormal_camera_frames import run
from tests.helpers import seed_organization


def test_purge_abnormal_frames_is_dry_run_first_and_preserves_latest(tmp_path, monkeypatch) -> None:
    database_path = tmp_path / "purge.db"
    artifacts = tmp_path / "artifacts"
    database_url = f"sqlite:///{database_path}"
    monkeypatch.setenv("BUILDING_ROUTE_DATABASE_URL", database_url)
    monkeypatch.setenv("BUILDING_ROUTE_ARTIFACT_BACKEND", "local")
    monkeypatch.setenv("BUILDING_ROUTE_ARTIFACT_ROOT", str(artifacts))
    engine = create_engine(database_url)
    SQLModel.metadata.create_all(engine)
    captured_at = datetime.now(timezone.utc)

    with Session(engine) as session:
        org = seed_organization(session, name="Purge Org")
        from app.models import CameraDevice

        camera = CameraDevice(
            organization_id=org.id,
            name="Purge Camera",
            device_token_hash="purge-token",
        )
        session.add(camera)
        session.flush()
        protected = CameraFrame(
            id="protected-latest",
            camera_id=camera.id,
            organization_id=org.id,
            captured_at=captured_at,
            storage_key="frames/protected.jpg",
            content_type="image/jpeg",
            upload_status="uploaded",
            analysis_status="failed",
            upload_expires_at=captured_at + timedelta(minutes=15),
        )
        failed = CameraFrame(
            id="failed-old",
            camera_id=camera.id,
            organization_id=org.id,
            captured_at=captured_at - timedelta(minutes=1),
            storage_key="frames/failed.jpg",
            content_type="image/jpeg",
            size_bytes=7,
            upload_status="failed",
            analysis_status="failed",
            upload_expires_at=captured_at + timedelta(minutes=15),
        )
        camera.latest_frame_id = protected.id
        camera.latest_storage_key = protected.storage_key
        session.add_all([camera, protected, failed])
        session.add(
            CameraOcrObservation(
                camera_id=camera.id,
                organization_id=org.id,
                frame_id=failed.id,
                mode="unknown",
                mode_confidence=0,
                source="live",
                captured_at=failed.captured_at,
            )
        )
        session.commit()

    failed_path = artifacts / "frames" / "failed.jpg"
    failed_path.parent.mkdir(parents=True)
    failed_path.write_bytes(b"failure")

    dry_run = run(execute=False, batch_size=10)
    assert dry_run["candidateFrames"] == 1
    assert dry_run["deletedFrames"] == 0
    assert failed_path.exists()

    result = run(execute=True, batch_size=10)
    assert result["deletedFrames"] == 1
    assert result["deletedBytes"] == 7
    assert not failed_path.exists()
    with Session(engine) as session:
        assert session.get(CameraFrame, "failed-old") is None
        assert session.get(CameraFrame, "protected-latest") is not None
