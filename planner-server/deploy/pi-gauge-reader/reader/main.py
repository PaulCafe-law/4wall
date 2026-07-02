from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import cv2

from .capture import CaptureError, capture_frame, read_frame_file
from .config import AppConfig, GaugeConfig, load_calibration, load_config
from .detector import ClassicalLinearMeterDetector, DetectionResult
from .geometry import GaugeCalibration, crop_roi, parse_gauge_calibration
from .publish import MqttPublisher
from .smoothing import GaugeSmoother
from .status_server import RuntimeStatus, start_status_server


TAIPEI = ZoneInfo("Asia/Taipei")


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    config = load_config(args.config)
    calibration_path = Path(args.calibration).resolve() if args.calibration else None
    publish = args.publish if args.input else True
    runner = GaugeReaderRunner(config, calibration_path=calibration_path, publish=publish)

    if args.input:
        outputs = runner.run_input(Path(args.input), once=args.once)
        print(json.dumps(outputs, ensure_ascii=False, indent=2))
        return 0

    runner.run_live(once=args.once)
    return 0


class GaugeReaderRunner:
    def __init__(self, config: AppConfig, *, calibration_path: Path | None = None, publish: bool = True) -> None:
        self.config = config
        self.calibration_payload = _load_calibration_payload(config, calibration_path)
        self.detector = ClassicalLinearMeterDetector(min_crop_width_px=config.camera.min_meter_crop_width_px)
        self.runtime_status = RuntimeStatus()
        self.publisher = MqttPublisher(config.mqtt)
        self.publish_enabled = publish
        self.smoothers = {
            gauge.id: GaugeSmoother(min_val=gauge.min_val, max_val=gauge.max_val)
            for gauge in self.config.gauges
        }
        self.debug_dir = config.root_dir / "runtime" / "debug"
        self.debug_dir.mkdir(parents=True, exist_ok=True)
        self.training_dir = config.root_dir / "runtime" / "training-crops"
        if self.config.debug.crops_for_training:
            self.training_dir.mkdir(parents=True, exist_ok=True)

    def run_input(self, input_path: Path, *, once: bool) -> list[dict]:
        paths = _input_paths(input_path)
        outputs = []
        for path in paths:
            frame = read_frame_file(path)
            readings = self.process_frame(frame, frame_name=path.stem)
            outputs.append({"input": str(path), "readings": readings})
            if once:
                break
        return outputs

    def run_live(self, *, once: bool) -> None:
        start_status_server(self.runtime_status, self.config.status.host, self.config.status.port)
        if self.publish_enabled:
            self.publisher.start()

        backoff_sec = 1.0
        try:
            while True:
                try:
                    frame = capture_frame(self.config.camera)
                    self.runtime_status.camera["last_capture_at"] = _now_iso()
                    self.runtime_status.camera["last_error"] = None
                    self.process_frame(frame, frame_name="live")
                    backoff_sec = 1.0
                except CaptureError as exc:
                    self.runtime_status.status = "degraded"
                    self.runtime_status.camera["last_error"] = str(exc)
                    time.sleep(backoff_sec)
                    backoff_sec = min(300.0, backoff_sec * 2)
                    if once:
                        raise

                if once:
                    break
                time.sleep(self.config.camera.interval_sec)
        finally:
            self.publisher.stop()

    def process_frame(self, frame, *, frame_name: str) -> list[dict]:
        readings = []
        has_degraded = False
        for gauge in self.config.gauges:
            calibration = self._calibration_for(gauge)
            crop = crop_roi(frame, calibration.roi)
            result, annotated = self.detector.detect(crop, calibration)
            smoothed_value, accepted = self.smoothers[gauge.id].update(result.value, result.confidence)
            payload = _payload_for(gauge, result, smoothed_value, accepted)
            readings.append(payload)
            self.runtime_status.gauges[gauge.id] = {
                "value": payload["value"],
                "unit": payload["unit"],
                "confidence": payload["confidence"],
                "status": payload["status"],
                "updated_at": payload["ts"],
            }
            if payload["status"] != "ok":
                has_degraded = True

            if self.config.debug.save_annotated:
                output_path = self.debug_dir / f"{frame_name}-{gauge.id}-{int(time.time())}.jpg"
                cv2.imwrite(str(output_path), annotated)
                _trim_directory(self.debug_dir, self.config.debug.rolling_keep)

            if self.config.debug.crops_for_training:
                crop_path = self.training_dir / f"{frame_name}-{gauge.id}-{int(time.time())}.jpg"
                cv2.imwrite(str(crop_path), crop)

            if self.publish_enabled:
                self.publisher.publish_reading(gauge.id, payload)

        self.runtime_status.mqtt = {
            "connected": self.publisher.state.connected,
            "queued": self.publisher.state.queued,
            "last_error": self.publisher.state.last_error,
        }
        self.runtime_status.status = "degraded" if has_degraded else "ok"
        return readings

    def _calibration_for(self, gauge: GaugeConfig) -> GaugeCalibration:
        payload = self.calibration_payload.get("gauges", {}).get(gauge.id)
        if not payload:
            raise ValueError(f"missing calibration for gauge {gauge.id}")
        return parse_gauge_calibration(payload)


def _payload_for(
    gauge: GaugeConfig,
    result: DetectionResult,
    smoothed_value: float | None,
    accepted: bool,
) -> dict:
    status = result.status
    if result.value is None:
        status = "degraded"
    elif not accepted:
        status = "degraded"

    return {
        "value": None if smoothed_value is None else round(float(smoothed_value), 3),
        "unit": gauge.unit,
        "confidence": round(float(result.confidence), 3),
        "raw_position": None if result.raw_position is None else round(float(result.raw_position), 5),
        "ts": _now_iso(),
        "source": "live",
        "status": status,
    }


def _load_calibration_payload(config: AppConfig, calibration_path: Path | None) -> dict:
    if calibration_path:
        return load_calibration(calibration_path)
    if not config.gauges:
        return {"gauges": {}}
    return load_calibration(config.gauges[0].calibration_file)


def _input_paths(input_path: Path) -> list[Path]:
    input_path = input_path.expanduser().resolve()
    if input_path.is_file():
        return [input_path]
    if not input_path.is_dir():
        raise FileNotFoundError(input_path)
    extensions = {".jpg", ".jpeg", ".png", ".bmp"}
    return sorted(path for path in input_path.iterdir() if path.suffix.lower() in extensions)


def _now_iso() -> str:
    return datetime.now(TAIPEI).isoformat(timespec="seconds")


def _trim_directory(directory: Path, keep: int) -> None:
    files = sorted((path for path in directory.glob("*.jpg") if path.is_file()), key=lambda path: path.stat().st_mtime)
    for path in files[:-keep]:
        path.unlink(missing_ok=True)


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Read rectangular analog gauges from a fixed camera")
    parser.add_argument("--config", default="config.yaml")
    parser.add_argument("--calibration", default=None)
    parser.add_argument("--input", default=None, help="Image file or directory for offline mode")
    parser.add_argument("--once", action="store_true", help="Run one capture/read cycle")
    parser.add_argument("--publish", action="store_true", help="Publish MQTT in offline mode too")
    return parser.parse_args(argv)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
