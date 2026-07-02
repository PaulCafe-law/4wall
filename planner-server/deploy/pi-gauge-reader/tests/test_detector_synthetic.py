from __future__ import annotations

from pathlib import Path

import cv2

from reader.detector import ClassicalLinearMeterDetector
from reader.geometry import GaugeCalibration
from tools.make_synthetic_samples import make_meter


def _calibration() -> GaugeCalibration:
    return GaugeCalibration(
        roi=(0, 0, 400, 120),
        rect_corners=[(0, 0), (399, 0), (399, 119), (0, 119)],
        scale_points={
            0.0: (24, 72),
            2.0: (94, 72),
            4.0: (164, 72),
            6.0: (234, 72),
            8.0: (304, 72),
            10.0: (374, 72),
        },
        needle_search_band=(18, 20, 364, 82),
    )


def test_detector_reads_synthetic_linear_meter_values() -> None:
    detector = ClassicalLinearMeterDetector(min_crop_width_px=180)
    calibration = _calibration()

    for expected in [0, 2, 4, 6, 8, 10]:
        crop = make_meter(float(expected))
        result, _annotated = detector.detect(crop, calibration)

        assert result.status == "ok"
        assert result.value is not None
        assert abs(result.value - expected) <= 0.15
        assert result.confidence >= 0.6


def test_detector_marks_low_resolution_crop_degraded() -> None:
    detector = ClassicalLinearMeterDetector(min_crop_width_px=500)
    crop = make_meter(4.0)

    result, _annotated = detector.detect(crop, _calibration())

    assert result.status == "degraded"
    assert result.message == "meter_crop_too_small"
    assert result.confidence <= 0.6


def test_detector_writes_annotated_debug_image(tmp_path: Path) -> None:
    detector = ClassicalLinearMeterDetector(min_crop_width_px=180)
    result, annotated = detector.detect(make_meter(6.0), _calibration())
    output = tmp_path / "annotated.jpg"

    assert result.value is not None
    assert cv2.imwrite(str(output), annotated)
    assert output.stat().st_size > 0
