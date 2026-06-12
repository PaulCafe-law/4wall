from __future__ import annotations

import pytest

np = pytest.importorskip("numpy")

from scripts.industrial_engine.render_spz_with_gsplat import (  # noqa: E402
    WORLDLABS_SPZ_WORLD_UP,
    _camera_basis_from_yaw_pitch,
)


def test_worldlabs_spz_camera_basis_uses_negative_y_as_world_up() -> None:
    rotation, forward = _camera_basis_from_yaw_pitch(0.0, 0.0)

    np.testing.assert_allclose(WORLDLABS_SPZ_WORLD_UP, np.array([0.0, -1.0, 0.0], dtype=np.float32))
    np.testing.assert_allclose(forward, np.array([0.0, 0.0, 1.0], dtype=np.float32), atol=1e-6)
    np.testing.assert_allclose(rotation[:, 0], np.array([1.0, 0.0, 0.0], dtype=np.float32), atol=1e-6)
    np.testing.assert_allclose(rotation[:, 1], np.array([0.0, 1.0, 0.0], dtype=np.float32), atol=1e-6)
