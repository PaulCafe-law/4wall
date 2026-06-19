from __future__ import annotations

import argparse
import logging
import signal
import time

from app.camera_analysis import build_equipment_state_provider, process_next_queued_camera_frame
from app.config import Settings
from app.db import create_engine_for_settings, create_session_factory, init_db
from app.storage import ArtifactStorage, LocalFileArtifactStorage, S3ArtifactStorage


logger = logging.getLogger(__name__)


def main() -> None:
    parser = argparse.ArgumentParser(description="4WALL Factory Camera Analysis worker")
    parser.add_argument("--once", action="store_true", help="Process at most one queued frame and exit.")
    parser.add_argument("--poll-interval", type=float, default=5.0, help="Seconds to wait when no frame is ready.")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    settings = Settings.from_env()
    settings.validate_runtime()
    engine = create_engine_for_settings(settings)
    init_db(engine, settings)
    session_factory = create_session_factory(engine)
    storage = _build_artifact_storage(settings)
    provider = build_equipment_state_provider(settings)
    stop = _StopFlag()

    def request_stop(_signum, _frame) -> None:
        stop.requested = True

    signal.signal(signal.SIGINT, request_stop)
    signal.signal(signal.SIGTERM, request_stop)

    if provider is None:
        logger.warning("camera_analysis_provider_disabled")
        if args.once:
            return
        while not stop.requested:
            time.sleep(args.poll_interval)
        return

    while not stop.requested:
        frame_id = None
        try:
            with session_factory() as session:
                frame_id = process_next_queued_camera_frame(
                    session=session,
                    storage=storage,
                    settings=settings,
                    provider=provider,
                )
                if frame_id:
                    logger.info("camera_frame_processed", extra={"frame_id": frame_id})
        except Exception:
            logger.exception("camera_analysis_worker_iteration_failed")

        if args.once:
            return
        if not frame_id:
            time.sleep(args.poll_interval)


def _build_artifact_storage(settings: Settings) -> ArtifactStorage:
    if settings.artifact_backend.lower() == "s3":
        return S3ArtifactStorage.from_settings(settings)
    return LocalFileArtifactStorage(settings.artifact_root)


class _StopFlag:
    requested = False


if __name__ == "__main__":
    main()
