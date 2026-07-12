from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import re
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import cv2
import numpy as np

from .config import FrameSourceConfig, resolve_config_path


class FrameSourceError(RuntimeError):
    pass


_FRAME_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,120}$")


@dataclass(frozen=True)
class CapturedFrame:
    image: np.ndarray
    frame_id: str | None = None
    captured_at: str | None = None


def load_frame_file(path: str | Path) -> np.ndarray:
    image = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if image is None:
        raise FrameSourceError(f"could not read image file: {path}")
    return image


def fetch_frame_url(
    url: str, *, headers: dict[str, str] | None = None, timeout_sec: float = 12.0
) -> CapturedFrame:
    if not url:
        raise FrameSourceError("frame source URL is empty")
    request = Request(url, headers=headers or {}, method="GET")
    try:
        with urlopen(request, timeout=timeout_sec) as response:
            data = response.read()
            frame_id = (response.headers.get("X-Camera-Frame-Id") or "").strip()
            captured_at = (response.headers.get("X-Camera-Captured-At") or "").strip()
    except HTTPError as exc:
        body = exc.read(512).decode("utf-8", errors="replace")
        raise FrameSourceError(f"frame source HTTP {exc.code}: {body}") from exc
    except URLError as exc:
        raise FrameSourceError(f"frame source URL error: {exc.reason}") from exc
    except TimeoutError as exc:
        raise FrameSourceError("frame source timeout") from exc

    array = np.frombuffer(data, dtype=np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        raise FrameSourceError("frame source did not return a decodable image")
    if not _FRAME_ID_PATTERN.fullmatch(frame_id):
        raise FrameSourceError("frame source missing or invalid X-Camera-Frame-Id")
    try:
        parsed_captured_at = datetime.fromisoformat(captured_at.replace("Z", "+00:00"))
    except ValueError as exc:
        raise FrameSourceError("frame source missing or invalid X-Camera-Captured-At") from exc
    if parsed_captured_at.tzinfo is None:
        raise FrameSourceError("frame source missing or invalid X-Camera-Captured-At")
    return CapturedFrame(image=image, frame_id=frame_id, captured_at=parsed_captured_at.isoformat())


def capture_configured_frame(config: FrameSourceConfig, root_dir: Path) -> CapturedFrame:
    if config.mode == "file":
        return CapturedFrame(image=load_frame_file(resolve_config_path(root_dir, config.path)))
    if config.mode == "url":
        return fetch_frame_url(config.url, headers=config.headers, timeout_sec=config.timeout_sec)
    raise FrameSourceError(f"unsupported frame_source.mode: {config.mode}")
