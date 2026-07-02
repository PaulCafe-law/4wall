from __future__ import annotations

from reader.geometry import interpolate_value


def test_interpolate_value_projects_onto_calibrated_scale() -> None:
    scale = {
        0.0: (20.0, 50.0),
        2.0: (60.0, 50.0),
        4.0: (100.0, 50.0),
        6.0: (140.0, 50.0),
        8.0: (180.0, 50.0),
        10.0: (220.0, 50.0),
    }

    value, raw_position = interpolate_value((130.0, 62.0), scale)

    assert value == 5.5
    assert raw_position == 0.55
