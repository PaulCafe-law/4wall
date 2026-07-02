from __future__ import annotations

from reader.config import GaugeConfig
from reader.detector import DetectionResult
from reader.main import _payload_for


def test_payload_schema_uses_live_source() -> None:
    gauge = GaugeConfig(
        id="press_am_meter",
        label="PRESS AM METER",
        unit="A",
        min_val=0,
        max_val=10,
        calibration_file="gauges.json",  # type: ignore[arg-type]
    )
    result = DetectionResult(
        value=6.25,
        confidence=0.93,
        raw_position=0.625,
        status="ok",
        message=None,
        needle_point=(120, 40),
        warped_width=400,
    )

    payload = _payload_for(gauge, result, 6.25, True)

    assert payload["value"] == 6.25
    assert payload["unit"] == "A"
    assert payload["confidence"] == 0.93
    assert payload["raw_position"] == 0.625
    assert payload["source"] == "live"
    assert payload["status"] == "ok"
    assert "ts" in payload
