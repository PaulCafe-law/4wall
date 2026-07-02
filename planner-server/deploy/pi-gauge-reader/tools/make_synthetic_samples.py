from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np


def make_meter(value: float, *, width: int = 400, height: int = 120) -> np.ndarray:
    image = np.full((height, width, 3), 245, dtype=np.uint8)
    cv2.rectangle(image, (8, 8), (width - 9, height - 9), (30, 40, 50), 2)
    cv2.rectangle(image, (18, 18), (width - 19, height - 18), (235, 235, 235), -1)
    scale_y = 72
    x0 = 24
    x1 = width - 26
    cv2.line(image, (x0, scale_y), (x1, scale_y), (80, 80, 80), 1)
    for tick in range(0, 11):
        x = int(round(x0 + (x1 - x0) * tick / 10))
        tick_h = 20 if tick % 2 == 0 else 10
        cv2.line(image, (x, scale_y - tick_h), (x, scale_y + 8), (50, 50, 50), 1)
        if tick % 2 == 0:
            cv2.putText(image, str(tick), (x - 8, scale_y - 26), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (50, 50, 50), 1)
    needle_x = int(round(x0 + (x1 - x0) * value / 10))
    cv2.line(image, (needle_x, 24), (needle_x, 100), (0, 0, 220), 3)
    return image


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="runtime/synthetic")
    args = parser.parse_args()
    output_dir = Path(args.out)
    output_dir.mkdir(parents=True, exist_ok=True)
    for value in [0, 2, 4, 6, 8, 10]:
        image = make_meter(float(value))
        cv2.imwrite(str(output_dir / f"meter-{value}.jpg"), image)
    print(output_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
