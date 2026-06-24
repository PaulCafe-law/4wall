from __future__ import annotations

import argparse
import base64
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


DEFAULT_INTERVAL_SECONDS = 10
DEFAULT_SPOOL_HOURS = 24
DEFAULT_HTTP_TIMEOUT_SECONDS = 30
DEFAULT_FRAME_SOURCE = "rtsp"
DEFAULT_TIMESTAMP_OVERLAY_ENABLED = True
DEFAULT_TIMESTAMP_FONT_FILE = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
MAX_CAPTURE_BYTES = 5 * 1024 * 1024
SUPPORTED_FRAME_SOURCES = {"rtsp", "http_snapshot"}
RTSP_URL_PATTERN = re.compile(r"rtsp://\S+", flags=re.IGNORECASE)
HTTP_USERINFO_URL_PATTERN = re.compile(r"(https?://)[^/\s:@]+:[^/\s@]+@", flags=re.IGNORECASE)
BASIC_AUTH_PATTERN = re.compile(r"(Authorization:\s*Basic\s+)[A-Za-z0-9+/=]+", flags=re.IGNORECASE)


@dataclass(frozen=True)
class AgentConfig:
    api_base_url: str
    device_token: str
    frame_source: str
    rtsp_url: str | None
    snapshot_url: str | None
    snapshot_username: str | None
    snapshot_password: str | None
    spool_dir: Path
    ffmpeg_path: str
    interval_seconds: int
    local_spool_hours: int
    http_timeout_seconds: int
    timestamp_overlay_enabled: bool
    timestamp_overlay_timezone: str | None
    timestamp_overlay_font_file: str


@dataclass(frozen=True)
class PendingFrame:
    frameId: str
    capturedAt: str
    contentType: str
    checksumSha256: str
    sizeBytes: int
    imagePath: str


@dataclass(frozen=True)
class DoctorCheck:
    name: str
    status: str
    detail: str


@dataclass(frozen=True)
class DoctorResult:
    ok: bool
    checks: list[DoctorCheck]


class CameraAgentError(RuntimeError):
    pass


class CameraIngestClient:
    def __init__(self, config: AgentConfig) -> None:
        self.config = config

    def create_upload_intent(self, frame: PendingFrame) -> dict[str, Any]:
        return self._json_request(
            "POST",
            "/v1/camera-ingest/upload-intents",
            {
                "frameId": frame.frameId,
                "capturedAt": frame.capturedAt,
                "contentType": frame.contentType,
                "checksumSha256": frame.checksumSha256,
                "sizeBytes": frame.sizeBytes,
            },
            auth=True,
        )

    def upload_frame(self, intent: dict[str, Any], frame: PendingFrame) -> None:
        upload_url = str(intent.get("uploadUrl") or "")
        if not upload_url:
            return
        url = self._absolute_url(upload_url) if upload_url.startswith("/") else upload_url
        headers = dict(intent.get("uploadHeaders") or {})
        if intent.get("uploadRequiresAuth", True):
            headers["Authorization"] = f"Bearer {self.config.device_token}"
        data = Path(frame.imagePath).read_bytes()
        request = Request(url, data=data, method=str(intent.get("uploadMethod") or "PUT"), headers=headers)
        with urlopen(request, timeout=self.config.http_timeout_seconds) as response:
            if response.status >= 400:
                raise CameraAgentError(f"upload_failed:{response.status}")

    def complete_upload(self, frame: PendingFrame) -> dict[str, Any]:
        return self._json_request(
            "POST",
            f"/v1/camera-ingest/frames/{frame.frameId}/complete",
            {
                "checksumSha256": frame.checksumSha256,
                "sizeBytes": frame.sizeBytes,
            },
            auth=True,
        )

    def get_config(self) -> dict[str, Any]:
        return self._json_request("GET", "/v1/camera-ingest/config", None, auth=True)

    def heartbeat(self, *, local_spool_count: int, last_captured_at: str | None, last_error: str | None) -> None:
        self._json_request(
            "POST",
            "/v1/camera-ingest/heartbeat",
            {
                "localSpoolCount": local_spool_count,
                "lastCapturedAt": last_captured_at,
                "lastError": last_error,
            },
            auth=True,
        )

    def _json_request(self, method: str, path: str, payload: dict[str, Any] | None, *, auth: bool) -> dict[str, Any]:
        headers = {"Content-Type": "application/json"}
        if auth:
            headers["Authorization"] = f"Bearer {self.config.device_token}"
        data = None
        if payload is not None:
            data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        request = Request(
            self._absolute_url(path),
            data=data,
            method=method,
            headers=headers,
        )
        with urlopen(request, timeout=self.config.http_timeout_seconds) as response:
            body = response.read()
            if response.status >= 400:
                raise CameraAgentError(f"request_failed:{path}:{response.status}")
            return json.loads(body.decode("utf-8")) if body else {}

    def _absolute_url(self, path: str) -> str:
        return urljoin(self.config.api_base_url.rstrip("/") + "/", path.lstrip("/"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Capture camera frames and upload them to camera ingest.")
    parser.add_argument("--once", action="store_true", help="capture and upload one frame, then exit")
    parser.add_argument("--doctor", action="store_true", help="check camera agent deployment prerequisites and exit")
    parser.add_argument("--skip-api", action="store_true", help="with --doctor, skip the API/device-token check")
    parser.add_argument("--skip-rtsp", action="store_true", help="with --doctor, skip the still-frame capture check")
    parser.add_argument("--json", action="store_true", help="with --doctor, print machine-readable JSON")
    args = parser.parse_args()
    if args.doctor:
        return run_doctor_from_env(check_api=not args.skip_api, check_rtsp=not args.skip_rtsp, as_json=args.json)
    config = _config_from_env()
    config.spool_dir.mkdir(parents=True, exist_ok=True)
    (config.spool_dir / "pending").mkdir(exist_ok=True)
    client = CameraIngestClient(config)
    if args.once:
        return 0 if capture_and_flush_once(config, client) else 1
    return run_loop(config, client)


def run_loop(config: AgentConfig, client: CameraIngestClient) -> int:
    last_error: str | None = None
    last_captured_at: str | None = None
    last_heartbeat = datetime.min.replace(tzinfo=timezone.utc)
    while True:
        try:
            purge_expired_pending(config)
            flush_pending(config, client)
            frame = capture_frame(config)
            last_captured_at = frame.capturedAt
            flush_pending(config, client)
            last_error = None
            print(f"uploaded_or_spooled frame={frame.frameId}", flush=True)
        except Exception as exc:
            last_error = _safe_error(exc)
            print(f"camera_agent_error {last_error}", file=sys.stderr, flush=True)

        now = datetime.now(timezone.utc)
        if now - last_heartbeat >= timedelta(seconds=60):
            try:
                client.heartbeat(
                    local_spool_count=count_pending(config),
                    last_captured_at=last_captured_at,
                    last_error=last_error,
                )
                last_heartbeat = now
            except Exception as exc:
                print(f"heartbeat_failed {_safe_error(exc)}", file=sys.stderr, flush=True)
        time.sleep(config.interval_seconds)


def capture_and_flush_once(config: AgentConfig, client: CameraIngestClient) -> bool:
    try:
        purge_expired_pending(config)
        flush_pending(config, client)
        frame = capture_frame(config)
        flush_pending(config, client)
        client.heartbeat(local_spool_count=count_pending(config), last_captured_at=frame.capturedAt, last_error=None)
        print(f"captured frame={frame.frameId}", flush=True)
        return True
    except Exception as exc:
        print(f"camera_agent_error {_safe_error(exc)}", file=sys.stderr, flush=True)
        return False


def capture_frame(config: AgentConfig) -> PendingFrame:
    captured_at = datetime.now(timezone.utc)
    frame_id = f"{captured_at:%Y%m%dT%H%M%SZ}-{secrets.token_hex(4)}"
    image_path = config.spool_dir / "pending" / f"{frame_id}.jpg"
    metadata_path = _metadata_path(config, frame_id)
    _capture_source_image(config, image_path)
    _apply_timestamp_overlay(config, image_path, captured_at)
    data = image_path.read_bytes()
    frame = PendingFrame(
        frameId=frame_id,
        capturedAt=captured_at.isoformat().replace("+00:00", "Z"),
        contentType="image/jpeg",
        checksumSha256=hashlib.sha256(data).hexdigest(),
        sizeBytes=len(data),
        imagePath=str(image_path),
    )
    metadata_path.write_text(json.dumps(asdict(frame), indent=2), encoding="utf-8")
    return frame


def run_doctor_from_env(*, check_api: bool, check_rtsp: bool, as_json: bool = False) -> int:
    try:
        config = _config_from_env()
    except Exception as exc:
        result = DoctorResult(
            ok=False,
            checks=[DoctorCheck("config.env", "fail", _safe_error(exc))],
        )
        _print_doctor_result(result, as_json=as_json)
        return 1
    result = run_doctor(config, check_api=check_api, check_rtsp=check_rtsp)
    _print_doctor_result(result, as_json=as_json)
    return 0 if result.ok else 1


def run_doctor(config: AgentConfig, *, check_api: bool = True, check_rtsp: bool = True) -> DoctorResult:
    checks: list[DoctorCheck] = []
    checks.extend(_check_config_values(config))
    checks.append(_check_system_clock())
    checks.append(_check_spool_dir(config))
    checks.append(_check_ffmpeg_available(config))
    if check_api:
        checks.append(_check_api_device_config(config))
    if check_rtsp:
        checks.append(_check_frame_capture(config))
    return DoctorResult(ok=not any(check.status == "fail" for check in checks), checks=checks)


def _check_config_values(config: AgentConfig) -> list[DoctorCheck]:
    checks: list[DoctorCheck] = []
    if config.api_base_url.startswith("https://"):
        checks.append(DoctorCheck("config.api_base_url", "pass", "https endpoint configured"))
    else:
        checks.append(DoctorCheck("config.api_base_url", "warn", "non-https endpoint; use HTTPS for real deployment"))

    if config.device_token.startswith("fwcam_") and "REPLACE_WITH" not in config.device_token:
        checks.append(DoctorCheck("config.device_token", "pass", "device token format looks valid"))
    else:
        checks.append(DoctorCheck("config.device_token", "fail", "device token must be the issued fwcam_ token"))

    if config.frame_source in SUPPORTED_FRAME_SOURCES:
        checks.append(DoctorCheck("config.frame_source", "pass", config.frame_source))
    else:
        checks.append(DoctorCheck("config.frame_source", "fail", "must be one of: rtsp, http_snapshot"))

    if config.frame_source == "rtsp":
        rtsp_url = config.rtsp_url or ""
        if "camera-user" in rtsp_url or "camera-password" in rtsp_url:
            checks.append(DoctorCheck("config.rtsp_url", "fail", "RTSP URL still contains placeholder credentials"))
        elif rtsp_url.lower().startswith("rtsp://"):
            checks.append(DoctorCheck("config.rtsp_url", "pass", "RTSP URL is configured"))
        else:
            checks.append(DoctorCheck("config.rtsp_url", "fail", "RTSP URL must start with rtsp://"))
    elif config.frame_source == "http_snapshot":
        snapshot_url = config.snapshot_url or ""
        if snapshot_url.lower().startswith(("http://", "https://")):
            checks.append(DoctorCheck("config.snapshot_url", "pass", "HTTP snapshot URL is configured"))
        else:
            checks.append(DoctorCheck("config.snapshot_url", "fail", "snapshot URL must start with http:// or https://"))
        if "REPLACE_WITH" in (config.snapshot_username or "") or "REPLACE_WITH" in (config.snapshot_password or ""):
            checks.append(DoctorCheck("config.snapshot_auth", "fail", "snapshot credentials still contain placeholders"))
        elif config.snapshot_username or config.snapshot_password:
            checks.append(DoctorCheck("config.snapshot_auth", "pass", "basic auth configured"))
        else:
            checks.append(DoctorCheck("config.snapshot_auth", "warn", "no snapshot basic auth configured"))

    if config.interval_seconds > 0:
        checks.append(DoctorCheck("config.interval_seconds", "pass", str(config.interval_seconds)))
    else:
        checks.append(DoctorCheck("config.interval_seconds", "fail", "must be positive"))

    if config.local_spool_hours > 0:
        checks.append(DoctorCheck("config.local_spool_hours", "pass", str(config.local_spool_hours)))
    else:
        checks.append(DoctorCheck("config.local_spool_hours", "fail", "must be positive"))

    if config.http_timeout_seconds > 0:
        checks.append(DoctorCheck("config.http_timeout_seconds", "pass", str(config.http_timeout_seconds)))
    else:
        checks.append(DoctorCheck("config.http_timeout_seconds", "fail", "must be positive"))

    if config.timestamp_overlay_enabled:
        try:
            _timestamp_overlay_text(datetime.now(timezone.utc), config.timestamp_overlay_timezone)
        except Exception as exc:
            checks.append(DoctorCheck("config.timestamp_overlay", "fail", _safe_error(exc)))
        else:
            detail = config.timestamp_overlay_timezone or "system local timezone"
            checks.append(DoctorCheck("config.timestamp_overlay", "pass", detail))
    else:
        checks.append(DoctorCheck("config.timestamp_overlay", "warn", "disabled"))
    return checks


def _check_system_clock() -> DoctorCheck:
    now = datetime.now(timezone.utc)
    if now.year >= 2024:
        return DoctorCheck("system.clock", "pass", now.isoformat())
    return DoctorCheck("system.clock", "fail", f"clock looks wrong: {now.isoformat()}")


def _check_spool_dir(config: AgentConfig) -> DoctorCheck:
    try:
        pending_dir = config.spool_dir / "pending"
        pending_dir.mkdir(parents=True, exist_ok=True)
        probe = pending_dir / ".doctor-write-test"
        probe.write_text("ok", encoding="utf-8")
        if probe.read_text(encoding="utf-8") != "ok":
            raise CameraAgentError("spool_probe_readback_failed")
        probe.unlink(missing_ok=True)
    except Exception as exc:
        return DoctorCheck("spool.write", "fail", _safe_error(exc))
    return DoctorCheck("spool.write", "pass", str(config.spool_dir))


def _check_ffmpeg_available(config: AgentConfig) -> DoctorCheck:
    if config.frame_source == "http_snapshot" and not config.timestamp_overlay_enabled:
        return DoctorCheck("ffmpeg.available", "warn", "not required for HTTP snapshot with timestamp overlay disabled")
    try:
        completed = subprocess.run(
            [config.ffmpeg_path, "-version"],
            capture_output=True,
            text=True,
            timeout=10,
        )
    except Exception as exc:
        return DoctorCheck("ffmpeg.available", "fail", _safe_error(exc))
    if completed.returncode != 0:
        return DoctorCheck("ffmpeg.available", "fail", _safe_error(CameraAgentError(completed.stderr)))
    first_line = (completed.stdout or "").splitlines()[0] if completed.stdout else config.ffmpeg_path
    return DoctorCheck("ffmpeg.available", "pass", first_line[:160])


def _check_api_device_config(config: AgentConfig) -> DoctorCheck:
    try:
        payload = CameraIngestClient(config).get_config()
    except Exception as exc:
        return DoctorCheck("api.device_config", "fail", _safe_error(exc))
    if payload.get("status") != "active":
        return DoctorCheck("api.device_config", "fail", f"camera status is {payload.get('status')}")
    if payload.get("rtspConfigured") is not True:
        return DoctorCheck("api.device_config", "warn", "camera record has rtspConfigured=false")
    return DoctorCheck(
        "api.device_config",
        "pass",
        f"camera={payload.get('cameraId')} interval={payload.get('samplingIntervalSeconds')}s",
    )


def _check_frame_capture(config: AgentConfig) -> DoctorCheck:
    if config.frame_source == "http_snapshot":
        return _check_http_snapshot_capture(config)
    return _check_rtsp_capture(config)


def _check_rtsp_capture(config: AgentConfig) -> DoctorCheck:
    image_path = config.spool_dir / "pending" / ".doctor-rtsp.jpg"
    try:
        _capture_rtsp_image(config, image_path, timeout_seconds=30)
        size_bytes = image_path.stat().st_size
        if size_bytes <= 0:
            raise CameraAgentError("rtsp_capture_empty")
    except Exception as exc:
        image_path.unlink(missing_ok=True)
        return DoctorCheck("rtsp.capture", "fail", _safe_error(exc))
    image_path.unlink(missing_ok=True)
    return DoctorCheck("rtsp.capture", "pass", f"captured {size_bytes} bytes")


def _check_http_snapshot_capture(config: AgentConfig) -> DoctorCheck:
    image_path = config.spool_dir / "pending" / ".doctor-http-snapshot.jpg"
    try:
        _capture_http_snapshot_image(config, image_path, timeout_seconds=30)
        size_bytes = image_path.stat().st_size
        if size_bytes <= 0:
            raise CameraAgentError("http_snapshot_capture_empty")
    except Exception as exc:
        image_path.unlink(missing_ok=True)
        return DoctorCheck("http_snapshot.capture", "fail", _safe_error(exc))
    image_path.unlink(missing_ok=True)
    return DoctorCheck("http_snapshot.capture", "pass", f"captured {size_bytes} bytes")


def _capture_source_image(config: AgentConfig, image_path: Path, *, timeout_seconds: int = 30) -> None:
    if config.frame_source == "rtsp":
        _capture_rtsp_image(config, image_path, timeout_seconds=timeout_seconds)
        return
    if config.frame_source == "http_snapshot":
        _capture_http_snapshot_image(config, image_path, timeout_seconds=timeout_seconds)
        return
    raise CameraAgentError(f"unsupported_frame_source:{config.frame_source}")


def _capture_rtsp_image(config: AgentConfig, image_path: Path, *, timeout_seconds: int = 30) -> None:
    if not config.rtsp_url:
        raise CameraAgentError("missing_env:CAMERA_AGENT_RTSP_URL")
    command = [
        config.ffmpeg_path,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-rtsp_transport",
        "tcp",
        "-i",
        config.rtsp_url,
        "-frames:v",
        "1",
        "-q:v",
        "3",
        str(image_path),
    ]
    completed = subprocess.run(command, capture_output=True, text=True, timeout=timeout_seconds)
    if completed.returncode != 0:
        image_path.unlink(missing_ok=True)
        raise CameraAgentError(f"ffmpeg_capture_failed:{_redact_sensitive(completed.stderr).strip()[:200]}")


def _capture_http_snapshot_image(config: AgentConfig, image_path: Path, *, timeout_seconds: int = 30) -> None:
    if not config.snapshot_url:
        raise CameraAgentError("missing_env:CAMERA_AGENT_SNAPSHOT_URL")
    headers = {
        "Accept": "image/jpeg,*/*",
        "User-Agent": "fourwall-camera-agent/1.0",
    }
    if config.snapshot_username or config.snapshot_password:
        credentials = f"{config.snapshot_username or ''}:{config.snapshot_password or ''}".encode("utf-8")
        headers["Authorization"] = "Basic " + base64.b64encode(credentials).decode("ascii")
    request = Request(config.snapshot_url, method="GET", headers=headers)
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            status_code = getattr(response, "status", 200)
            if status_code >= 400:
                raise CameraAgentError(f"http_snapshot_failed:{status_code}")
            data = response.read(MAX_CAPTURE_BYTES + 1)
    except HTTPError as exc:
        raise CameraAgentError(f"http_snapshot_failed:{exc.code}") from exc
    except URLError as exc:
        raise CameraAgentError(f"http_snapshot_failed:{_redact_sensitive(str(exc.reason))}") from exc

    if len(data) > MAX_CAPTURE_BYTES:
        raise CameraAgentError("http_snapshot_too_large")
    if not data.startswith(b"\xff\xd8"):
        raise CameraAgentError("http_snapshot_not_jpeg")
    image_path.write_bytes(data)


def _apply_timestamp_overlay(config: AgentConfig, image_path: Path, captured_at: datetime) -> None:
    if not config.timestamp_overlay_enabled:
        return
    timestamp_path = image_path.with_name(f"{image_path.stem}.timestamp.txt")
    overlay_path = image_path.with_name(f"{image_path.stem}.overlay.jpg")
    timestamp_path.write_text(_timestamp_overlay_text(captured_at, config.timestamp_overlay_timezone), encoding="utf-8")
    drawtext_options = [
        f"textfile={_escape_drawtext_value(str(timestamp_path))}",
        "x=8",
        "y=8",
        "fontsize=24",
        "fontcolor=white",
        "box=1",
        "boxcolor=black@0.75",
        "boxborderw=6",
    ]
    if config.timestamp_overlay_font_file:
        drawtext_options.insert(0, f"fontfile={_escape_drawtext_value(config.timestamp_overlay_font_file)}")
    command = [
        config.ffmpeg_path,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(image_path),
        "-vf",
        "drawtext=" + ":".join(drawtext_options),
        "-frames:v",
        "1",
        "-q:v",
        "3",
        str(overlay_path),
    ]
    try:
        completed = subprocess.run(command, capture_output=True, text=True, timeout=15)
        if completed.returncode != 0:
            overlay_path.unlink(missing_ok=True)
            raise CameraAgentError(f"timestamp_overlay_failed:{_redact_sensitive(completed.stderr).strip()[:200]}")
        overlay_path.replace(image_path)
    finally:
        timestamp_path.unlink(missing_ok=True)


def _timestamp_overlay_text(captured_at: datetime, timezone_name: str | None) -> str:
    if timezone_name:
        try:
            display_at = captured_at.astimezone(ZoneInfo(timezone_name))
        except ZoneInfoNotFoundError as exc:
            raise CameraAgentError(f"invalid_timestamp_timezone:{timezone_name}") from exc
    else:
        display_at = captured_at.astimezone()
    return display_at.strftime("%Y-%m-%d %H:%M:%S %z")


def _escape_drawtext_value(value: str) -> str:
    return (
        value.replace("\\", "\\\\")
        .replace(":", "\\:")
        .replace(",", "\\,")
        .replace("'", "\\'")
    )


def _print_doctor_result(result: DoctorResult, *, as_json: bool) -> None:
    if as_json:
        print(json.dumps({"ok": result.ok, "checks": [asdict(check) for check in result.checks]}, indent=2))
        return
    for check in result.checks:
        print(f"[{check.status.upper()}] {check.name}: {check.detail}")
    print(f"ok={str(result.ok).lower()}")


def flush_pending(config: AgentConfig, client: CameraIngestClient) -> int:
    flushed = 0
    for metadata_path in sorted((config.spool_dir / "pending").glob("*.json")):
        frame = _read_pending_frame(metadata_path)
        image_path = Path(frame.imagePath)
        if not image_path.exists():
            metadata_path.unlink(missing_ok=True)
            continue
        try:
            intent = client.create_upload_intent(frame)
            client.upload_frame(intent, frame)
            client.complete_upload(frame)
        except (HTTPError, URLError, CameraAgentError):
            continue
        image_path.unlink(missing_ok=True)
        metadata_path.unlink(missing_ok=True)
        flushed += 1
    return flushed


def purge_expired_pending(config: AgentConfig) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=config.local_spool_hours)
    purged = 0
    for metadata_path in (config.spool_dir / "pending").glob("*.json"):
        if datetime.fromtimestamp(metadata_path.stat().st_mtime, timezone.utc) >= cutoff:
            continue
        frame = _read_pending_frame(metadata_path)
        Path(frame.imagePath).unlink(missing_ok=True)
        metadata_path.unlink(missing_ok=True)
        purged += 1
    return purged


def count_pending(config: AgentConfig) -> int:
    return len(list((config.spool_dir / "pending").glob("*.json")))


def _read_pending_frame(metadata_path: Path) -> PendingFrame:
    payload = json.loads(metadata_path.read_text(encoding="utf-8"))
    return PendingFrame(**payload)


def _metadata_path(config: AgentConfig, frame_id: str) -> Path:
    return config.spool_dir / "pending" / f"{frame_id}.json"


def _config_from_env() -> AgentConfig:
    api_base_url = _required_env("CAMERA_AGENT_API_BASE_URL")
    device_token = _required_env("CAMERA_AGENT_DEVICE_TOKEN")
    frame_source = os.getenv("CAMERA_AGENT_FRAME_SOURCE", DEFAULT_FRAME_SOURCE).strip().lower().replace("-", "_")
    if frame_source not in SUPPORTED_FRAME_SOURCES:
        raise CameraAgentError("invalid_env:CAMERA_AGENT_FRAME_SOURCE")
    rtsp_url = os.getenv("CAMERA_AGENT_RTSP_URL", "").strip() or None
    snapshot_url = os.getenv("CAMERA_AGENT_SNAPSHOT_URL", "").strip() or None
    if frame_source == "rtsp" and not rtsp_url:
        rtsp_url = _required_env("CAMERA_AGENT_RTSP_URL")
    if frame_source == "http_snapshot" and not snapshot_url:
        snapshot_url = _required_env("CAMERA_AGENT_SNAPSHOT_URL")
    return AgentConfig(
        api_base_url=api_base_url,
        device_token=device_token,
        frame_source=frame_source,
        rtsp_url=rtsp_url,
        snapshot_url=snapshot_url,
        snapshot_username=os.getenv("CAMERA_AGENT_SNAPSHOT_USERNAME", "").strip() or None,
        snapshot_password=os.getenv("CAMERA_AGENT_SNAPSHOT_PASSWORD", "").strip() or None,
        spool_dir=Path(os.getenv("CAMERA_AGENT_SPOOL_DIR", "./camera-agent-spool")),
        ffmpeg_path=os.getenv("CAMERA_AGENT_FFMPEG_PATH", "ffmpeg"),
        interval_seconds=_env_int("CAMERA_AGENT_INTERVAL_SECONDS", DEFAULT_INTERVAL_SECONDS),
        local_spool_hours=_env_int("CAMERA_AGENT_LOCAL_SPOOL_HOURS", DEFAULT_SPOOL_HOURS),
        http_timeout_seconds=_env_int("CAMERA_AGENT_HTTP_TIMEOUT_SECONDS", DEFAULT_HTTP_TIMEOUT_SECONDS),
        timestamp_overlay_enabled=_env_bool(
            "CAMERA_AGENT_TIMESTAMP_OVERLAY_ENABLED",
            DEFAULT_TIMESTAMP_OVERLAY_ENABLED,
        ),
        timestamp_overlay_timezone=os.getenv("CAMERA_AGENT_TIMESTAMP_OVERLAY_TIMEZONE", "").strip() or None,
        timestamp_overlay_font_file=os.getenv(
            "CAMERA_AGENT_TIMESTAMP_FONT_FILE",
            DEFAULT_TIMESTAMP_FONT_FILE,
        ).strip(),
    )


def _required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise CameraAgentError(f"missing_env:{name}")
    return value


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name, "").strip()
    return int(value) if value else default


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name, "").strip().lower()
    if not value:
        return default
    return value in {"1", "true", "yes", "on"}


def _safe_error(exc: Exception) -> str:
    text = _redact_sensitive(str(exc)).replace("\n", " ").replace("\r", " ").strip()
    return text[:240] or exc.__class__.__name__


def _redact_sensitive(text: str) -> str:
    redacted = RTSP_URL_PATTERN.sub("rtsp://<redacted>", text)
    redacted = HTTP_USERINFO_URL_PATTERN.sub(r"\1<redacted>@", redacted)
    redacted = BASIC_AUTH_PATTERN.sub(r"\1<redacted>", redacted)
    return redacted


if __name__ == "__main__":
    raise SystemExit(main())
