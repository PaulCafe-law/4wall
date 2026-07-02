from __future__ import annotations

import pytest

from reader.smoothing import GaugeSmoother


def test_smoother_rejects_low_confidence_large_jump() -> None:
    smoother = GaugeSmoother(min_val=0, max_val=10)

    value, accepted = smoother.update(2.0, 0.9)
    assert value == 2.0
    assert accepted is True

    value, accepted = smoother.update(8.0, 0.4)
    assert value == 2.0
    assert accepted is False


def test_smoother_outputs_median() -> None:
    smoother = GaugeSmoother(min_val=0, max_val=10)

    for value in [2.0, 2.4, 2.2]:
        smoother.update(value, 0.9)

    value, accepted = smoother.update(2.1, 0.9)
    assert accepted is True
    assert value == pytest.approx(2.15)
