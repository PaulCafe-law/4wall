from __future__ import annotations

import numpy as np
import pytest

from reader.capture import CaptureError, _ensure_valid_frame


def test_rejects_flat_gray_corrupt_frame() -> None:
    frame = np.full((120, 160, 3), 130, dtype=np.uint8)

    with pytest.raises(CaptureError, match="frame_low_detail"):
        _ensure_valid_frame(frame)


def test_accepts_detailed_frame() -> None:
    frame = np.zeros((120, 160, 3), dtype=np.uint8)
    frame[:, :80] = (20, 80, 180)
    frame[:, 80:] = (230, 230, 230)

    _ensure_valid_frame(frame)
