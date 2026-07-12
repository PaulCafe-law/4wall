from __future__ import annotations

from copy import deepcopy
from dataclasses import replace
from datetime import datetime, timezone
from email.message import Message
from pathlib import Path

import cv2
import numpy as np
import pytest

from ocr_worker.config import load_config
from ocr_worker.frame_source import CapturedFrame, FrameSourceError, fetch_frame_url
from ocr_worker.main import HmiOcrRunner, _live_log_summary
from ocr_worker.ocr_engine import OcrTextLine
from ocr_worker.work_order import stabilize_work_order


class _UrlResponse:
    def __init__(self, body: bytes, headers: dict[str, str]):
        self.body = body
        self.headers = Message()
        for key, value in headers.items():
            self.headers[key] = value

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return self.body


def _jpeg() -> bytes:
    ok, encoded = cv2.imencode(".jpg", np.zeros((10, 12, 3), dtype=np.uint8))
    assert ok
    return encoded.tobytes()


def test_url_frame_retains_required_frame_evidence(monkeypatch) -> None:
    response = _UrlResponse(
        _jpeg(),
        {
            "X-Camera-Frame-Id": "frame-live-123",
            "X-Camera-Captured-At": "2026-07-12T09:10:11Z",
        },
    )
    monkeypatch.setattr("ocr_worker.frame_source.urlopen", lambda *_args, **_kwargs: response)

    captured = fetch_frame_url("https://camera.example/frame")

    assert captured.frame_id == "frame-live-123"
    assert captured.captured_at == "2026-07-12T09:10:11+00:00"
    assert captured.image.shape[:2] == (10, 12)


@pytest.mark.parametrize(
    "headers",
    [
        {"X-Camera-Captured-At": "2026-07-12T09:10:11Z"},
        {"X-Camera-Frame-Id": "frame-live-123"},
        {"X-Camera-Frame-Id": "../bad", "X-Camera-Captured-At": "2026-07-12T09:10:11Z"},
        {"X-Camera-Frame-Id": "frame-live-123", "X-Camera-Captured-At": "not-a-time"},
    ],
)
def test_url_frame_rejects_missing_or_invalid_evidence(monkeypatch, headers) -> None:
    monkeypatch.setattr(
        "ocr_worker.frame_source.urlopen", lambda *_args, **_kwargs: _UrlResponse(_jpeg(), headers)
    )

    with pytest.raises(FrameSourceError):
        fetch_frame_url("https://camera.example/frame")


class _WorkOrderEngine:
    def recognize(self, image):
        if image.shape[:2] != (80, 80):
            return []
        return [
            OcrTextLine("HC600", 0.95, [[2, 2], [22, 2], [22, 10], [2, 10]]),
            OcrTextLine("總計", 0.9, [[2, 30], [12, 30], [12, 38], [2, 38]]),
            OcrTextLine("L", 0.99, [[15, 30], [20, 30], [20, 38], [15, 38]]),
            OcrTextLine("5", 0.95, [[28, 30], [34, 30], [34, 38], [28, 38]]),
            OcrTextLine("R", 0.99, [[45, 30], [50, 30], [50, 38], [45, 38]]),
            OcrTextLine("5", 0.95, [[62, 30], [68, 30], [68, 38], [62, 38]]),
        ]


def _runner_config(tmp_path: Path):
    path = tmp_path / "config.yaml"
    path.write_text(
        "\n".join(
            [
                "reference_resolution: [100, 100]",
                "frame_source:",
                "  mode: file",
                "  path: unused.jpg",
                "platform:",
                "  enabled: false",
                "ocr:",
                "  engine: paddle",
                "  device: cpu",
                "hmi:",
                "  camera_label: HC600",
                "  detector_name: test",
                "  roi: [10, 50, 20, 20]",
                "  fields: []",
                "work_order:",
                "  enabled: true",
                "  roi: [40, 5, 20, 20]",
                "gpt:",
                "  enabled: false",
                "debug:",
                "  runtime_dir: runtime",
                "  save_crops: false",
            ]
        ),
        encoding="utf-8",
    )
    return load_config(path)


def test_observation_carries_source_time_frame_and_actual_pixel_regions(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("HMI_OCR_CALIBRATION_ID", "jingcheng-hc600-20260712-v2")
    runner = HmiOcrRunner(_runner_config(tmp_path), publish=False, engine=_WorkOrderEngine())
    result = runner.process_frame(
        np.zeros((200, 200, 3), dtype=np.uint8),
        frame_name="live",
        frame_id="frame-exact",
        captured_at="2026-07-12T09:10:11+00:00",
    )["ocrObservation"]

    assert result["frameId"] == "frame-exact"
    assert result["capturedAt"] == "2026-07-12T09:10:11+00:00"
    regions = result["structuredFields"]["captureRegions"]
    assert regions["calibrationId"] == "jingcheng-hc600-20260712-v2"
    assert regions["frameSize"] == [200, 200]
    assert regions["hmi"]["roi"] == [20, 100, 40, 40]
    assert regions["workOrder"] == {"roi": [80, 10, 40, 40], "alignmentStatus": "ok"}


def test_live_processing_requires_explicit_calibration_id(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.delenv("HMI_OCR_CALIBRATION_ID", raising=False)
    config = _runner_config(tmp_path)
    config = replace(config, frame_source=replace(config.frame_source, mode="url", url="https://example.test/frame"))
    runner = HmiOcrRunner(config, publish=False, engine=_WorkOrderEngine())

    with pytest.raises(FrameSourceError, match="missing HMI_OCR_CALIBRATION_ID"):
        runner.process_frame(
            np.zeros((200, 200, 3), dtype=np.uint8),
            frame_name="live",
            frame_id="frame-exact",
            captured_at="2026-07-12T09:10:11+00:00",
        )


def test_live_runner_skips_duplicate_frame_ids(tmp_path: Path, monkeypatch) -> None:
    runner = HmiOcrRunner(_runner_config(tmp_path), publish=False, engine=_WorkOrderEngine())
    captured = CapturedFrame(
        image=np.zeros((20, 20, 3), dtype=np.uint8),
        frame_id="same-frame",
        captured_at="2026-07-12T09:10:11+00:00",
    )
    monkeypatch.setattr("ocr_worker.main.capture_configured_frame", lambda *_args: captured)
    processed: list[str] = []
    monkeypatch.setattr(
        runner,
        "process_frame",
        lambda _image, **kwargs: processed.append(kwargs["frame_id"]) or {"processed": True},
    )

    runner.run_live(once=True)
    runner.run_live(once=True)

    assert processed == ["same-frame"]


def _sheet(*, aligned: bool, value: str = "HC600") -> dict:
    leaf = lambda item: {"value": item, "confidence": 0.9, "rawText": str(item)}
    return {
        "alignmentStatus": "ok" if aligned else "invalid",
        "currentEvidence": aligned,
        "fields": {"machineNo": leaf(value if aligned else "unknown")},
        "quantities": {"total": {"left": leaf(10 if aligned else "unknown"), "right": leaf("unknown")}},
    }


def test_alignment_failure_hides_locks_clears_after_three_and_requires_two_to_reacquire() -> None:
    history: dict = {}
    stabilize_work_order(deepcopy(_sheet(aligned=True)), history)
    locked = stabilize_work_order(deepcopy(_sheet(aligned=True)), history)
    assert locked["fields"]["machineNo"]["value"] == "HC600"

    for failure in range(1, 4):
        invalid = stabilize_work_order(deepcopy(_sheet(aligned=False)), history)
        assert invalid["fields"]["machineNo"]["value"] == "unknown"
        assert invalid["alignmentFailureStreak"] == failure

    first_valid = stabilize_work_order(deepcopy(_sheet(aligned=True)), history)
    assert first_valid["fields"]["machineNo"]["value"] == "unknown"
    second_valid = stabilize_work_order(deepcopy(_sheet(aligned=True)), history)
    assert second_valid["fields"]["machineNo"]["value"] == "HC600"


def test_current_frame_without_value_never_republishes_historical_lock() -> None:
    history: dict = {}
    stabilize_work_order(deepcopy(_sheet(aligned=True)), history)
    stabilize_work_order(deepcopy(_sheet(aligned=True)), history)
    current = _sheet(aligned=True)
    current["quantities"]["total"]["left"] = {"value": "unknown", "confidence": 0.0, "rawText": ""}

    result = stabilize_work_order(current, history)

    assert result["quantities"]["total"]["left"]["value"] == "unknown"
    assert "held" not in result["quantities"]["total"]["left"]


def test_live_log_summary_never_contains_raw_ocr_or_work_order_values() -> None:
    summary = _live_log_summary(
        {
            "readings": [{"value": 999}],
            "ocrObservation": {
                "frameId": "frame-1",
                "capturedAt": "2026-07-12T09:10:11Z",
                "mode": "machine_monitor",
                "rawOcrLines": [{"text": "secret production text"}],
                "structuredFields": {
                    "workOrder": {"alignmentStatus": "ok", "fields": {"machineNo": {"value": "HC600"}}}
                },
            },
        }
    )

    assert summary["readingCount"] == 1
    assert summary["rawOcrLineCount"] == 1
    assert "rawOcrLines" not in summary
    assert "HC600" not in str(summary)
