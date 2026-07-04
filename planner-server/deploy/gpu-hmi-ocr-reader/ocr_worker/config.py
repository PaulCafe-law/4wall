from __future__ import annotations

from dataclasses import dataclass, field
import os
from pathlib import Path
import shlex
from typing import Any

import yaml


@dataclass(frozen=True)
class FrameSourceConfig:
    mode: str
    path: str = ""
    url: str = ""
    interval_sec: float = 30.0
    timeout_sec: float = 12.0
    headers: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class PlatformConfig:
    enabled: bool = False
    api_base_url: str = ""
    device_token: str = ""
    timeout_sec: float = 10.0
    submit_gauge_readings: bool = True
    submit_ocr_observations: bool = True


@dataclass(frozen=True)
class OcrConfig:
    engine: str = "paddle"
    lang: str = "ch"
    ocr_version: str = "PP-OCRv5"
    device: str = "gpu:0"
    min_confidence: float = 0.55
    constructor_options: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class HmiFieldConfig:
    id: str
    label: str
    unit: str
    roi: tuple[int, int, int, int]
    min_value: float | None = None
    max_value: float | None = None
    decimal_places: int | None = 1


@dataclass(frozen=True)
class HmiConfig:
    camera_label: str
    detector_name: str
    roi: tuple[int, int, int, int]
    fields: list[HmiFieldConfig]


@dataclass(frozen=True)
class WorkOrderConfig:
    enabled: bool = False
    roi: tuple[int, int, int, int] = (0, 0, 0, 0)


@dataclass(frozen=True)
class GptConfig:
    enabled: bool = False
    auth_mode: str = "account_oauth_dev"
    summary_model: str = "latest"
    auth_cache_dir: Path | None = None
    command: list[str] = field(default_factory=list)
    timeout_sec: float = 60.0
    min_interval_sec: float = 300.0


@dataclass(frozen=True)
class DebugConfig:
    runtime_dir: Path
    save_crops: bool = True
    rolling_keep: int = 200


@dataclass(frozen=True)
class AppConfig:
    root_dir: Path
    frame_source: FrameSourceConfig
    platform: PlatformConfig
    ocr: OcrConfig
    hmi: HmiConfig
    work_order: WorkOrderConfig
    gpt: GptConfig
    debug: DebugConfig


def load_config(path: str | Path) -> AppConfig:
    config_path = Path(path).expanduser().resolve()
    payload = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
    root_dir = config_path.parent

    source_payload = payload.get("frame_source") or {}
    platform_payload = payload.get("platform") or {}
    ocr_payload = payload.get("ocr") or {}
    hmi_payload = payload.get("hmi") or {}
    work_order_payload = payload.get("work_order") or {}
    gpt_payload = payload.get("gpt") or {}
    debug_payload = payload.get("debug") or {}

    runtime_dir = Path(str(debug_payload.get("runtime_dir", "runtime")))
    if not runtime_dir.is_absolute():
        runtime_dir = root_dir / runtime_dir

    hmi_roi = _parse_roi(hmi_payload.get("roi", [0, 0, 0, 0]))
    fields = []
    for field_payload in hmi_payload.get("fields") or []:
        fields.append(
            HmiFieldConfig(
                id=str(field_payload["id"]),
                label=str(field_payload.get("label", field_payload["id"])),
                unit=str(field_payload.get("unit", "")),
                roi=_parse_roi(field_payload.get("roi", [0, 0, 0, 0])),
                min_value=_optional_float(field_payload.get("min_value")),
                max_value=_optional_float(field_payload.get("max_value")),
                decimal_places=_optional_int(field_payload.get("decimal_places", 1)),
            )
        )

    return AppConfig(
        root_dir=root_dir,
        frame_source=FrameSourceConfig(
            mode=str(source_payload.get("mode", "file")),
            path=str(source_payload.get("path", "")),
            url=str(source_payload.get("url", "")),
            interval_sec=float(source_payload.get("interval_sec", 30)),
            timeout_sec=float(source_payload.get("timeout_sec", 12)),
            headers=_parse_headers(source_payload.get("headers") or {}),
        ),
        platform=PlatformConfig(
            enabled=_env_bool("HMI_OCR_ENABLED", bool(platform_payload.get("enabled", False))),
            api_base_url=_env_str("HMI_OCR_API_BASE_URL", platform_payload.get("api_base_url", "")).rstrip("/"),
            device_token=_env_str("HMI_OCR_DEVICE_TOKEN", platform_payload.get("device_token", "")),
            timeout_sec=float(platform_payload.get("timeout_sec", 10)),
            submit_gauge_readings=bool(platform_payload.get("submit_gauge_readings", True)),
            submit_ocr_observations=bool(platform_payload.get("submit_ocr_observations", True)),
        ),
        ocr=OcrConfig(
            engine=str(ocr_payload.get("engine", "paddle")),
            lang=str(ocr_payload.get("lang", "ch")),
            ocr_version=str(ocr_payload.get("ocr_version", "PP-OCRv5")),
            device=str(ocr_payload.get("device", "gpu:0")),
            min_confidence=float(ocr_payload.get("min_confidence", 0.55)),
            constructor_options=dict(ocr_payload.get("constructor_options") or {}),
        ),
        hmi=HmiConfig(
            camera_label=str(hmi_payload.get("camera_label", "")),
            detector_name=str(hmi_payload.get("detector_name", "paddleocr_ppocrv5_hmi")),
            roi=hmi_roi,
            fields=fields,
        ),
        work_order=WorkOrderConfig(
            enabled=bool(work_order_payload.get("enabled", False)),
            roi=_parse_roi(work_order_payload.get("roi", [0, 0, 0, 0])),
        ),
        gpt=GptConfig(
            enabled=_env_bool("GPT_SUMMARIZER_ENABLED", bool(gpt_payload.get("enabled", False))),
            auth_mode=_env_str("GPT_AUTH_MODE", str(gpt_payload.get("auth_mode", "account_oauth_dev"))),
            summary_model=_env_str("GPT_SUMMARY_MODEL", str(gpt_payload.get("summary_model", "latest"))),
            auth_cache_dir=_optional_path(_env_str("GPT_AUTH_CACHE_DIR", gpt_payload.get("auth_cache_dir"))),
            command=_parse_command(gpt_payload.get("command") or os.environ.get("GPT_SUMMARY_COMMAND")),
            timeout_sec=float(gpt_payload.get("timeout_sec", 60)),
            min_interval_sec=float(gpt_payload.get("min_interval_sec", 300)),
        ),
        debug=DebugConfig(
            runtime_dir=runtime_dir,
            save_crops=bool(debug_payload.get("save_crops", True)),
            rolling_keep=int(debug_payload.get("rolling_keep", 200)),
        ),
    )


def resolve_config_path(root_dir: Path, configured_path: str) -> Path:
    path = Path(configured_path).expanduser()
    if path.is_absolute():
        return path
    return root_dir / path


def _parse_roi(value: Any) -> tuple[int, int, int, int]:
    if not isinstance(value, (list, tuple)) or len(value) != 4:
        raise ValueError(f"ROI must be [x, y, w, h], got {value!r}")
    return tuple(int(part) for part in value)  # type: ignore[return-value]


def _optional_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    return float(value)


def _optional_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    return int(value)


def _optional_path(value: Any) -> Path | None:
    if value is None or value == "":
        return None
    return Path(str(value)).expanduser()


def _parse_command(value: Any) -> list[str]:
    if value is None or value == "":
        return []
    if isinstance(value, str):
        return shlex.split(value, posix=os.name != "nt")
    if isinstance(value, (list, tuple)):
        return [str(part) for part in value]
    raise ValueError(f"command must be a string or list, got {value!r}")


def _parse_headers(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        raise ValueError(f"headers must be an object, got {value!r}")
    return {str(key): os.path.expandvars(str(header_value)) for key, header_value in value.items()}


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
