from __future__ import annotations

import numpy as np

from ocr_worker.config import HmiFieldConfig
from ocr_worker.hmi_temperature import (
    TEMPERATURE_CELL_ROIS,
    apply_temperature_grid_readings,
    parse_temperature_cell_value,
    read_temperature_field,
    read_temperature_grid,
    stabilize_temperature_readings,
)
from ocr_worker.ocr_engine import OcrTextLine
from ocr_worker.roi import FieldReading


class _EmptyEngine:
    def recognize(self, image):
        return []


def _grid_field_rois(crop_height: int, crop_width: int) -> dict[str, tuple[int, int, int, int]]:
    readings = read_temperature_grid(
        engine=_EmptyEngine(),
        hmi_crop=np.zeros((crop_height, crop_width, 3), dtype=np.uint8),
        hmi_lines=[],
        min_confidence=0.55,
    )
    return {reading.field.id: reading.field.roi for reading in readings}


def test_read_temperature_grid_keeps_reference_crop_rois_byte_identical() -> None:
    rois = _grid_field_rois(325, 450)
    assert rois["hc600_temperature_setpoint_barrel1"] == TEMPERATURE_CELL_ROIS["setpoint"]["barrel1"]
    assert rois["hc600_temperature_keepWarm_oilTemperature"] == TEMPERATURE_CELL_ROIS["keepWarm"]["oilTemperature"]


def test_read_temperature_grid_scales_cell_rois_to_actual_crop_size() -> None:
    # The 450x325 reference crop becomes 506x366 on the 2880x1620 main stream.
    rois = _grid_field_rois(366, 506)
    assert rois["hc600_temperature_setpoint_barrel1"] == (118, 142, 34, 19)
    assert rois["hc600_temperature_keepWarm_oilTemperature"] == (403, 190, 38, 19)


def test_parse_temperature_cell_value_handles_hc600_ocr_confusions() -> None:
    assert parse_temperature_cell_value("LB8") == 188
    assert parse_temperature_cell_value("1BE") == 188
    assert parse_temperature_cell_value("188E") == 188
    assert parse_temperature_cell_value("210E") == 210
    assert parse_temperature_cell_value("25V") == 255
    assert parse_temperature_cell_value("A80") == 280
    assert parse_temperature_cell_value("2DD") == 200
    assert parse_temperature_cell_value("2E5") is None
    assert parse_temperature_cell_value("31BL") is None


def test_apply_temperature_grid_readings_updates_temperature_rows() -> None:
    structured_fields = {
        "screen": {
            "kind": "temperature_monitor",
            "temperatureRows": {
                "setpoint": {"barrel1": "unknown"},
                "current": {"barrel1": "unknown"},
                "keepWarm": {"barrel1": "unknown"},
            },
        }
    }
    field = HmiFieldConfig(
        id="hc600_temperature_setpoint_barrel1",
        label="HC600 設定 一段",
        unit="C",
        roi=(96, 126, 42, 20),
        min_value=0,
        max_value=350,
        decimal_places=0,
    )

    apply_temperature_grid_readings(
        structured_fields,
        [
            FieldReading(
                field=field,
                value=212,
                confidence=0.91,
                raw_text="212",
                status="ok",
                raw_position=None,
            )
        ],
    )

    screen = structured_fields["screen"]
    assert screen["temperatureRows"]["setpoint"]["barrel1"] == 212
    assert screen["temperatureCellReadings"]["setpoint"]["barrel1"]["status"] == "ok"
    assert screen["temperatureCellReadings"]["setpoint"]["barrel1"]["rawText"] == "212"


def test_read_temperature_field_rejects_low_noise_value() -> None:
    field = HmiFieldConfig(
        id="hc600_temperature_current_barrel4",
        label="HC600 現在 四段",
        unit="C",
        roi=(239, 148, 32, 17),
        min_value=50,
        max_value=350,
        decimal_places=0,
    )

    reading = read_temperature_field(field, [OcrTextLine("5", 0.9)], min_confidence=0.55)

    assert reading.value == 5
    assert reading.status == "degraded"
    assert reading.message == "ocr_value_below_min"


def test_read_temperature_field_selects_best_line_candidate_instead_of_joining_noise() -> None:
    field = HmiFieldConfig(
        id="hc600_temperature_current_barrel2",
        label="HC600 current barrel2",
        unit="C",
        roi=(150, 148, 30, 17),
        min_value=50,
        max_value=350,
        decimal_places=0,
    )

    reading = read_temperature_field(
        field,
        [
            OcrTextLine("38Z", 0.69),
            OcrTextLine("280", 0.84),
        ],
        min_confidence=0.55,
    )

    assert reading.value == 280
    assert reading.status == "ok"
    assert reading.raw_text == "280"


def test_stabilize_temperature_readings_requires_repeated_value() -> None:
    field = HmiFieldConfig(
        id="hc600_temperature_keepWarm_barrel4",
        label="HC600 保溫 四段",
        unit="C",
        roi=(239, 169, 32, 17),
        min_value=50,
        max_value=350,
        decimal_places=0,
    )
    history = {}
    first = FieldReading(field=field, value=180, confidence=0.91, raw_text="180", status="ok", raw_position=None)
    second = FieldReading(field=field, value=180, confidence=0.88, raw_text="1B0", status="ok", raw_position=None)

    first_result = stabilize_temperature_readings([first], history)
    second_result = stabilize_temperature_readings([second], history)

    assert first_result[0].status == "degraded"
    assert first_result[0].message == "temperature_consensus_pending"
    assert second_result[0].status == "ok"
    assert second_result[0].value == 180
    assert second_result[0].raw_text == "1B0"


def test_temperature_consensus_never_fills_an_unreadable_current_frame() -> None:
    field = HmiFieldConfig(
        id="hc600_temperature_current_barrel1",
        label="HC600 現在 一段",
        unit="C",
        roi=(100, 148, 30, 17),
        min_value=50,
        max_value=350,
        decimal_places=0,
    )
    history = {}
    good = FieldReading(field=field, value=180, confidence=0.9, raw_text="180", status="ok", raw_position=None)
    stabilize_temperature_readings([good], history)
    stabilize_temperature_readings([good], history)

    unreadable = FieldReading(
        field=field,
        value=None,
        confidence=0.1,
        raw_text="",
        status="degraded",
        raw_position=None,
        message="ocr_numeric_value_not_found",
    )
    result = stabilize_temperature_readings([unreadable], history)[0]

    assert result.status == "degraded"
    assert result.value is None
    assert result.message == "ocr_numeric_value_not_found"


def test_apply_temperature_grid_readings_keeps_degraded_cells_unknown() -> None:
    structured_fields = {
        "screen": {
            "kind": "temperature_monitor",
            "temperatureRows": {"current": {"barrel2": "unknown"}},
        }
    }
    field = HmiFieldConfig(
        id="hc600_temperature_current_barrel2",
        label="HC600 現在 二段",
        unit="C",
        roi=(139, 148, 42, 20),
        min_value=0,
        max_value=350,
        decimal_places=0,
    )

    apply_temperature_grid_readings(
        structured_fields,
        [
            FieldReading(
                field=field,
                value=None,
                confidence=0.12,
                raw_text="",
                status="degraded",
                raw_position=None,
                message="ocr_numeric_value_not_found",
            )
        ],
    )

    screen = structured_fields["screen"]
    assert screen["temperatureRows"]["current"]["barrel2"] == "unknown"
    assert screen["temperatureCellReadings"]["current"]["barrel2"]["message"] == "ocr_numeric_value_not_found"
