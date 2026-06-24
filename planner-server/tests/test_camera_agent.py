from datetime import datetime, timezone
import hashlib
from pathlib import Path
import subprocess
from urllib.request import Request

from scripts import camera_agent
from scripts.camera_agent import AgentConfig, CameraAgentError, _check_config_values, _safe_error, run_doctor


def test_safe_error_redacts_rtsp_url_credentials() -> None:
    rtsp_url = "rtsp:/" + "/user:pass@example.invalid/stream"
    error = CameraAgentError(f"ffmpeg_capture_failed: {rtsp_url} failed")

    message = _safe_error(error)

    assert "user:pass" not in message
    assert "example.invalid" not in message
    assert "rtsp://<redacted>" in message


def test_safe_error_redacts_http_snapshot_credentials_and_basic_auth() -> None:
    error = CameraAgentError(
        "http://camera-user:camera-pass@192.168.0.10:554/snapshot failed Authorization: Basic abc123=="
    )

    message = _safe_error(error)

    assert "camera-user" not in message
    assert "camera-pass" not in message
    assert "abc123" not in message
    assert "http://<redacted>@" in message
    assert "Authorization: Basic <redacted>" in message


def test_camera_agent_doctor_passes_with_api_ffmpeg_spool_and_rtsp(monkeypatch, tmp_path: Path) -> None:
    config = _agent_config(tmp_path)

    class FakeClient:
        def __init__(self, _config):
            pass

        def get_config(self):
            return {
                "cameraId": "camera-1",
                "status": "active",
                "rtspConfigured": True,
                "samplingIntervalSeconds": 10,
            }

    def fake_run(command, capture_output, text, timeout):
        if command[-1] == "-version":
            return subprocess.CompletedProcess(command, 0, stdout="ffmpeg version 6.1\n", stderr="")
        Path(command[-1]).write_bytes(b"jpeg")
        return subprocess.CompletedProcess(command, 0, stdout="", stderr="")

    monkeypatch.setattr(camera_agent, "CameraIngestClient", FakeClient)
    monkeypatch.setattr(camera_agent.subprocess, "run", fake_run)

    result = run_doctor(config)

    assert result.ok is True
    statuses = {check.name: check.status for check in result.checks}
    assert statuses["spool.write"] == "pass"
    assert statuses["ffmpeg.available"] == "pass"
    assert statuses["api.device_config"] == "pass"
    assert statuses["rtsp.capture"] == "pass"


def test_camera_agent_doctor_supports_http_snapshot_without_ffmpeg(monkeypatch, tmp_path: Path) -> None:
    config = _agent_config(
        tmp_path,
        frame_source="http_snapshot",
        rtsp_url=None,
        snapshot_url="http://192.168.0.10:554/cgi-bin/guest/Video.cgi?media=JPEG&channel=1",
        snapshot_username="camera-user",
        snapshot_password="camera-pass",
        timestamp_overlay_enabled=False,
    )

    class FakeClient:
        def __init__(self, _config):
            pass

        def get_config(self):
            return {
                "cameraId": "camera-1",
                "status": "active",
                "rtspConfigured": True,
                "samplingIntervalSeconds": 10,
            }

    def fake_urlopen(request: Request, timeout: int):
        assert request.get_header("Authorization", "").startswith("Basic ")

        class FakeResponse:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def read(self, _limit):
                return b"\xff\xd8snapshot-jpeg\xff\xd9"

        return FakeResponse()

    monkeypatch.setattr(camera_agent, "CameraIngestClient", FakeClient)
    monkeypatch.setattr(camera_agent, "urlopen", fake_urlopen)

    result = run_doctor(config)

    assert result.ok is True
    statuses = {check.name: check.status for check in result.checks}
    assert statuses["config.frame_source"] == "pass"
    assert statuses["config.snapshot_url"] == "pass"
    assert statuses["config.snapshot_auth"] == "pass"
    assert statuses["ffmpeg.available"] == "warn"
    assert statuses["http_snapshot.capture"] == "pass"


def test_camera_agent_doctor_config_checks_reject_placeholders(tmp_path: Path) -> None:
    config = _agent_config(
        tmp_path,
        device_token="REPLACE_WITH_FWCAM_DEVICE_TOKEN",
        rtsp_url="rtsp://camera-user:camera-password@192.168.1.31/stream",
    )

    checks = _check_config_values(config)

    failures = {check.name for check in checks if check.status == "fail"}
    assert "config.device_token" in failures
    assert "config.rtsp_url" in failures


def test_camera_agent_doctor_config_checks_reject_snapshot_placeholders(tmp_path: Path) -> None:
    config = _agent_config(
        tmp_path,
        frame_source="http_snapshot",
        rtsp_url=None,
        snapshot_url="http://192.168.0.10:554/cgi-bin/guest/Video.cgi?media=JPEG&channel=1",
        snapshot_username="REPLACE_WITH_CAMERA_USER",
        snapshot_password="REPLACE_WITH_CAMERA_PASSWORD",
        timestamp_overlay_enabled=False,
    )

    checks = _check_config_values(config)

    failures = {check.name for check in checks if check.status == "fail"}
    assert "config.snapshot_auth" in failures


def test_capture_frame_overlays_pi_timestamp_before_checksum(monkeypatch, tmp_path: Path) -> None:
    config = _agent_config(tmp_path, timestamp_overlay_timezone="Asia/Taipei")
    (config.spool_dir / "pending").mkdir(parents=True)
    calls = []

    def fake_run(command, capture_output, text, timeout):
        calls.append(command)
        Path(command[-1]).write_bytes(b"overlay-jpeg" if "-vf" in command else b"raw-jpeg")
        return subprocess.CompletedProcess(command, 0, stdout="", stderr="")

    monkeypatch.setattr(camera_agent.subprocess, "run", fake_run)

    frame = camera_agent.capture_frame(config)

    assert Path(frame.imagePath).read_bytes() == b"overlay-jpeg"
    assert frame.checksumSha256 == hashlib.sha256(b"overlay-jpeg").hexdigest()
    assert frame.sizeBytes == len(b"overlay-jpeg")
    assert len(calls) == 2
    overlay_filter = calls[1][calls[1].index("-vf") + 1]
    assert overlay_filter.startswith("drawtext=")
    assert "fontcolor=white" in overlay_filter


def test_capture_frame_supports_http_snapshot_source(monkeypatch, tmp_path: Path) -> None:
    config = _agent_config(
        tmp_path,
        frame_source="http_snapshot",
        rtsp_url=None,
        snapshot_url="http://192.168.0.10:554/cgi-bin/guest/Video.cgi?media=JPEG&channel=1",
        snapshot_username="camera-user",
        snapshot_password="camera-pass",
        timestamp_overlay_enabled=False,
    )
    (config.spool_dir / "pending").mkdir(parents=True)
    image_bytes = b"\xff\xd8snapshot-jpeg\xff\xd9"

    def fake_urlopen(request: Request, timeout: int):
        assert request.full_url.endswith("channel=1")
        assert request.get_header("Authorization", "").startswith("Basic ")

        class FakeResponse:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def read(self, _limit):
                return image_bytes

        return FakeResponse()

    monkeypatch.setattr(camera_agent, "urlopen", fake_urlopen)

    frame = camera_agent.capture_frame(config)

    assert Path(frame.imagePath).read_bytes() == image_bytes
    assert frame.checksumSha256 == hashlib.sha256(image_bytes).hexdigest()
    assert frame.sizeBytes == len(image_bytes)


def test_timestamp_overlay_uses_configured_timezone() -> None:
    captured_at = datetime(2026, 6, 19, 17, 28, 25, tzinfo=timezone.utc)

    text = camera_agent._timestamp_overlay_text(captured_at, "Asia/Taipei")

    assert text == "2026-06-20 01:28:25 +0800"


def _agent_config(
    tmp_path: Path,
    *,
    device_token: str = "fwcam_test_device_token",
    frame_source: str = "rtsp",
    rtsp_url: str | None = "rtsp:/" + "/user:pass@192.168.1.31/stream",
    snapshot_url: str | None = None,
    snapshot_username: str | None = None,
    snapshot_password: str | None = None,
    timestamp_overlay_enabled: bool = True,
    timestamp_overlay_timezone: str | None = None,
) -> AgentConfig:
    return AgentConfig(
        api_base_url="https://api.example.com",
        device_token=device_token,
        frame_source=frame_source,
        rtsp_url=rtsp_url,
        snapshot_url=snapshot_url,
        snapshot_username=snapshot_username,
        snapshot_password=snapshot_password,
        spool_dir=tmp_path / "spool",
        ffmpeg_path="ffmpeg",
        interval_seconds=10,
        local_spool_hours=24,
        http_timeout_seconds=30,
        timestamp_overlay_enabled=timestamp_overlay_enabled,
        timestamp_overlay_timezone=timestamp_overlay_timezone,
        timestamp_overlay_font_file="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    )
