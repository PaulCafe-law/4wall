from __future__ import annotations

import argparse
import logging
import sys

from .clients import ClientError, CloudClient, CollectorClient
from .config import ConfigError, load_config
from .http import UrllibJsonTransport
from .runner import ConnectorRunner
from .state import StateError, StateStore


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="4WALL outbound OpenBMC connector")
    parser.add_argument("--config", required=True, help="Path to local JSON config")
    parser.add_argument("--once", action="store_true", help="Run one cycle and exit")
    args = parser.parse_args(argv)
    try:
        config = load_config(args.config)
        state = StateStore(config.state_path)
    except (ConfigError, StateError) as exc:
        print(f"connector startup failed: {exc}", file=sys.stderr)
        return 2

    logging.basicConfig(
        level=getattr(logging, config.log_level),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    try:
        cloud = CloudClient(config.cloud, UrllibJsonTransport())
        collector = CollectorClient(config.collector, UrllibJsonTransport())
    except ClientError as exc:
        print(f"connector startup failed: {exc.code}", file=sys.stderr)
        return 2
    runner = ConnectorRunner(
        config=config,
        cloud=cloud,
        collector=collector,
        state=state,
    )
    if args.once:
        runner.run_once()
    else:
        runner.run_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
