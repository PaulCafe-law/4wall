from __future__ import annotations

import argparse
import logging
import signal
import time

from app.config import Settings
from app.db import create_engine_for_settings, create_session_factory, init_db
from app.industrial_data_engine.pipeline import process_next_queued_job


logger = logging.getLogger(__name__)


def main() -> None:
    parser = argparse.ArgumentParser(description="4WALL Industrial Data Engine worker")
    parser.add_argument("--once", action="store_true", help="Process at most one queued job and exit.")
    parser.add_argument("--poll-interval", type=float, default=5.0, help="Seconds to wait when no queued job is found.")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    settings = Settings.from_env()
    settings.validate_runtime()
    engine = create_engine_for_settings(settings)
    init_db(engine, settings)
    session_factory = create_session_factory(engine)
    stop = _StopFlag()

    def request_stop(_signum, _frame) -> None:
        stop.requested = True

    signal.signal(signal.SIGINT, request_stop)
    signal.signal(signal.SIGTERM, request_stop)

    while not stop.requested:
        job_id = None
        try:
            with session_factory() as session:
                job_id = process_next_queued_job(session=session, settings=settings)
                if job_id:
                    logger.info("industrial_engine_job_processed", extra={"job_id": job_id})
        except Exception:
            logger.exception("industrial_engine_worker_iteration_failed")

        if args.once:
            return
        if not job_id:
            time.sleep(args.poll_interval)


class _StopFlag:
    requested = False


if __name__ == "__main__":
    main()
