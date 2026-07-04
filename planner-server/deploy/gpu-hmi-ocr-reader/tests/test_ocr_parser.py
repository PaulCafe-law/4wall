from __future__ import annotations

from ocr_worker.config import HmiFieldConfig
from ocr_worker.ocr_engine import OcrTextLine, parse_paddle_result
from ocr_worker.roi import parse_numeric_value, read_field


def test_parse_numeric_value_handles_full_width_and_common_ocr_confusions() -> None:
    assert parse_numeric_value("Ｏ.５A") == 0.5
    assert parse_numeric_value("I23.4") == 123.4


def test_parse_old_paddle_result_shape() -> None:
    result = [[[[0, 0], [10, 0], [10, 10], [0, 10]], ("123.4", 0.92)]]
    lines = parse_paddle_result(result)
    assert len(lines) == 1
    assert lines[0].text == "123.4"
    assert lines[0].confidence == 0.92


def test_parse_new_paddle_result_shape() -> None:
    result = [{"rec_texts": ["56.7"], "rec_scores": [0.88], "dt_polys": [[[0, 0], [1, 0], [1, 1], [0, 1]]]}]
    lines = parse_paddle_result(result)
    assert len(lines) == 1
    assert lines[0].text == "56.7"
    assert lines[0].confidence == 0.88


def test_read_field_degrades_low_confidence() -> None:
    field = HmiFieldConfig(
        id="hc600_hmi_temperature",
        label="Temperature",
        unit="C",
        roi=(0, 0, 10, 10),
        min_value=0,
        max_value=300,
        decimal_places=1,
    )
    reading = read_field(field, [OcrTextLine("150.0", 0.4)], min_confidence=0.55)
    assert reading.value == 150.0
    assert reading.status == "degraded"
    assert reading.raw_position == 0.5
