from __future__ import annotations

import math
import re
import unicodedata
from dataclasses import dataclass

import cv2
import numpy as np

from .config import HmiFieldConfig
from .ocr_engine import OcrTextLine


@dataclass(frozen=True)
class FieldReading:
    field: HmiFieldConfig
    value: float | None
    confidence: float
    raw_text: str
    status: str
    raw_position: float | None
    message: str | None = None


@dataclass(frozen=True)
class ScreenVisibility:
    status: str
    confidence: float
    mean_luma: float
    p90_luma: float
    p98_luma: float


def is_fractional_roi(roi: tuple[float, float, float, float]) -> bool:
    x, y, width, height = roi
    if width <= 0 or height <= 0:
        return False
    return all(0.0 <= part <= 1.0 for part in (x, y, width, height))


def resolve_roi(
    roi: tuple[float, float, float, float],
    target_size: tuple[int, int],
    reference_size: tuple[int, int] | None = None,
) -> tuple[int, int, int, int]:
    """Resolve a configured ROI to pixel coordinates for the actual frame size.

    A fractional ROI (every value in 0..1) is interpreted as fractions of
    ``target_size``. An absolute-pixel ROI is assumed to be measured at
    ``reference_size`` and is scaled proportionally when the target differs;
    without a reference it is used as-is. A zero-size ROI is the whole-frame
    sentinel and passes through unscaled.
    """
    x, y, width, height = roi
    if width <= 0 or height <= 0:
        return (_round_half_up(x), _round_half_up(y), _round_half_up(width), _round_half_up(height))
    target_width, target_height = target_size
    if is_fractional_roi(roi):
        return (
            _round_half_up(x * target_width),
            _round_half_up(y * target_height),
            _round_half_up(width * target_width),
            _round_half_up(height * target_height),
        )
    if reference_size is None or reference_size[0] <= 0 or reference_size[1] <= 0:
        return (_round_half_up(x), _round_half_up(y), _round_half_up(width), _round_half_up(height))
    scale_x = target_width / reference_size[0]
    scale_y = target_height / reference_size[1]
    return (
        _round_half_up(x * scale_x),
        _round_half_up(y * scale_y),
        _round_half_up(width * scale_x),
        _round_half_up(height * scale_y),
    )


def nominal_roi_size(
    roi: tuple[float, float, float, float],
    reference_size: tuple[int, int] | None,
) -> tuple[int, int] | None:
    """Crop size the ROI would produce at the reference resolution.

    Nested ROIs (e.g. ``hmi.fields``) are measured inside that nominal crop,
    so it becomes their own reference when the actual crop size differs.
    """
    _x, _y, width, height = roi
    if width <= 0 or height <= 0:
        return reference_size
    if is_fractional_roi(roi):
        if reference_size is None:
            return None
        return (_round_half_up(width * reference_size[0]), _round_half_up(height * reference_size[1]))
    return (_round_half_up(width), _round_half_up(height))


def frame_size_warnings(
    previous_size: tuple[int, int] | None,
    current_size: tuple[int, int],
    reference_size: tuple[int, int] | None,
) -> list[dict[str, object]]:
    """Warnings about frame-geometry surprises; empty when nothing changed."""
    if previous_size is not None and tuple(previous_size) != tuple(current_size):
        return [
            {
                "warning": "frame_resolution_changed",
                "previousResolution": list(previous_size),
                "currentResolution": list(current_size),
                "message": "Incoming frame resolution changed between polls; pixel ROIs are rescaled for the new size.",
            }
        ]
    if previous_size is None and reference_size is not None and tuple(current_size) != tuple(reference_size):
        return [
            {
                "warning": "frame_resolution_differs_from_reference",
                "referenceResolution": list(reference_size),
                "currentResolution": list(current_size),
                "message": "Frame resolution differs from reference_resolution; pixel ROIs are scaled proportionally.",
            }
        ]
    return []


def _round_half_up(value: float) -> int:
    return int(math.floor(value + 0.5))


def crop_roi(image: np.ndarray, roi: tuple[int, int, int, int]) -> np.ndarray:
    x, y, width, height = roi
    if width <= 0 or height <= 0:
        return image.copy()
    image_height, image_width = image.shape[:2]
    left = max(0, min(image_width, x))
    top = max(0, min(image_height, y))
    right = max(left, min(image_width, x + width))
    bottom = max(top, min(image_height, y + height))
    if right <= left or bottom <= top:
        raise ValueError(f"ROI is outside image bounds: {roi}")
    return image[top:bottom, left:right].copy()


def preprocess_for_ocr(image: np.ndarray) -> np.ndarray:
    if image.shape[0] < 120 or image.shape[1] < 240:
        image = cv2.resize(image, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
    return image


def detect_screen_visibility(image: np.ndarray) -> ScreenVisibility:
    height, width = image.shape[:2]
    # Focus on the LCD interior and avoid the surrounding frame and sticky notes.
    left = int(width * 0.08)
    top = int(height * 0.14)
    right = int(width * 0.73)
    bottom = int(height * 0.75)
    interior = image[top:max(top + 1, bottom), left:max(left + 1, right)]
    gray = cv2.cvtColor(interior, cv2.COLOR_BGR2GRAY)
    mean_luma = float(gray.mean())
    p90_luma = float(np.percentile(gray, 90))
    p98_luma = float(np.percentile(gray, 98))
    lit_score = max(0.0, min(1.0, (mean_luma - 45.0) / 90.0))
    highlight_score = max(0.0, min(1.0, (p90_luma - 70.0) / 120.0))
    confidence = round(max(lit_score, highlight_score), 3)
    if mean_luma >= 205.0 and p90_luma >= 248.0 and p98_luma >= 252.0:
        status = "overexposed"
    else:
        status = "lit" if mean_luma >= 80.0 and p90_luma >= 120.0 else "dark"
    return ScreenVisibility(
        status=status,
        confidence=confidence,
        mean_luma=round(mean_luma, 2),
        p90_luma=round(p90_luma, 2),
        p98_luma=round(p98_luma, 2),
    )


def read_field(
    field: HmiFieldConfig,
    lines: list[OcrTextLine],
    *,
    min_confidence: float,
) -> FieldReading:
    raw_text = " ".join(line.text for line in lines).strip()
    confidence = max((line.confidence for line in lines), default=0.0)
    value = parse_numeric_value(raw_text)
    message = None
    status = "ok"
    if value is None:
        status = "degraded"
        message = "ocr_numeric_value_not_found"
    elif confidence < min_confidence:
        status = "degraded"
        message = "ocr_confidence_below_threshold"
    elif field.min_value is not None and value < field.min_value:
        status = "degraded"
        message = "ocr_value_below_min"
    elif field.max_value is not None and value > field.max_value:
        status = "degraded"
        message = "ocr_value_above_max"

    if value is not None and field.decimal_places is not None:
        value = round(value, field.decimal_places)

    return FieldReading(
        field=field,
        value=value,
        confidence=confidence,
        raw_text=raw_text,
        status=status,
        raw_position=raw_position_for(field, value),
        message=message,
    )


def lines_inside_roi(lines: list[OcrTextLine], roi: tuple[int, int, int, int]) -> list[OcrTextLine]:
    x, y, width, height = roi
    if width <= 0 or height <= 0:
        return lines
    right = x + width
    bottom = y + height
    matched = []
    for line in lines:
        if not line.box:
            continue
        center_x = sum(point[0] for point in line.box) / len(line.box)
        center_y = sum(point[1] for point in line.box) / len(line.box)
        if x <= center_x <= right and y <= center_y <= bottom:
            matched.append(line)
    return matched


def parse_numeric_value(text: str) -> float | None:
    normalized = normalize_ocr_text(text)
    match = re.search(r"[-+]?\d+(?:[.,]\d+)?", normalized)
    if not match:
        return None
    try:
        return float(match.group(0).replace(",", "."))
    except ValueError:
        return None


def normalize_ocr_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text)
    replacements = {
        "O": "0",
        "o": "0",
        "I": "1",
        "l": "1",
        "S": "5",
    }
    return "".join(replacements.get(char, char) for char in normalized)


def raw_position_for(field: HmiFieldConfig, value: float | None) -> float | None:
    if value is None or field.min_value is None or field.max_value is None:
        return None
    span = field.max_value - field.min_value
    if span <= 0:
        return None
    return max(0.0, min(1.0, (value - field.min_value) / span))
