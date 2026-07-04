from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import cv2

from .config import AppConfig, load_config
from .detector import Detection, PersonDetector, build_detector
from .frame_source import CapturedFrame, FrameSourceError, capture_configured_frame, load_frame_file
from .geometry import foot_point, project_point, valid_detection
from .publish import PlatformSink


TAIPEI = ZoneInfo("Asia/Taipei")


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    config = load_config(args.config)
    detector = build_detector(config.detector, fake=args.fake_detection)
    runner = PersonPresenceRunner(config, detector=detector, publish=args.publish and not args.dry_run)

    if args.input:
        frame = load_frame_file(Path(args.input))
        result = runner.process_frame(frame)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0

    runner.run_live(once=args.once)
    return 0


class PersonPresenceRunner:
    def __init__(self, config: AppConfig, *, detector: PersonDetector, publish: bool | None = None) -> None:
        self.config = config
        self.detector = detector
        self.publish_enabled = config.platform.enabled if publish is None else publish
        self.platform_sink = PlatformSink(config.platform)
        self._processed_keys: list[str] = []
        self.debug_dir = config.debug.runtime_dir / "frames"
        if config.debug.save_debug_frames:
            self.debug_dir.mkdir(parents=True, exist_ok=True)

    def run_live(self, *, once: bool = False) -> None:
        backoff_sec = 1.0
        while True:
            try:
                frame = capture_configured_frame(self.config.frame_source, self.config.root_dir)
                result = self.process_frame(frame)
                print(json.dumps({"status": "ok", **result}, ensure_ascii=False))
                self.platform_sink.flush_pending()
                backoff_sec = 1.0
            except FrameSourceError as exc:
                print(json.dumps({"status": "degraded", "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
                time.sleep(backoff_sec)
                backoff_sec = min(300.0, backoff_sec * 2)
                if once:
                    raise

            if once:
                break
            time.sleep(self.config.frame_source.interval_sec)

    def process_frame(self, frame: CapturedFrame) -> dict[str, Any]:
        key = _frame_key(frame)
        if key in self._processed_keys:
            return {"skipped": True, "reason": "duplicate_frame", "frameId": frame.frame_id}
        self._processed_keys.append(key)
        self._processed_keys = self._processed_keys[-100:]

        if self.config.debug.save_debug_frames:
            stamp = int(time.time())
            cv2.imwrite(str(self.debug_dir / f"{frame.frame_id or frame.content_sha256[:12]}-{stamp}.jpg"), frame.image)
            _trim_directory(self.debug_dir, self.config.debug.rolling_keep)

        raw_detections = self.detector.detect(frame.image)
        observation = build_person_observation(frame, raw_detections, self.config)
        if self.publish_enabled:
            self.platform_sink.submit_person_observation(observation)
            if self.platform_sink.state.last_error:
                print(
                    json.dumps({"status": "degraded", "platformError": self.platform_sink.state.last_error}),
                    file=sys.stderr,
                )
        return {
            "skipped": False,
            "frameId": frame.frame_id,
            "rawDetectionCount": len(raw_detections),
            "personObservation": observation,
            "platformQueuedCount": self.platform_sink.state.queued_count,
        }


def build_person_observation(frame: CapturedFrame, raw_detections: list[Detection], config: AppConfig) -> dict[str, Any]:
    image_height, image_width = frame.image.shape[:2]
    detections = []
    for detection in raw_detections:
        if not valid_detection(
            detection,
            image_width=image_width,
            image_height=image_height,
            min_confidence=config.detector.confidence_threshold,
            min_bbox_height_px=config.detector.min_bbox_height_px,
            valid_region_polygon=config.detector.valid_region_polygon,
        ):
            continue
        foot = foot_point(detection)
        detections.append(
            {
                "bbox": _round_list(detection.bbox),
                "confidence": round(float(detection.confidence), 4),
                "footPoint": _round_list(foot),
                "floorPosition": project_point(config.projection.homography, foot),
            }
        )

    payload = {
        "source": "live",
        "capturedAt": frame.captured_at or _now_iso(),
        "imageWidth": int(image_width),
        "imageHeight": int(image_height),
        "calibrationId": config.projection.calibration_id,
        "detectorName": config.detector.detector_name,
        "detections": detections,
    }
    if frame.frame_id:
        payload["frameId"] = frame.frame_id
    return payload


def _frame_key(frame: CapturedFrame) -> str:
    if frame.frame_id:
        return f"frame:{frame.frame_id}"
    return f"sha256:{frame.content_sha256}"


def _round_list(values) -> list[float]:
    return [round(float(value), 4) for value in values]


def _now_iso() -> str:
    return datetime.now(TAIPEI).isoformat(timespec="seconds")


def _trim_directory(directory: Path, keep: int) -> None:
    files = sorted((path for path in directory.glob("*.jpg") if path.is_file()), key=lambda path: path.stat().st_mtime)
    for path in files[:-keep]:
        path.unlink(missing_ok=True)


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Project anonymous person detections into Factory Twin world coordinates")
    parser.add_argument("--config", default="config.yaml")
    parser.add_argument("--input", default=None, help="Image file for offline mode")
    parser.add_argument("--once", action="store_true", help="Run one live capture/detect cycle")
    parser.add_argument("--publish", action="store_true", help="Submit observations to platform")
    parser.add_argument("--dry-run", action="store_true", help="Disable platform submission even if --publish is set")
    parser.add_argument("--fake-detection", action="store_true", help="Use FakeDetector instead of loading PaddleDetection")
    return parser.parse_args(argv)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
