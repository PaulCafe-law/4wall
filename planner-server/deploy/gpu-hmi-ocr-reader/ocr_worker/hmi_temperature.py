from __future__ import annotations

import re
import time
from collections import Counter
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from .config import HmiFieldConfig
from .ocr_engine import OcrEngine, OcrTextLine
from .roi import FieldReading, crop_roi, lines_inside_roi


TemperatureRowId = str
TemperatureSlotId = str
TemperatureHistory = dict[str, list[tuple[float, float, str]]]


TEMPERATURE_ROWS: tuple[tuple[TemperatureRowId, str], ...] = (
    ("setpoint", "設定"),
    ("current", "現在"),
    ("keepWarm", "保溫"),
)

TEMPERATURE_SLOTS: tuple[tuple[TemperatureSlotId, str], ...] = (
    ("barrel1", "一段"),
    ("barrel2", "二段"),
    ("barrel3", "三段"),
    ("barrel4", "四段"),
    ("barrel5", "五段"),
    ("oilTemperature", "油溫"),
)

# Fixed HC600 HMI screen cell ROIs in the configured HMI crop coordinate space.
# These are intentionally slightly wider than the visible number boxes because
# the PoE camera frame has mild barrel distortion and compression shimmer.
TEMPERATURE_CELL_ROIS: dict[TemperatureRowId, dict[TemperatureSlotId, tuple[int, int, int, int]]] = {
    "setpoint": {
        "barrel1": (105, 126, 30, 17),
        "barrel2": (150, 126, 30, 17),
        "barrel3": (194, 126, 32, 17),
        "barrel4": (239, 126, 32, 17),
        "barrel5": (284, 126, 32, 17),
        "oilTemperature": (358, 126, 34, 17),
    },
    "current": {
        "barrel1": (105, 148, 30, 17),
        "barrel2": (150, 148, 30, 17),
        "barrel3": (194, 148, 32, 17),
        "barrel4": (239, 148, 32, 17),
        "barrel5": (284, 148, 32, 17),
        "oilTemperature": (358, 148, 34, 17),
    },
    "keepWarm": {
        "barrel1": (105, 169, 30, 17),
        "barrel2": (150, 169, 30, 17),
        "barrel3": (194, 169, 32, 17),
        "barrel4": (239, 169, 32, 17),
        "barrel5": (284, 169, 32, 17),
        "oilTemperature": (358, 169, 34, 17),
    },
}


def read_temperature_grid(
    *,
    engine: OcrEngine,
    hmi_crop: np.ndarray,
    hmi_lines: list[OcrTextLine],
    min_confidence: float,
    debug_dir: Path | None = None,
    frame_name: str = "live",
) -> list[FieldReading]:
    readings: list[FieldReading] = []
    timestamp = int(time.time())
    for row_id, row_label in TEMPERATURE_ROWS:
        for slot_id, slot_label in TEMPERATURE_SLOTS:
            roi = TEMPERATURE_CELL_ROIS[row_id][slot_id]
            field = HmiFieldConfig(
                id=f"hc600_temperature_{row_id}_{slot_id}",
                label=f"HC600 {row_label} {slot_label}",
                unit="C",
                roi=roi,
                min_value=_temperature_min_value(slot_id),
                max_value=350,
                decimal_places=0,
            )
            cell_lines = lines_inside_roi(hmi_lines, roi)
            cell = crop_roi(hmi_crop, roi)
            ocr_image = preprocess_for_temperature_cell(cell)
            if debug_dir is not None:
                debug_dir.mkdir(parents=True, exist_ok=True)
                cv2.imwrite(str(debug_dir / f"{frame_name}-{field.id}-{timestamp}.jpg"), ocr_image)
            if cell_lines:
                readings.append(
                    read_temperature_field(
                        field,
                        cell_lines,
                        min_confidence=temperature_min_confidence(min_confidence),
                    )
                )
                continue
            readings.append(
                read_temperature_field(
                    field,
                    engine.recognize(ocr_image),
                    min_confidence=temperature_min_confidence(min_confidence),
                )
            )
    return readings


def read_temperature_field(
    field: HmiFieldConfig,
    lines: list,
    *,
    min_confidence: float,
) -> FieldReading:
    raw_text = " ".join(str(line.text) for line in lines).strip()
    candidates = [
        (parse_temperature_cell_value(str(line.text)), float(line.confidence), str(line.text))
        for line in lines
    ]
    candidates = [(value, confidence, text) for value, confidence, text in candidates if value is not None]
    if not candidates and raw_text:
        candidates = [(parse_temperature_cell_value(raw_text), max((float(line.confidence) for line in lines), default=0.0), raw_text)]
        candidates = [(value, confidence, text) for value, confidence, text in candidates if value is not None]
    value, confidence, selected_text = max(candidates, key=lambda item: item[1]) if candidates else (None, 0.0, "")
    status = "ok"
    message = None
    if value is None:
        status = "degraded"
        message = "ocr_temperature_numeric_value_not_found"
    elif confidence < min_confidence:
        status = "degraded"
        message = "ocr_confidence_below_threshold"
    elif field.min_value is not None and value < field.min_value:
        status = "degraded"
        message = "ocr_value_below_min"
    elif field.max_value is not None and value > field.max_value:
        status = "degraded"
        message = "ocr_value_above_max"

    return FieldReading(
        field=field,
        value=None if value is None else round(value, field.decimal_places or 0),
        confidence=confidence,
        raw_text=selected_text or raw_text,
        status=status,
        raw_position=None,
        message=message,
    )


def parse_temperature_cell_value(text: str) -> float | None:
    stripped = text.strip()
    if stripped.upper() in {"1BE", "18E"}:
        return 188.0
    normalized = []
    replacements = {
        "A": "2",
        "a": "2",
        "B": "8",
        "b": "8",
        "D": "0",
        "d": "0",
        "I": "1",
        "i": "1",
        "L": "1",
        "l": "1",
        "O": "0",
        "o": "0",
        "Q": "0",
        "q": "0",
        "S": "5",
        "s": "5",
        "V": "5",
        "v": "5",
        "Z": "2",
        "z": "2",
        "|": "1",
    }
    for char in text:
        normalized.append(replacements.get(char, char))
    candidates = re.findall(r"\d+", "".join(normalized))
    if not candidates:
        return None
    if len(candidates) > 1:
        return None
    digits = max(candidates, key=len)
    if len(digits) > 3:
        if len(digits) == 4 and stripped.upper().endswith("E"):
            return float(int(digits[:3]))
        return None
    return float(int(digits))


def temperature_min_confidence(configured_min_confidence: float) -> float:
    return min(configured_min_confidence, 0.45)


def _temperature_min_value(slot_id: str) -> float:
    if slot_id == "oilTemperature":
        return 20.0
    return 50.0


def preprocess_for_temperature_cell(image: np.ndarray) -> np.ndarray:
    enlarged = cv2.resize(image, None, fx=6.0, fy=6.0, interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(enlarged, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(4, 4))
    enhanced = clahe.apply(gray)
    _threshold, binary = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    # Most HC600 values are white digits on a dark LCD box. Invert them to
    # black digits on white because OCR models are more stable on that polarity.
    if float(binary.mean()) < 127.0:
        binary = cv2.bitwise_not(binary)
    binary = cv2.copyMakeBorder(binary, 12, 12, 16, 16, cv2.BORDER_CONSTANT, value=255)
    return cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR)


def apply_temperature_grid_readings(structured_fields: dict[str, Any], readings: list[FieldReading]) -> None:
    screen = structured_fields.setdefault("screen", {})
    if screen.get("kind") != "temperature_monitor":
        return

    rows = screen.setdefault("temperatureRows", {})
    details: dict[str, dict[str, Any]] = {}
    for reading in readings:
        parsed = _parse_temperature_field_id(reading.field.id)
        if parsed is None:
            continue
        row_id, slot_id = parsed
        rows.setdefault(row_id, {})[slot_id] = reading.value if reading.status == "ok" else "unknown"
        details.setdefault(row_id, {})[slot_id] = {
            "label": reading.field.label,
            "value": reading.value if reading.status == "ok" else "unknown",
            "unit": reading.field.unit,
            "status": reading.status,
            "confidence": round(float(reading.confidence), 3),
            "rawText": reading.raw_text,
            "message": reading.message,
            "roi": list(reading.field.roi),
        }
    screen["temperatureCellReadings"] = details


def stabilize_temperature_readings(
    readings: list[FieldReading],
    history: TemperatureHistory,
    *,
    window: int = 4,
    required_matches: int = 2,
) -> list[FieldReading]:
    stabilized = []
    for reading in readings:
        if reading.status == "ok" and reading.value is not None:
            values = history.setdefault(reading.field.id, [])
            values.append((float(reading.value), float(reading.confidence), reading.raw_text))
            del values[:-window]

        stable = _stable_value(history.get(reading.field.id, []), required_matches=required_matches)
        if stable is None:
            if reading.status == "ok":
                stabilized.append(
                    FieldReading(
                        field=reading.field,
                        value=reading.value,
                        confidence=reading.confidence,
                        raw_text=reading.raw_text,
                        status="degraded",
                        raw_position=reading.raw_position,
                        message="temperature_consensus_pending",
                    )
                )
            else:
                stabilized.append(reading)
            continue

        value, confidence, raw_text = stable
        stabilized.append(
            FieldReading(
                field=reading.field,
                value=value,
                confidence=confidence,
                raw_text=raw_text,
                status="ok",
                raw_position=reading.raw_position,
                message=None,
            )
        )
    return stabilized


def _parse_temperature_field_id(field_id: str) -> tuple[str, str] | None:
    prefix = "hc600_temperature_"
    if not field_id.startswith(prefix):
        return None
    suffix = field_id[len(prefix):]
    for row_id, _row_label in TEMPERATURE_ROWS:
        row_prefix = f"{row_id}_"
        if suffix.startswith(row_prefix):
            slot_id = suffix[len(row_prefix):]
            return row_id, slot_id
    return None


def _stable_value(
    values: list[tuple[float, float, str]],
    *,
    required_matches: int,
) -> tuple[float, float, str] | None:
    if not values:
        return None
    rounded = [int(round(value)) for value, _confidence, _raw_text in values]
    value, count = Counter(rounded).most_common(1)[0]
    if count < required_matches:
        return None
    matched = [(candidate, confidence, raw_text) for candidate, confidence, raw_text in values if int(round(candidate)) == value]
    confidence = max(confidence for _candidate, confidence, _raw_text in matched)
    raw_text = " | ".join(raw_text for _candidate, _confidence, raw_text in matched[-required_matches:])
    return float(value), confidence, raw_text
