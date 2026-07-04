from __future__ import annotations

from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import cv2
import numpy as np

from .config import FrameSourceConfig, resolve_config_path


class FrameSourceError(RuntimeError):
    pass


def load_frame_file(path: str | Path) -> np.ndarray:
    image = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if image is None:
        raise FrameSourceError(f"could not read image file: {path}")
    return image


def fetch_frame_url(url: str, *, headers: dict[str, str] | None = None, timeout_sec: float = 12.0) -> np.ndarray:
    if not url:
        raise FrameSourceError("frame source URL is empty")
    request = Request(url, headers=headers or {}, method="GET")
    try:
        with urlopen(request, timeout=timeout_sec) as response:
            data = response.read()
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
    return image


def capture_configured_frame(config: FrameSourceConfig, root_dir: Path) -> np.ndarray:
    if config.mode == "file":
        return load_frame_file(resolve_config_path(root_dir, config.path))
    if config.mode == "url":
        return fetch_frame_url(config.url, headers=config.headers, timeout_sec=config.timeout_sec)
    raise FrameSourceError(f"unsupported frame_source.mode: {config.mode}")
