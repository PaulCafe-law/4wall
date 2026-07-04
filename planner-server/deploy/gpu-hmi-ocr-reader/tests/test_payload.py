from __future__ import annotations

from ocr_worker.config import HmiFieldConfig
from ocr_worker.main import build_platform_reading
from ocr_worker.roi import FieldReading


def test_build_platform_reading_matches_camera_ingest_schema() -> None:
    field = HmiFieldConfig(
        id="hc600_hmi_temperature",
        label="HC600 HMI temperature",
        unit="C",
        roi=(10, 20, 30, 40),
        min_value=0,
        max_value=300,
        decimal_places=1,
    )
    payload = build_platform_reading(
        FieldReading(
            field=field,
            value=123.4,
            confidence=0.91,
            raw_text="123.4",
            status="ok",
            raw_position=0.4113333333,
        ),
        "2026-07-03T12:00:00+08:00",
        "paddleocr_ppocrv5_hmi",
    )
    assert payload == {
        "gaugeId": "hc600_hmi_temperature",
        "label": "HC600 HMI temperature",
        "value": 123.4,
        "unit": "C",
        "confidence": 0.91,
        "rawPosition": 0.41133,
        "status": "ok",
        "source": "live",
        "capturedAt": "2026-07-03T12:00:00+08:00",
        "metadata": {
            "detector": "paddleocr_ppocrv5_hmi",
            "ocrText": "123.4",
            "message": None,
            "roi": [10, 20, 30, 40],
        },
    }
