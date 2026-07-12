from __future__ import annotations

import numpy as np

from ocr_worker.roi import (
    crop_roi,
    detect_screen_visibility,
    frame_size_warnings,
    is_fractional_roi,
    lines_inside_roi,
    nominal_roi_size,
    raw_position_for,
    resolve_roi,
)
from ocr_worker.config import HmiFieldConfig
from ocr_worker.ocr_engine import OcrTextLine


def test_resolve_roi_is_identity_at_reference_resolution() -> None:
    assert resolve_roi((925, 550, 450, 325), (2560, 1440), (2560, 1440)) == (925, 550, 450, 325)


def test_resolve_roi_scales_pixels_from_reference_to_actual_frame() -> None:
    # 2560x1440 baseline ROIs on the 2880x1620 main stream (1.125x).
    assert resolve_roi((925, 550, 450, 325), (2880, 1620), (2560, 1440)) == (1041, 619, 506, 366)
    assert resolve_roi((900, 120, 550, 335), (2880, 1620), (2560, 1440)) == (1013, 135, 619, 377)


def test_resolve_roi_without_reference_uses_pixels_as_is() -> None:
    assert resolve_roi((925, 550, 450, 325), (2880, 1620)) == (925, 550, 450, 325)


def test_resolve_roi_fractional_scales_with_actual_frame() -> None:
    assert resolve_roi((0.25, 0.5, 0.5, 0.25), (2880, 1620), (2560, 1440)) == (720, 810, 1440, 405)
    assert resolve_roi((0.25, 0.5, 0.5, 0.25), (2560, 1440)) == (640, 720, 1280, 360)


def test_resolve_roi_keeps_whole_frame_sentinel_unscaled() -> None:
    assert resolve_roi((0, 0, 0, 0), (2880, 1620), (2560, 1440)) == (0, 0, 0, 0)


def test_is_fractional_roi() -> None:
    assert is_fractional_roi((0.1, 0.2, 0.3, 0.4))
    assert not is_fractional_roi((0, 0, 0, 0))
    assert not is_fractional_roi((925, 550, 450, 325))


def test_nominal_roi_size() -> None:
    assert nominal_roi_size((925, 550, 450, 325), (2560, 1440)) == (450, 325)
    assert nominal_roi_size((925, 550, 450, 325), None) == (450, 325)
    assert nominal_roi_size((0, 0, 0, 0), (2560, 1440)) == (2560, 1440)
    assert nominal_roi_size((0.25, 0.5, 0.5, 0.25), (2560, 1440)) == (1280, 360)
    assert nominal_roi_size((0.25, 0.5, 0.5, 0.25), None) is None


def test_frame_size_warnings_reports_change_between_polls() -> None:
    assert frame_size_warnings((2880, 1620), (2880, 1620), (2560, 1440)) == []
    changed = frame_size_warnings((2560, 1440), (2880, 1620), (2560, 1440))
    assert changed[0]["warning"] == "frame_resolution_changed"
    assert changed[0]["previousResolution"] == [2560, 1440]
    assert changed[0]["currentResolution"] == [2880, 1620]


def test_frame_size_warnings_reports_first_frame_reference_mismatch() -> None:
    first = frame_size_warnings(None, (2880, 1620), (2560, 1440))
    assert first[0]["warning"] == "frame_resolution_differs_from_reference"
    assert frame_size_warnings(None, (2560, 1440), (2560, 1440)) == []
    assert frame_size_warnings(None, (2880, 1620), None) == []


def test_crop_roi_zero_size_returns_whole_image_copy() -> None:
    image = np.zeros((20, 30, 3), dtype=np.uint8)
    crop = crop_roi(image, (0, 0, 0, 0))
    assert crop.shape == image.shape
    assert crop is not image


def test_crop_roi_clips_to_image_bounds() -> None:
    image = np.zeros((20, 30, 3), dtype=np.uint8)
    crop = crop_roi(image, (25, 15, 20, 20))
    assert crop.shape == (5, 5, 3)


def test_raw_position_clamps_range() -> None:
    field = HmiFieldConfig(
        id="field",
        label="Field",
        unit="",
        roi=(0, 0, 1, 1),
        min_value=0,
        max_value=10,
        decimal_places=1,
    )
    assert raw_position_for(field, 5) == 0.5
    assert raw_position_for(field, 15) == 1.0


def test_lines_inside_roi_uses_box_center() -> None:
    lines = [
        OcrTextLine("inside", 0.9, box=[[10, 10], [20, 10], [20, 20], [10, 20]]),
        OcrTextLine("outside", 0.9, box=[[100, 100], [110, 100], [110, 110], [100, 110]]),
        OcrTextLine("unboxed", 0.9, box=None),
    ]
    matched = lines_inside_roi(lines, (0, 0, 30, 30))
    assert [line.text for line in matched] == ["inside"]


def test_detect_screen_visibility_distinguishes_dark_and_lit_lcd() -> None:
    dark = np.zeros((325, 450, 3), dtype=np.uint8)
    dark[:, :] = 25
    lit = dark.copy()
    lit[45:245, 35:330] = 210

    assert detect_screen_visibility(dark).status == "dark"
    lit_result = detect_screen_visibility(lit)
    assert lit_result.status == "lit"
    assert lit_result.confidence > 0.5


def test_detect_screen_visibility_marks_blown_out_lcd_as_overexposed() -> None:
    overexposed = np.full((325, 450, 3), 255, dtype=np.uint8)

    result = detect_screen_visibility(overexposed)

    assert result.status == "overexposed"
    assert result.mean_luma == 255.0
