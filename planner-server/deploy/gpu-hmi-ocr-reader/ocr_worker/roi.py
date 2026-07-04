from __future__ import annotations

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
