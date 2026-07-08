from __future__ import annotations

import sys
import types

import numpy as np
import pytest

from presence_worker.config import DetectorConfig
from presence_worker.detector import Detection, build_detector


class _FakeHog:
    """Stand-in for cv2.HOGDescriptor with scripted detections."""

    scripted: list = []

    def setSVMDetector(self, _detector) -> None:  # noqa: N802 - mirrors cv2 API
        pass

    def detectMultiScale(self, _image, **_kwargs):  # noqa: N802 - mirrors cv2 API
        rects = np.array([r for r, _w in _FakeHog.scripted], dtype=int)
        weights = np.array([w for _r, w in _FakeHog.scripted], dtype=float)
        return rects, weights


def _install_fake_cv2(monkeypatch, scripted):
    _FakeHog.scripted = scripted
    fake_cv2 = types.SimpleNamespace(
        HOGDescriptor=lambda: _FakeHog(),
        HOGDescriptor_getDefaultPeopleDetector=lambda: object(),
    )
    monkeypatch.setitem(sys.modules, "cv2", fake_cv2)


def test_hog_backend_maps_xywh_and_confidence(monkeypatch):
    _install_fake_cv2(monkeypatch, [((10, 20, 30, 80), 1.25), ((100, 40, 25, 70), 0.0)])
    detector = build_detector(DetectorConfig(backend="hog"))
    detections = detector.detect(np.zeros((480, 640, 3), dtype=np.uint8))

    assert len(detections) == 2
    first = detections[0]
    assert isinstance(first, Detection)
    # HOG returns (x, y, w, h) which is exactly the platform bbox convention.
    assert first.bbox == (10.0, 20.0, 30.0, 80.0)
    assert first.label == "person"
    # 0.5 + 1.25 * 0.4 = 1.0 (clamped); weight 0.0 -> 0.5
    assert first.confidence == pytest.approx(1.0)
    assert detections[1].confidence == pytest.approx(0.5)


def test_hog_backend_empty_frame(monkeypatch):
    _install_fake_cv2(monkeypatch, [])
    detector = build_detector(DetectorConfig(backend="hog"))
    assert detector.detect(np.zeros((480, 640, 3), dtype=np.uint8)) == []
