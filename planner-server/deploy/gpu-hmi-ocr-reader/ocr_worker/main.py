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
from .frame_source import FrameSourceError, capture_configured_frame, load_frame_file
from .hmi_analysis import build_structured_fields, classify_hmi_mode, raw_ocr_lines_payload, raw_text
from .hmi_temperature import apply_temperature_grid_readings, read_temperature_grid, stabilize_temperature_readings
from .ocr_engine import OcrEngine, OcrTextLine, PaddleOcrEngine
from .publish import PlatformSink
from .roi import FieldReading, crop_roi, detect_screen_visibility, lines_inside_roi, preprocess_for_ocr, read_field
from .summarizer import GptSummarizer
from .text_normalization import normalize_traditional_chinese


TAIPEI = ZoneInfo("Asia/Taipei")


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    config = load_config(args.config)
    runner = HmiOcrRunner(config, publish=args.publish and not args.dry_run)

    if args.input:
        frame = load_frame_file(Path(args.input))
        result = runner.process_frame(frame, frame_name=Path(args.input).stem)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0

    runner.run_live(once=args.once)
    return 0


class HmiOcrRunner:
    def __init__(self, config: AppConfig, *, publish: bool | None = None, engine: OcrEngine | None = None) -> None:
        self.config = config
        self.publish_enabled = config.platform.enabled if publish is None else publish
        self.engine = engine or PaddleOcrEngine(config.ocr)
        self.platform_sink = PlatformSink(config.platform)
        self.summarizer = GptSummarizer(config.gpt)
        self.crop_dir = config.debug.runtime_dir / "crops"
        self.lit_sample_dir = config.debug.runtime_dir / "lit-samples"
        self.temperature_history = {}
        if config.debug.save_crops:
            self.crop_dir.mkdir(parents=True, exist_ok=True)
            self.lit_sample_dir.mkdir(parents=True, exist_ok=True)

    def run_live(self, *, once: bool = False) -> None:
        backoff_sec = 1.0
        while True:
            try:
                frame = capture_configured_frame(self.config.frame_source, self.config.root_dir)
                result = self.process_frame(frame, frame_name="live")
                print(json.dumps({"status": "ok", **result}, ensure_ascii=False))
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

    def process_frame(self, frame, *, frame_name: str) -> dict[str, Any]:
        captured_at = _now_iso()
        hmi_crop = crop_roi(frame, self.config.hmi.roi)
        screen_visibility = detect_screen_visibility(hmi_crop)
        if self.config.debug.save_crops:
            cv2.imwrite(str(self.crop_dir / f"{frame_name}-hmi-{int(time.time())}.jpg"), hmi_crop)
            _trim_directory(self.crop_dir, self.config.debug.rolling_keep)
            if screen_visibility.status == "lit":
                sample_ts = int(time.time())
                cv2.imwrite(str(self.lit_sample_dir / f"{frame_name}-{sample_ts}-frame.jpg"), frame)
                cv2.imwrite(str(self.lit_sample_dir / f"{frame_name}-{sample_ts}-hmi.jpg"), hmi_crop)
                _trim_directory(self.lit_sample_dir, self.config.debug.rolling_keep)

        hmi_lines = []
        if screen_visibility.status == "lit":
            hmi_lines = recognize_scaled(self.engine, hmi_crop, scale=3.0)
        work_order_lines = []
        if self.config.work_order.enabled:
            work_order_crop = crop_roi(frame, self.config.work_order.roi)
            if self.config.debug.save_crops:
                cv2.imwrite(str(self.crop_dir / f"{frame_name}-work-order-{int(time.time())}.jpg"), work_order_crop)
                _trim_directory(self.crop_dir, self.config.debug.rolling_keep)
            work_order_lines = self.engine.recognize(preprocess_for_ocr(work_order_crop))

        mode_result = classify_hmi_mode(hmi_lines)
        field_readings = []
        for field in self.config.hmi.fields:
            field_crop = crop_roi(hmi_crop, field.roi)
            ocr_image = preprocess_for_ocr(field_crop)
            if self.config.debug.save_crops:
                cv2.imwrite(str(self.crop_dir / f"{frame_name}-{field.id}-{int(time.time())}.jpg"), ocr_image)
                _trim_directory(self.crop_dir, self.config.debug.rolling_keep)
            lines = lines_inside_roi(hmi_lines, field.roi)
            if not lines:
                lines = self.engine.recognize(ocr_image)
            field_readings.append(read_field(field, lines, min_confidence=self.config.ocr.min_confidence))
        if mode_result.mode == "temperature_monitor" and screen_visibility.status == "lit":
            temperature_hmi_lines = [
                *hmi_lines,
                *recognize_scaled(self.engine, hmi_crop, scale=4.0),
                *recognize_scaled(self.engine, hmi_crop, scale=5.0),
            ]
            temperature_readings = read_temperature_grid(
                engine=self.engine,
                hmi_crop=hmi_crop,
                hmi_lines=temperature_hmi_lines,
                min_confidence=self.config.ocr.min_confidence,
                debug_dir=self.crop_dir if self.config.debug.save_crops else None,
                frame_name=frame_name,
            )
            field_readings.extend(stabilize_temperature_readings(temperature_readings, self.temperature_history))

        readings = [build_platform_reading(reading, captured_at, self.config.hmi.detector_name) for reading in field_readings]
        structured_fields = build_structured_fields(
            mode_result=mode_result,
            hmi_lines=hmi_lines,
            field_readings=field_readings,
            min_confidence=self.config.ocr.min_confidence,
        )
        apply_temperature_grid_readings(structured_fields, field_readings)
        structured_fields["screenVisibility"] = {
            "status": screen_visibility.status,
            "confidence": screen_visibility.confidence,
            "meanLuma": screen_visibility.mean_luma,
            "p90Luma": screen_visibility.p90_luma,
            "p98Luma": screen_visibility.p98_luma,
        }
        structured_fields["ocrRoutine"] = {
            "name": "fixed_hc600_hmi_paddleocr",
            "engine": self.config.ocr.engine,
            "version": self.config.ocr.ocr_version,
            "lang": self.config.ocr.lang,
            "device": self.config.ocr.device,
            "detector": self.config.hmi.detector_name,
            "hmiOcrRan": screen_visibility.status == "lit",
            "workOrderOcrRan": self.config.work_order.enabled,
            "screenGate": "run_hmi_ocr_when_screen_visibility_is_lit",
        }
        observation = build_ocr_observation(
            captured_at=captured_at,
            mode=mode_result.mode,
            mode_confidence=mode_result.confidence,
            raw_lines=[
                *raw_ocr_lines_payload(hmi_lines, region="hmi"),
                *raw_ocr_lines_payload(work_order_lines, region="work_order"),
            ],
            structured_fields=structured_fields,
            work_order_raw_text=raw_text(work_order_lines) or None,
        )
        summary_result = self.summarizer.summarize(observation)
        observation["gptSummary"] = normalize_traditional_chinese(summary_result.summary)
        observation["summaryStatus"] = summary_result.status
        observation["summaryError"] = normalize_traditional_chinese(summary_result.error)
        if self.publish_enabled:
            self.platform_sink.submit_readings(readings)
            self.platform_sink.submit_ocr_observation(observation)
            if self.platform_sink.state.last_error:
                print(
                    json.dumps({"status": "degraded", "platformError": self.platform_sink.state.last_error}),
                    file=sys.stderr,
                )
        return {"readings": readings, "ocrObservation": observation}


def build_platform_reading(reading: FieldReading, captured_at: str, detector_name: str) -> dict[str, Any]:
    return normalize_traditional_chinese({
        "gaugeId": reading.field.id,
        "label": reading.field.label,
        "value": reading.value,
        "unit": reading.field.unit,
        "confidence": round(float(reading.confidence), 3),
        "rawPosition": None if reading.raw_position is None else round(float(reading.raw_position), 5),
        "status": reading.status,
        "source": "live",
        "capturedAt": captured_at,
        "metadata": {
            "detector": detector_name,
            "ocrText": reading.raw_text,
            "message": reading.message,
            "roi": list(reading.field.roi),
        },
    })


def recognize_scaled(engine: OcrEngine, image, *, scale: float) -> list[OcrTextLine]:
    if scale <= 1.0:
        return engine.recognize(preprocess_for_ocr(image))
    enlarged = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    lines = engine.recognize(enlarged)
    normalized = []
    for line in lines:
        box = None
        if line.box is not None:
            box = [[point[0] / scale, point[1] / scale] for point in line.box]
        normalized.append(OcrTextLine(text=line.text, confidence=line.confidence, box=box))
    return normalized


def build_ocr_observation(
    *,
    captured_at: str,
    mode: str,
    mode_confidence: float,
    raw_lines: list[dict[str, Any]],
    structured_fields: dict[str, Any],
    work_order_raw_text: str | None,
) -> dict[str, Any]:
    return normalize_traditional_chinese({
        "mode": mode,
        "modeConfidence": round(float(mode_confidence), 3),
        "source": "live",
        "capturedAt": captured_at,
        "rawOcrLines": raw_lines,
        "structuredFields": structured_fields,
        "workOrderRawText": work_order_raw_text,
        "gptSummary": {},
        "summaryStatus": "unknown",
        "summaryError": None,
    })


def _now_iso() -> str:
    return datetime.now(TAIPEI).isoformat(timespec="seconds")


def _trim_directory(directory: Path, keep: int) -> None:
    files = sorted((path for path in directory.glob("*.jpg") if path.is_file()), key=lambda path: path.stat().st_mtime)
    for path in files[:-keep]:
        path.unlink(missing_ok=True)


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Read HC600 HMI values from fixed camera crops with PaddleOCR")
    parser.add_argument("--config", default="config.yaml")
    parser.add_argument("--input", default=None, help="Image file for offline mode")
    parser.add_argument("--once", action="store_true", help="Run one live capture/read cycle")
    parser.add_argument("--publish", action="store_true", help="Submit readings to platform")
    parser.add_argument("--dry-run", action="store_true", help="Disable platform submission even if --publish is set")
    return parser.parse_args(argv)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
