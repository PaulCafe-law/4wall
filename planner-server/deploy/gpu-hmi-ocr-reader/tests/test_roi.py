from __future__ import annotations

import numpy as np

from ocr_worker.roi import crop_roi, detect_screen_visibility, raw_position_for
from ocr_worker.config import HmiFieldConfig
from ocr_worker.ocr_engine import OcrTextLine
from ocr_worker.roi import lines_inside_roi


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
