from __future__ import annotations

import cv2
import numpy as np
import pytest

from presence_worker import frame_source


class FakeResponse:
    def __init__(self, data: bytes, headers: dict[str, str] | None = None) -> None:
        self._data = data
        self.headers = headers or {
            "X-Camera-Frame-Id": "frame-123",
            "X-Camera-Captured-At": "2026-07-04T10:00:00+08:00",
        }

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *args) -> None:
        return None

    def read(self) -> bytes:
        return self._data


def test_fetch_frame_url_reads_ingest_headers(monkeypatch) -> None:
    image = np.zeros((12, 16, 3), dtype=np.uint8)
    ok, encoded = cv2.imencode(".jpg", image)
    assert ok

    def fake_urlopen(request, timeout):
        assert request.headers["Authorization"] == "Bearer token"
        assert timeout == 7
        return FakeResponse(encoded.tobytes())

    monkeypatch.setattr(frame_source, "urlopen", fake_urlopen)

    frame = frame_source.fetch_frame_url(
        "https://api.example.test/v1/camera-ingest/latest-frame/image",
        headers={"Authorization": "Bearer token"},
        timeout_sec=7,
    )

    assert frame.frame_id == "frame-123"
    assert frame.captured_at == "2026-07-04T10:00:00+08:00"
    assert frame.image.shape[:2] == (12, 16)
    assert len(frame.content_sha256) == 64


@pytest.mark.parametrize(
    "headers",
    [
        {"X-Camera-Captured-At": "2026-07-04T10:00:00+08:00"},
        {"X-Camera-Frame-Id": "frame-123"},
        {"X-Camera-Frame-Id": "../bad", "X-Camera-Captured-At": "2026-07-04T10:00:00+08:00"},
        {"X-Camera-Frame-Id": "frame-123", "X-Camera-Captured-At": "not-a-time"},
    ],
)
def test_fetch_frame_url_requires_valid_live_evidence_headers(monkeypatch, headers: dict[str, str]) -> None:
    image = np.zeros((12, 16, 3), dtype=np.uint8)
    ok, encoded = cv2.imencode(".jpg", image)
    assert ok
    monkeypatch.setattr(
        frame_source,
        "urlopen",
        lambda *_args, **_kwargs: FakeResponse(encoded.tobytes(), headers=headers),
    )

    with pytest.raises(frame_source.FrameSourceError):
        frame_source.fetch_frame_url("https://api.example.test/frame")
