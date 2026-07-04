from __future__ import annotations

from dataclasses import dataclass, field
import os
from pathlib import Path
from typing import Any

import yaml


Point = tuple[float, float]


@dataclass(frozen=True)
class FrameSourceConfig:
    mode: str
    path: str = ""
    url: str = ""
    interval_sec: float = 10.0
    timeout_sec: float = 12.0
    headers: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class PlatformConfig:
    enabled: bool = False
    api_base_url: str = ""
    device_token: str = ""
    timeout_sec: float = 10.0
    retry_queue_size: int = 20


@dataclass(frozen=True)
class DetectorConfig:
    backend: str = "paddledet"
    detector_name: str = "paddledet_ppyoloe_plus_person"
    model_dir: str = ""
    device: str = "gpu"
    run_mode: str = "paddle"
    confidence_threshold: float = 0.5
    min_bbox_height_px: float = 40.0
    valid_region_polygon: list[Point] = field(default_factory=list)
    constructor_options: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ProjectionConfig:
    calibration_id: str | None = None
    homography: list[list[float]] | None = None


@dataclass(frozen=True)
class DebugConfig:
    runtime_dir: Path
    save_debug_frames: bool = False
    rolling_keep: int = 100


@dataclass(frozen=True)
class AppConfig:
    root_dir: Path
    frame_source: FrameSourceConfig
    platform: PlatformConfig
    detector: DetectorConfig
    projection: ProjectionConfig
    debug: DebugConfig


def load_config(path: str | Path) -> AppConfig:
    config_path = Path(path).expanduser().resolve()
    payload = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
    root_dir = config_path.parent

    source_payload = payload.get("frame_source") or {}
    platform_payload = payload.get("platform") or {}
    detector_payload = payload.get("detector") or {}
    projection_payload = payload.get("projection") or {}
    debug_payload = payload.get("debug") or {}

    runtime_dir = Path(str(debug_payload.get("runtime_dir", "runtime"))).expanduser()
    if not runtime_dir.is_absolute():
        runtime_dir = root_dir / runtime_dir

    return AppConfig(
        root_dir=root_dir,
        frame_source=FrameSourceConfig(
            mode=str(source_payload.get("mode", "url")),
            path=str(source_payload.get("path", "")),
            url=str(source_payload.get("url", "")),
            interval_sec=float(source_payload.get("interval_sec", 10)),
            timeout_sec=float(source_payload.get("timeout_sec", 12)),
            headers=_parse_headers(source_payload.get("headers") or {}),
        ),
        platform=PlatformConfig(
            enabled=_env_bool("PERSON_PRESENCE_ENABLED", bool(platform_payload.get("enabled", False))),
            api_base_url=_env_str("PERSON_PRESENCE_API_BASE_URL", platform_payload.get("api_base_url", "")).rstrip("/"),
            device_token=_env_str("PERSON_PRESENCE_DEVICE_TOKEN", platform_payload.get("device_token", "")),
            timeout_sec=float(platform_payload.get("timeout_sec", 10)),
            retry_queue_size=int(platform_payload.get("retry_queue_size", 20)),
        ),
        detector=DetectorConfig(
            backend=str(detector_payload.get("backend", "paddledet")),
            detector_name=str(detector_payload.get("detector_name", "paddledet_ppyoloe_plus_person")),
            model_dir=str(detector_payload.get("model_dir", "")),
            device=str(detector_payload.get("device", "gpu")),
            run_mode=str(detector_payload.get("run_mode", "paddle")),
            confidence_threshold=float(detector_payload.get("confidence_threshold", 0.5)),
            min_bbox_height_px=float(detector_payload.get("min_bbox_height_px", 40)),
            valid_region_polygon=_parse_polygon(detector_payload.get("valid_region_polygon") or []),
            constructor_options=dict(detector_payload.get("constructor_options") or {}),
        ),
        projection=ProjectionConfig(
            calibration_id=_optional_str(projection_payload.get("calibration_id")),
            homography=_parse_homography(projection_payload.get("homography")),
        ),
        debug=DebugConfig(
            runtime_dir=runtime_dir,
            save_debug_frames=bool(debug_payload.get("save_debug_frames", False)),
            rolling_keep=int(debug_payload.get("rolling_keep", 100)),
        ),
    )


def resolve_config_path(root_dir: Path, configured_path: str) -> Path:
    path = Path(configured_path).expanduser()
    if path.is_absolute():
        return path
    return root_dir / path


def _parse_headers(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        raise ValueError(f"headers must be an object, got {value!r}")
    return {str(key): os.path.expandvars(str(header_value)) for key, header_value in value.items()}


def _parse_polygon(value: Any) -> list[Point]:
    if value in (None, ""):
        return []
    if not isinstance(value, list):
        raise ValueError("valid_region_polygon must be a list of [u, v] points")
    polygon: list[Point] = []
    for point in value:
        if not isinstance(point, (list, tuple)) or len(point) != 2:
            raise ValueError("valid_region_polygon points must be [u, v]")
        polygon.append((float(point[0]), float(point[1])))
    return polygon


def _parse_homography(value: Any) -> list[list[float]] | None:
    if value in (None, ""):
        return None
    if not isinstance(value, list) or len(value) != 3:
        raise ValueError("projection.homography must be a 3x3 matrix")
    matrix: list[list[float]] = []
    for row in value:
        if not isinstance(row, list) or len(row) != 3:
            raise ValueError("projection.homography must be a 3x3 matrix")
        matrix.append([float(item) for item in row])
    return matrix


def _optional_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _env_str(name: str, default: Any) -> str:
    value = os.environ.get(name)
    if value is None:
        return "" if default is None else str(default)
    return value


def _env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}
