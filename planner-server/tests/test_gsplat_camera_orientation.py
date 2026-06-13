from __future__ import annotations

import sys
import types

import pytest

np = pytest.importorskip("numpy")

from scripts.industrial_engine.render_spz_with_gsplat import (  # noqa: E402
    SH_C0,
    WORLDLABS_SPZ_WORLD_UP,
    _camera_basis_from_yaw_pitch,
    _load_spz,
)


def test_worldlabs_spz_camera_basis_uses_negative_y_as_world_up() -> None:
    rotation, forward = _camera_basis_from_yaw_pitch(0.0, 0.0)

    np.testing.assert_allclose(WORLDLABS_SPZ_WORLD_UP, np.array([0.0, -1.0, 0.0], dtype=np.float32))
    np.testing.assert_allclose(forward, np.array([0.0, 0.0, 1.0], dtype=np.float32), atol=1e-6)
    np.testing.assert_allclose(rotation[:, 0], np.array([1.0, 0.0, 0.0], dtype=np.float32), atol=1e-6)
    np.testing.assert_allclose(rotation[:, 1], np.array([0.0, 1.0, 0.0], dtype=np.float32), atol=1e-6)


def test_load_spz_falls_back_to_niantic_spz(monkeypatch, tmp_path) -> None:
    class FakeCloud:
        positions = np.array([[1.0, 2.0, 3.0]], dtype=np.float32)
        scales = np.array([[0.1, 0.2, 0.3]], dtype=np.float32)
        rotations = np.array([[1.0, 0.0, 0.0, 0.0]], dtype=np.float32)
        alphas = np.array([0.75], dtype=np.float32)
        colors = np.array([[0.2, 0.3, 0.4]], dtype=np.float32)

    fake_spz = types.SimpleNamespace(load_spz=lambda path: FakeCloud())
    monkeypatch.setitem(sys.modules, "spz", fake_spz)
    monkeypatch.delitem(sys.modules, "gsply", raising=False)

    data = _load_spz(tmp_path / "world.spz")

    np.testing.assert_allclose(data.means, FakeCloud.positions)
    np.testing.assert_allclose(data.scales, FakeCloud.scales)
    np.testing.assert_allclose(data.quats, FakeCloud.rotations)
    np.testing.assert_allclose(data.opacities, FakeCloud.alphas)
    np.testing.assert_allclose(data.sh0, FakeCloud.colors)


def test_load_spz_reshapes_and_denormalizes_flat_niantic_arrays(monkeypatch, tmp_path) -> None:
    target_scales = np.array([[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]], dtype=np.float32)
    alpha_logits = np.array([-1.0, 1.0], dtype=np.float32)
    raw_colors = np.array([[-1.0, 0.0, 1.0], [2.0, -2.0, 0.5]], dtype=np.float32)

    class FakeCloud:
        positions = np.array([1.0, 2.0, 3.0, 4.0, 5.0, 6.0], dtype=np.float32)
        scales = np.log(target_scales).reshape(-1)
        rotations = np.array([2.0, 0.0, 0.0, 0.0, 0.0, 3.0, 0.0, 0.0], dtype=np.float32)
        alphas = alpha_logits
        colors = raw_colors.reshape(-1)

    fake_spz = types.SimpleNamespace(load_spz=lambda path: FakeCloud())
    monkeypatch.setitem(sys.modules, "spz", fake_spz)
    monkeypatch.delitem(sys.modules, "gsply", raising=False)

    data = _load_spz(tmp_path / "world.spz")

    np.testing.assert_allclose(data.means, FakeCloud.positions.reshape(2, 3))
    np.testing.assert_allclose(data.scales, target_scales, rtol=1e-6)
    np.testing.assert_allclose(data.quats, np.array([[1.0, 0.0, 0.0, 0.0], [0.0, 1.0, 0.0, 0.0]], dtype=np.float32))
    np.testing.assert_allclose(data.opacities, 1.0 / (1.0 + np.exp(-alpha_logits)), rtol=1e-6)
    np.testing.assert_allclose(data.sh0, np.clip(raw_colors * SH_C0 + 0.5, 0.0, 1.0), rtol=1e-6)
