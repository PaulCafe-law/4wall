from __future__ import annotations

import unicodedata
from dataclasses import dataclass
from typing import Any, Literal

from .ocr_engine import OcrTextLine
from .roi import FieldReading, parse_numeric_value


HmiMode = Literal["temperature_monitor", "machine_monitor", "unknown"]

TEMPERATURE_KEYWORDS = (
    "設定中",
    "设定中",
    "權定中",
    "权定中",
    "股定中",
    "设正",
    "溫度",
    "温度",
    "設定",
    "设定",
    "現在",
    "现在",
    "加熱",
    "加热",
    "保溫",
    "保温",
    "℃",
    "°C",
    "溫度",
    "温度",
    "設定",
    "現在",
    "加熱",
    "保溫",
    "保温",
    "油溫",
    "油温",
    "高溫",
    "低溫",
    "TEMP",
)

MACHINE_KEYWORDS = (
    "機器監視",
    "机器监视",
    "模號",
    "型号",
    "上模",
    "站號",
    "站号",
    "壓力",
    "压力",
    "射出",
    "射膠",
    "射胶",
    "操作",
    "手動",
    "手动",
    "停止",
    "計時",
    "计时",
    "Bar",
)


@dataclass(frozen=True)
class ModeResult:
    mode: HmiMode
    confidence: float
    matched_keywords: list[str]


def classify_hmi_mode(lines: list[OcrTextLine]) -> ModeResult:
    text = normalize_text(" ".join(line.text for line in lines))
    temperature_matches = _matched_keywords(text, TEMPERATURE_KEYWORDS)
    machine_matches = _matched_keywords(text, MACHINE_KEYWORDS)
    if not temperature_matches and not machine_matches:
        return ModeResult(mode="unknown", confidence=0.0, matched_keywords=[])
    if len(machine_matches) > len(temperature_matches):
        return ModeResult(
            mode="machine_monitor",
            confidence=_confidence(len(machine_matches), len(temperature_matches)),
            matched_keywords=machine_matches,
        )
    return ModeResult(
        mode="temperature_monitor",
        confidence=_confidence(len(temperature_matches), len(machine_matches)),
        matched_keywords=temperature_matches,
    )


def build_structured_fields(
    *,
    mode_result: ModeResult,
    hmi_lines: list[OcrTextLine],
    field_readings: list[FieldReading],
    min_confidence: float,
) -> dict[str, Any]:
    return {
        "mode": mode_result.mode,
        "modeConfidence": round(mode_result.confidence, 3),
        "matchedKeywords": mode_result.matched_keywords,
        "fixedFields": {
            reading.field.id: _field_reading_payload(reading)
            for reading in field_readings
        },
        "numericCandidates": _numeric_candidates(hmi_lines, min_confidence=min_confidence),
        "screen": _screen_schema(mode_result.mode),
    }


def raw_ocr_lines_payload(lines: list[OcrTextLine], *, region: str) -> list[dict[str, Any]]:
    return [
        {
            "text": line.text,
            "confidence": round(float(line.confidence), 3),
            "box": line.box,
            "region": region,
        }
        for line in lines
    ]


def raw_text(lines: list[OcrTextLine]) -> str:
    return " ".join(line.text.strip() for line in lines if line.text.strip())


def normalize_text(text: str) -> str:
    return unicodedata.normalize("NFKC", text).replace(" ", "")


def _matched_keywords(text: str, keywords: tuple[str, ...]) -> list[str]:
    return [keyword for keyword in keywords if normalize_text(keyword) in text]


def _confidence(primary_hits: int, secondary_hits: int) -> float:
    if primary_hits <= 0:
        return 0.0
    margin = max(0, primary_hits - secondary_hits)
    return min(1.0, 0.45 + primary_hits * 0.12 + margin * 0.08)


def _field_reading_payload(reading: FieldReading) -> dict[str, Any]:
    return {
        "label": reading.field.label,
        "value": reading.value if reading.status == "ok" else "unknown",
        "unit": reading.field.unit,
        "confidence": round(float(reading.confidence), 3),
        "status": reading.status,
        "rawText": reading.raw_text,
        "message": reading.message,
        "roi": list(reading.field.roi),
    }


def _numeric_candidates(lines: list[OcrTextLine], *, min_confidence: float) -> list[dict[str, Any]]:
    candidates = []
    for line in lines:
        if line.confidence < min_confidence:
            continue
        value = parse_numeric_value(line.text)
        if value is None:
            continue
        candidates.append(
            {
                "text": line.text,
                "value": value,
                "confidence": round(float(line.confidence), 3),
                "box": line.box,
            }
        )
    return candidates[:80]


def _screen_schema(mode: HmiMode) -> dict[str, Any]:
    if mode == "temperature_monitor":
        return {
            "kind": "temperature_monitor",
            "temperatureRows": {
                "setpoint": _temperature_slots(),
                "current": _temperature_slots(),
                "keepWarm": _temperature_slots(),
            },
            "settings": {
                "highDeviation": "unknown",
                "lowDeviation": "unknown",
                "coldStartProtectionDelay": "unknown",
                "nozzleOverTemperatureOutput": "unknown",
            },
            "schedule": "unknown",
        }
    if mode == "machine_monitor":
        return {
            "kind": "machine_monitor",
            "machineModel": "unknown",
            "operationMode": "unknown",
            "shotStage": "unknown",
            "station": "unknown",
            "pressureBar": "unknown",
            "speedPercent": "unknown",
            "timerSec": "unknown",
            "positions": {
                "mold": "unknown",
                "screw": "unknown",
                "ejector": "unknown",
            },
        }
    return {"kind": "unknown"}


def _temperature_slots() -> dict[str, str]:
    return {
        "barrel1": "unknown",
        "barrel2": "unknown",
        "barrel3": "unknown",
        "barrel4": "unknown",
        "barrel5": "unknown",
        "oilTemperature": "unknown",
    }
