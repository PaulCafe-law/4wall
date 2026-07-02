from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import cv2

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from reader.capture import capture_frame  # noqa: E402
from reader.config import load_config  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="config.yaml")
    parser.add_argument("--out", default="samples")
    parser.add_argument("--count", type=int, default=5)
    parser.add_argument("--interval", type=float, default=2.0)
    args = parser.parse_args(argv)

    config = load_config(args.config)
    output_dir = Path(args.out)
    output_dir.mkdir(parents=True, exist_ok=True)

    for index in range(args.count):
        frame = capture_frame(config.camera)
        path = output_dir / f"sample-{int(time.time())}-{index + 1}.jpg"
        cv2.imwrite(str(path), frame)
        print(path)
        time.sleep(args.interval)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
