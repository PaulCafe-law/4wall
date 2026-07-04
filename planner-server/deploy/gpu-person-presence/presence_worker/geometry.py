from __future__ import annotations

import math
from typing import Iterable

import numpy as np

from .detector import Detection


Point = tuple[float, float]


def foot_point(detection: Detection) -> Point:
    x, y, width, height = detection.bbox
    return x + width / 2.0, y + height


def point_in_polygon(point: Point, polygon: Iterable[Point]) -> bool:
    points = list(polygon)
    if len(points) < 3:
        return True
    x, y = point
    inside = False
    j = len(points) - 1
    for i, (xi, yi) in enumerate(points):
        xj, yj = points[j]
        if ((yi > y) != (yj > y)) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi:
            inside = not inside
        j = i
    return inside


def project_point(homography: list[list[float]] | None, point: Point) -> dict[str, float] | None:
    if homography is None:
        return None
    matrix = np.asarray(homography, dtype=float)
    if matrix.shape != (3, 3) or not np.isfinite(matrix).all():
        return None
    u, v = point
    projected = matrix @ np.asarray([u, v, 1.0], dtype=float)
    denom = projected[2]
    if not math.isfinite(float(denom)) or abs(float(denom)) < 1e-9:
        return None
    x = float(projected[0] / denom)
    z = float(projected[1] / denom)
    if not math.isfinite(x) or not math.isfinite(z):
        return None
    return {"x": round(x, 4), "z": round(z, 4)}


def valid_detection(
    detection: Detection,
    *,
    image_width: int,
    image_height: int,
    min_confidence: float,
    min_bbox_height_px: float,
    valid_region_polygon: list[Point],
) -> bool:
    if detection.label not in {"person", "0"}:
        return False
    x, y, width, height = detection.bbox
    if not all(math.isfinite(value) for value in [x, y, width, height, detection.confidence]):
        return False
    if detection.confidence < min_confidence or width <= 0 or height < min_bbox_height_px:
        return False
    if x < 0 or y < 0 or x + width > image_width or y + height > image_height:
        return False
    return point_in_polygon(foot_point(detection), valid_region_polygon)
