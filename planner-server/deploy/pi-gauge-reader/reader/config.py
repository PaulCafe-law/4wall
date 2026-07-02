from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


@dataclass(frozen=True)
class CameraConfig:
    source: str
    capture_mode: str = "ffmpeg_single_frame"
    rtsp_transport: str = "tcp"
    interval_sec: float = 15.0
    capture_timeout_sec: float = 8.0
    min_meter_crop_width_px: int = 180


@dataclass(frozen=True)
class MqttConfig:
    enabled: bool
    host: str
    port: int
    base_topic: str
    client_id: str


@dataclass(frozen=True)
class PlatformConfig:
    enabled: bool = False
    api_base_url: str = ""
    device_token: str = ""
    timeout_sec: float = 8.0


@dataclass(frozen=True)
class StatusConfig:
    host: str = "127.0.0.1"
    port: int = 8091


@dataclass(frozen=True)
class GaugeConfig:
    id: str
    label: str
    unit: str
    min_val: float
    max_val: float
    calibration_file: Path


@dataclass(frozen=True)
class DebugConfig:
    save_annotated: bool = True
    save_failed_frames: bool = True
    rolling_keep: int = 200
    crops_for_training: bool = False
    runtime_dir: Path = Path("runtime")


@dataclass(frozen=True)
class AppConfig:
    root_dir: Path
    camera: CameraConfig
    mqtt: MqttConfig
    platform: PlatformConfig
    status: StatusConfig
    gauges: list[GaugeConfig]
    debug: DebugConfig


def load_config(path: str | Path) -> AppConfig:
    config_path = Path(path).expanduser().resolve()
    payload = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
    root_dir = config_path.parent

    camera_payload = payload.get("camera") or {}
    mqtt_payload = payload.get("mqtt") or {}
    platform_payload = payload.get("platform") or {}
    status_payload = payload.get("status") or {}
    debug_payload = payload.get("debug") or {}
    runtime_dir = Path(str(debug_payload.get("runtime_dir", "runtime")))
    if not runtime_dir.is_absolute():
        runtime_dir = root_dir / runtime_dir

    gauges = []
    for gauge_payload in payload.get("gauges") or []:
        calibration_file = Path(str(gauge_payload.get("calibration_file", "gauges.json")))
        if not calibration_file.is_absolute():
            calibration_file = root_dir / calibration_file
        gauges.append(
            GaugeConfig(
                id=str(gauge_payload["id"]),
                label=str(gauge_payload.get("label", gauge_payload["id"])),
                unit=str(gauge_payload.get("unit", "")),
                min_val=float(gauge_payload.get("min_val", 0)),
                max_val=float(gauge_payload.get("max_val", 10)),
                calibration_file=calibration_file,
            )
        )

    return AppConfig(
        root_dir=root_dir,
        camera=CameraConfig(
            source=str(camera_payload.get("source", "")),
            capture_mode=str(camera_payload.get("capture_mode", "ffmpeg_single_frame")),
            rtsp_transport=str(camera_payload.get("rtsp_transport", "tcp")),
            interval_sec=float(camera_payload.get("interval_sec", 15)),
            capture_timeout_sec=float(camera_payload.get("capture_timeout_sec", 8)),
            min_meter_crop_width_px=int(camera_payload.get("min_meter_crop_width_px", 180)),
        ),
        mqtt=MqttConfig(
            enabled=bool(mqtt_payload.get("enabled", False)),
            host=str(mqtt_payload.get("host", "127.0.0.1")),
            port=int(mqtt_payload.get("port", 1883)),
            base_topic=str(mqtt_payload.get("base_topic", "4wall/liancheng/injection/m01")),
            client_id=str(mqtt_payload.get("client_id", "fourwall-gauge-reader")),
        ),
        platform=PlatformConfig(
            enabled=bool(platform_payload.get("enabled", False)),
            api_base_url=str(platform_payload.get("api_base_url", "")).rstrip("/"),
            device_token=str(platform_payload.get("device_token", "")),
            timeout_sec=float(platform_payload.get("timeout_sec", 8)),
        ),
        status=StatusConfig(
            host=str(status_payload.get("host", "127.0.0.1")),
            port=int(status_payload.get("port", 8091)),
        ),
        gauges=gauges,
        debug=DebugConfig(
            save_annotated=bool(debug_payload.get("save_annotated", True)),
            save_failed_frames=bool(debug_payload.get("save_failed_frames", True)),
            rolling_keep=int(debug_payload.get("rolling_keep", 200)),
            crops_for_training=bool(debug_payload.get("crops_for_training", False)),
            runtime_dir=runtime_dir,
        ),
    )


def load_calibration(path: str | Path) -> dict[str, Any]:
    return yaml.safe_load(Path(path).expanduser().read_text(encoding="utf-8")) or {}
