from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path
from urllib.request import Request, urlopen

import cv2
import numpy as np

from .config import CameraConfig


class CaptureError(RuntimeError):
    pass


def capture_frame(config: CameraConfig) -> np.ndarray:
    if config.source.startswith("http://") or config.source.startswith("https://"):
        return _capture_http_snapshot(config)
    return _capture_ffmpeg(config)


def read_frame_file(path: str | Path) -> np.ndarray:
    frame = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if frame is None:
        raise CaptureError(f"image_read_failed: {path}")
    _ensure_valid_frame(frame)
    return frame


def _capture_http_snapshot(config: CameraConfig) -> np.ndarray:
    request = Request(config.source, headers={"User-Agent": "fourwall-gauge-reader/1.0"})
    with urlopen(request, timeout=config.capture_timeout_sec) as response:
        image_bytes = response.read(8 * 1024 * 1024)
    data = np.frombuffer(image_bytes, dtype=np.uint8)
    frame = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if frame is None:
        raise CaptureError("http_snapshot_decode_failed")
    _ensure_valid_frame(frame)
    return frame


def _capture_ffmpeg(config: CameraConfig) -> np.ndarray:
    last_error: Exception | None = None
    for _attempt in range(max(1, config.capture_retries)):
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as handle:
            output_path = Path(handle.name)
        command = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-rtsp_transport",
            config.rtsp_transport,
            "-i",
            config.source,
            "-frames:v",
            "1",
            "-q:v",
            "3",
            str(output_path),
        ]
        try:
            completed = subprocess.run(command, capture_output=True, text=True, timeout=config.capture_timeout_sec)
            if completed.returncode != 0:
                raise CaptureError(f"ffmpeg_capture_failed: {_redact(config.source)} {completed.stderr.strip()}")
            return read_frame_file(output_path)
        except subprocess.TimeoutExpired as exc:
            last_error = CaptureError(f"ffmpeg_capture_timeout: {_redact(config.source)}")
            continue
        except CaptureError as exc:
            last_error = exc
            continue
        finally:
            output_path.unlink(missing_ok=True)

    raise CaptureError(str(last_error) if last_error else f"ffmpeg_capture_failed: {_redact(config.source)}")


def _ensure_valid_frame(frame: np.ndarray) -> None:
    if frame.size == 0:
        raise CaptureError("frame_empty")
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    if float(gray.std()) < 5.0:
        raise CaptureError("frame_low_detail")


def _redact(source: str) -> str:
    if "://" not in source or "@" not in source:
        return source
    scheme, rest = source.split("://", 1)
    return f"{scheme}://<redacted>@{rest.split('@', 1)[1]}"
