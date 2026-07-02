from __future__ import annotations

from dataclasses import dataclass
from math import hypot
from typing import Iterable

import cv2
import numpy as np


Point = tuple[float, float]


@dataclass(frozen=True)
class GaugeCalibration:
    roi: tuple[int, int, int, int]
    rect_corners: list[Point]
    scale_points: dict[float, Point]
    needle_search_band: tuple[int, int, int, int]
    needle_color_hint: str = "red"


def parse_gauge_calibration(payload: dict) -> GaugeCalibration:
    return GaugeCalibration(
        roi=tuple(int(v) for v in payload["roi"]),
        rect_corners=[(float(x), float(y)) for x, y in payload["rect_corners"]],
        scale_points={float(k): (float(v[0]), float(v[1])) for k, v in payload["scale_points"].items()},
        needle_search_band=tuple(int(v) for v in payload["needle_search_band"]),
        needle_color_hint=str(payload.get("needle_color_hint", "red")),
    )


def crop_roi(frame: np.ndarray, roi: tuple[int, int, int, int]) -> np.ndarray:
    x, y, w, h = roi
    if w <= 0 or h <= 0:
        raise ValueError("roi width and height must be positive")
    frame_h, frame_w = frame.shape[:2]
    if x < 0 or y < 0 or x + w > frame_w or y + h > frame_h:
        raise ValueError(f"roi {roi} outside frame {frame_w}x{frame_h}")
    return frame[y : y + h, x : x + w].copy()


def warp_meter(crop: np.ndarray, corners: Iterable[Point]) -> np.ndarray:
    pts = np.array(list(corners), dtype=np.float32)
    if pts.shape != (4, 2):
        raise ValueError("rect_corners must contain four points")

    tl, tr, br, bl = pts
    width = max(_distance(tl, tr), _distance(bl, br))
    height = max(_distance(tl, bl), _distance(tr, br))
    width_i = max(2, int(round(width)))
    height_i = max(2, int(round(height)))

    dst = np.array(
        [[0, 0], [width_i - 1, 0], [width_i - 1, height_i - 1], [0, height_i - 1]],
        dtype=np.float32,
    )
    matrix = cv2.getPerspectiveTransform(pts, dst)
    return cv2.warpPerspective(crop, matrix, (width_i, height_i))


def interpolate_value(point: Point, scale_points: dict[float, Point]) -> tuple[float, float]:
    ordered = sorted(scale_points.items(), key=lambda item: item[0])
    if len(ordered) < 2:
        raise ValueError("at least two scale points are required")

    best_value = ordered[0][0]
    best_distance = float("inf")

    px, py = point
    for (v0, p0), (v1, p1) in zip(ordered, ordered[1:]):
        x0, y0 = p0
        x1, y1 = p1
        dx = x1 - x0
        dy = y1 - y0
        denom = dx * dx + dy * dy
        if denom <= 0:
            continue
        t = ((px - x0) * dx + (py - y0) * dy) / denom
        t = max(0.0, min(1.0, t))
        proj_x = x0 + t * dx
        proj_y = y0 + t * dy
        distance = hypot(px - proj_x, py - proj_y)
        if distance < best_distance:
            best_distance = distance
            best_value = v0 + t * (v1 - v0)

    min_val = ordered[0][0]
    max_val = ordered[-1][0]
    raw_position = 0.0 if max_val == min_val else (best_value - min_val) / (max_val - min_val)
    return best_value, raw_position


def clamp_rect(rect: tuple[int, int, int, int], image_shape: tuple[int, int, int] | tuple[int, int]) -> tuple[int, int, int, int]:
    x, y, w, h = rect
    height, width = image_shape[:2]
    x = max(0, min(x, width - 1))
    y = max(0, min(y, height - 1))
    w = max(1, min(w, width - x))
    h = max(1, min(h, height - y))
    return x, y, w, h


def _distance(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.linalg.norm(a - b))
