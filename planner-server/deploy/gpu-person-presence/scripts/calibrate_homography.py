from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import yaml


def compute_homography(points: list[dict[str, Any]]) -> tuple[list[list[float]], list[dict[str, float]]]:
    if len(points) < 4:
        raise ValueError("at least four point correspondences are required")

    image_points = np.asarray([_point_pair(point["image"]) for point in points], dtype=np.float32)
    world_points = np.asarray([_point_pair(point["world"]) for point in points], dtype=np.float32)
    matrix, mask = cv2.findHomography(image_points, world_points, method=0)
    if matrix is None or mask is None:
        raise ValueError("cv2.findHomography failed")

    errors = reprojection_errors(matrix, image_points, world_points)
    return matrix.astype(float).round(8).tolist(), errors


def reprojection_errors(
    matrix: np.ndarray,
    image_points: np.ndarray,
    world_points: np.ndarray,
) -> list[dict[str, float]]:
    projected = cv2.perspectiveTransform(image_points.reshape(-1, 1, 2), matrix).reshape(-1, 2)
    errors: list[dict[str, float]] = []
    for idx, (expected, actual) in enumerate(zip(world_points, projected, strict=True)):
        dx = float(actual[0] - expected[0])
        dz = float(actual[1] - expected[1])
        errors.append(
            {
                "index": float(idx),
                "dx": round(dx, 6),
                "dz": round(dz, 6),
                "error": round(float(np.hypot(dx, dz)), 6),
            }
        )
    return errors


def load_points(path: Path) -> list[dict[str, Any]]:
    text = path.read_text(encoding="utf-8")
    if path.suffix.lower() == ".json":
        payload = json.loads(text)
    else:
        payload = yaml.safe_load(text)
    points = payload.get("points") if isinstance(payload, dict) else payload
    if not isinstance(points, list):
        raise ValueError("calibration file must contain a points list")
    return points


def _point_pair(value: Any) -> tuple[float, float]:
    if isinstance(value, dict):
        if "x" in value and "z" in value:
            return float(value["x"]), float(value["z"])
        if "u" in value and "v" in value:
            return float(value["u"]), float(value["v"])
    if isinstance(value, (list, tuple)) and len(value) == 2:
        return float(value[0]), float(value[1])
    raise ValueError(f"invalid point pair: {value!r}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Compute image foot-point to Factory Twin world homography")
    parser.add_argument("points", type=Path, help="YAML/JSON with points: [{image:[u,v], world:[x,z]}]")
    parser.add_argument("--output", type=Path, default=None, help="Optional YAML report path")
    args = parser.parse_args()

    matrix, errors = compute_homography(load_points(args.points))
    report = {
        "homography": matrix,
        "reprojection": {
            "maxError": max((item["error"] for item in errors), default=0.0),
            "meanError": round(float(np.mean([item["error"] for item in errors])) if errors else 0.0, 6),
            "points": errors,
        },
    }

    rendered = yaml.safe_dump(report, sort_keys=False, allow_unicode=False)
    if args.output:
        args.output.write_text(rendered, encoding="utf-8")
    else:
        print(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
