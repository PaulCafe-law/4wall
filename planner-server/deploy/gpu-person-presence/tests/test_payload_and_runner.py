from __future__ import annotations

import numpy as np

from presence_worker.config import AppConfig, DebugConfig, DetectorConfig, FrameSourceConfig, PlatformConfig, ProjectionConfig
from presence_worker.detector import Detection, FakeDetector
from presence_worker.frame_source import CapturedFrame
from presence_worker.main import PersonPresenceRunner, build_person_observation


def test_build_payload_includes_zero_person_frame(tmp_path) -> None:
    frame = _frame(frame_id="frame-empty")
    payload = build_person_observation(frame, [], _config(tmp_path))

    assert payload == {
        "source": "live",
        "capturedAt": "2026-07-04T10:00:00+08:00",
        "imageWidth": 320,
        "imageHeight": 240,
        "calibrationId": "cal-1",
        "detectorName": "fake-person",
        "detections": [],
        "frameId": "frame-empty",
    }


def test_build_payload_keeps_detection_when_projection_missing(tmp_path) -> None:
    config = _config(tmp_path, homography=None)
    payload = build_person_observation(_frame(), [Detection(bbox=(10, 20, 30, 80), confidence=0.87654)], config)

    assert payload["detections"] == [
        {
            "bbox": [10.0, 20.0, 30.0, 80.0],
            "confidence": 0.8765,
            "footPoint": [25.0, 100.0],
            "floorPosition": None,
        }
    ]


def test_runner_skips_same_frame_id(tmp_path) -> None:
    detector = FakeDetector([Detection(bbox=(10, 20, 30, 80), confidence=0.9)])
    runner = PersonPresenceRunner(_config(tmp_path), detector=detector, publish=False)

    first = runner.process_frame(_frame(frame_id="same-frame"))
    second = runner.process_frame(_frame(frame_id="same-frame"))

    assert first["skipped"] is False
    assert first["personObservation"]["detections"][0]["floorPosition"] == {"x": 15.0, "z": 50.0}
    assert second == {"skipped": True, "reason": "duplicate_frame", "frameId": "same-frame"}


def test_runner_queues_platform_failures_without_stopping(tmp_path) -> None:
    detector = FakeDetector([Detection(bbox=(10, 20, 30, 80), confidence=0.9)])
    config = _config(
        tmp_path,
        platform=PlatformConfig(enabled=True, api_base_url="", device_token="", retry_queue_size=2),
    )
    runner = PersonPresenceRunner(config, detector=detector, publish=True)

    result = runner.process_frame(_frame(frame_id="will-queue"))

    assert result["skipped"] is False
    assert result["platformQueuedCount"] == 1
    assert runner.platform_sink.state.last_error == "platform_sink_missing_api_url_or_device_token"


def test_runner_does_not_publish_empty_observation(tmp_path) -> None:
    # 空幀(0 人)不應上報:否則前端最新觀測會在「有人/沒人」之間反覆翻轉,造成標記閃爍。
    detector = FakeDetector([])
    config = _config(
        tmp_path,
        platform=PlatformConfig(enabled=True, api_base_url="", device_token="", retry_queue_size=2),
    )
    runner = PersonPresenceRunner(config, detector=detector, publish=True)

    result = runner.process_frame(_frame(frame_id="empty-frame"))

    assert result["skipped"] is False
    assert result["rawDetectionCount"] == 0
    assert result["personObservation"]["detections"] == []
    # 沒有嘗試上報:佇列為空、無錯誤、送出計數為 0。
    assert result["platformQueuedCount"] == 0
    assert runner.platform_sink.state.last_error is None
    assert runner.platform_sink.state.submitted_count == 0


def _frame(frame_id: str = "frame-1") -> CapturedFrame:
    return CapturedFrame(
        image=np.zeros((240, 320, 3), dtype=np.uint8),
        frame_id=frame_id,
        captured_at="2026-07-04T10:00:00+08:00",
        content_sha256=f"{frame_id:0<64}"[:64],
    )


def _config(
    tmp_path,
    *,
    homography: list[list[float]] | None = [[1, 0, -10], [0, 0.5, 0], [0, 0, 1]],
    platform: PlatformConfig | None = None,
) -> AppConfig:
    return AppConfig(
        root_dir=tmp_path,
        frame_source=FrameSourceConfig(mode="file"),
        platform=platform or PlatformConfig(enabled=False),
        detector=DetectorConfig(
            backend="fake",
            detector_name="fake-person",
            confidence_threshold=0.5,
            min_bbox_height_px=40,
        ),
        projection=ProjectionConfig(calibration_id="cal-1", homography=homography),
        debug=DebugConfig(runtime_dir=tmp_path / "runtime"),
    )
