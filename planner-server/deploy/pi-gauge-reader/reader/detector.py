from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import cv2
import numpy as np

from .geometry import GaugeCalibration, clamp_rect, interpolate_value, warp_meter


@dataclass(frozen=True)
class DetectionResult:
    value: float | None
    confidence: float
    raw_position: float | None
    status: str
    message: str | None
    needle_point: tuple[float, float] | None
    warped_width: int


class NeedleDetector(Protocol):
    def detect(self, crop: np.ndarray, calibration: GaugeCalibration) -> tuple[DetectionResult, np.ndarray]:
        ...


class ClassicalLinearMeterDetector:
    def __init__(self, *, min_crop_width_px: int = 180) -> None:
        self.min_crop_width_px = min_crop_width_px

    def detect(self, crop: np.ndarray, calibration: GaugeCalibration) -> tuple[DetectionResult, np.ndarray]:
        warped = warp_meter(crop, calibration.rect_corners)
        band_rect = clamp_rect(calibration.needle_search_band, warped.shape)
        x, y, w, h = band_rect
        band = warped[y : y + h, x : x + w]

        point, confidence, method = _detect_red_needle(band)
        if point is None:
            point, confidence, method = _detect_dark_needle(band)

        annotated = warped.copy()
        degraded_by_resolution = warped.shape[1] < self.min_crop_width_px

        if point is None:
            cv2.rectangle(annotated, (x, y), (x + w, y + h), (0, 0, 255), 2)
            return (
                DetectionResult(
                    value=None,
                    confidence=0.0,
                    raw_position=None,
                    status="degraded",
                    message="needle_not_found",
                    needle_point=None,
                    warped_width=warped.shape[1],
                ),
                annotated,
            )

        px = x + point[0]
        py = y + point[1]
        value, raw_position = interpolate_value((px, py), calibration.scale_points)
        status = "degraded" if degraded_by_resolution else "ok"
        if degraded_by_resolution:
            confidence = min(confidence, 0.6)

        cv2.rectangle(annotated, (x, y), (x + w, y + h), (255, 160, 0), 1)
        cv2.line(annotated, (int(px), y), (int(px), y + h), (0, 0, 255), 2)
        cv2.circle(annotated, (int(px), int(py)), 4, (0, 255, 255), -1)
        cv2.putText(
            annotated,
            f"{value:.2f} conf={confidence:.2f} {method}",
            (8, max(18, y - 8)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (0, 255, 255),
            1,
            cv2.LINE_AA,
        )

        return (
            DetectionResult(
                value=float(value),
                confidence=float(max(0.0, min(1.0, confidence))),
                raw_position=float(raw_position),
                status=status,
                message="meter_crop_too_small" if degraded_by_resolution else None,
                needle_point=(float(px), float(py)),
                warped_width=warped.shape[1],
            ),
            annotated,
        )


def _detect_red_needle(band: np.ndarray) -> tuple[tuple[float, float] | None, float, str]:
    hsv = cv2.cvtColor(band, cv2.COLOR_BGR2HSV)
    lower_a = np.array([0, 50, 40], dtype=np.uint8)
    upper_a = np.array([12, 255, 255], dtype=np.uint8)
    lower_b = np.array([165, 50, 40], dtype=np.uint8)
    upper_b = np.array([179, 255, 255], dtype=np.uint8)
    mask = cv2.inRange(hsv, lower_a, upper_a) | cv2.inRange(hsv, lower_b, upper_b)
    kernel = np.ones((3, 3), dtype=np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    return _column_peak(mask, "red")


def _detect_dark_needle(band: np.ndarray) -> tuple[tuple[float, float] | None, float, str]:
    gray = cv2.cvtColor(band, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    gray = clahe.apply(gray)
    gray = cv2.GaussianBlur(gray, (3, 3), 0)
    _, mask = cv2.threshold(gray, 90, 255, cv2.THRESH_BINARY_INV)
    kernel = np.ones((3, 3), dtype=np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    return _column_peak(mask, "dark")


def _column_peak(mask: np.ndarray, method: str) -> tuple[tuple[float, float] | None, float, str]:
    if mask.size == 0:
        return None, 0.0, method
    column_scores = (mask > 0).sum(axis=0)
    max_score = int(column_scores.max(initial=0))
    if max_score <= max(3, int(mask.shape[0] * 0.08)):
        return None, 0.0, method

    x = int(column_scores.argmax())
    ys = np.flatnonzero(mask[:, x] > 0)
    y = float(mask.shape[0] / 2 if ys.size == 0 else ys.mean())
    coverage = max_score / max(1, mask.shape[0])
    mean_score = float(column_scores.mean()) + 1.0
    dominance = min(1.0, max_score / (mean_score * 6.0))
    confidence = min(1.0, coverage * 0.75 + dominance * 0.25)
    if method == "dark":
        confidence *= 0.7
    return (float(x), y), float(confidence), method
