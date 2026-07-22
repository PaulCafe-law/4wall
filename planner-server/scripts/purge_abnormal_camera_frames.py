from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from sqlalchemy import delete, func, or_
from sqlmodel import Session, select


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from app.config import Settings
from app.db import create_engine_for_settings
from app.models import (
    CameraDevice,
    CameraFrame,
    CameraGaugeReading,
    CameraOcrObservation,
    CameraPersonObservation,
)
from app.storage import LocalFileArtifactStorage, S3ArtifactStorage


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Dry-run or purge failed camera frames and derived observations.")
    parser.add_argument("--execute", action="store_true", help="Perform deletion; omission is always dry-run.")
    parser.add_argument("--batch-size", type=int, default=250, choices=range(1, 1001), metavar="1..1000")
    return parser.parse_args()


def _failed_filter():
    return or_(CameraFrame.upload_status == "failed", CameraFrame.analysis_status == "failed")


def _protected_frame_ids(session: Session) -> set[str]:
    return {
        frame_id
        for frame_id in session.exec(
            select(CameraDevice.latest_frame_id).where(CameraDevice.latest_frame_id.is_not(None))
        ).all()
        if frame_id
    }


def _storage_from_settings(settings: Settings):
    if settings.artifact_backend.lower() == "s3":
        return S3ArtifactStorage.from_settings(settings)
    return LocalFileArtifactStorage(settings.artifact_root)


def run(*, execute: bool, batch_size: int) -> dict[str, int | bool]:
    settings = Settings.from_env()
    engine = create_engine_for_settings(settings)
    storage = _storage_from_settings(settings)
    deleted = 0
    deleted_bytes = 0

    with Session(engine) as session:
        protected_ids = _protected_frame_ids(session)
        criteria = [_failed_filter()]
        if protected_ids:
            criteria.append(CameraFrame.id.not_in(protected_ids))
        candidate_count, candidate_bytes = session.exec(
            select(func.count(CameraFrame.id), func.coalesce(func.sum(CameraFrame.size_bytes), 0)).where(*criteria)
        ).one()
        summary: dict[str, int | bool] = {
            "dryRun": not execute,
            "candidateFrames": int(candidate_count or 0),
            "candidateBytes": int(candidate_bytes or 0),
            "protectedLatestFrames": len(protected_ids),
            "deletedFrames": 0,
            "deletedBytes": 0,
        }
        if not execute:
            return summary

        while True:
            frames = session.exec(
                select(CameraFrame)
                .where(*criteria)
                .order_by(CameraFrame.created_at, CameraFrame.id)
                .limit(batch_size)
            ).all()
            if not frames:
                break
            frame_ids = [frame.id for frame in frames]
            try:
                for frame in frames:
                    storage.delete(frame.storage_key)
                session.exec(delete(CameraGaugeReading).where(CameraGaugeReading.frame_id.in_(frame_ids)))
                session.exec(delete(CameraOcrObservation).where(CameraOcrObservation.frame_id.in_(frame_ids)))
                session.exec(delete(CameraPersonObservation).where(CameraPersonObservation.frame_id.in_(frame_ids)))
                session.exec(delete(CameraFrame).where(CameraFrame.id.in_(frame_ids)))
                session.commit()
            except Exception:
                session.rollback()
                raise
            deleted += len(frames)
            deleted_bytes += sum(frame.size_bytes or 0 for frame in frames)

        summary["deletedFrames"] = deleted
        summary["deletedBytes"] = deleted_bytes
        return summary


def main() -> int:
    args = parse_args()
    print(json.dumps(run(execute=args.execute, batch_size=args.batch_size), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
