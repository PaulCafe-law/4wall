from pathlib import Path
import subprocess

from scripts import camera_agent
from scripts.camera_agent import AgentConfig, CameraAgentError, _check_config_values, _safe_error, run_doctor


def test_safe_error_redacts_rtsp_url_credentials() -> None:
    rtsp_url = "rtsp:/" + "/user:pass@example.invalid/stream"
    error = CameraAgentError(f"ffmpeg_capture_failed: {rtsp_url} failed")

    message = _safe_error(error)

    assert "user:pass" not in message
    assert "example.invalid" not in message
    assert "rtsp://<redacted>" in message


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


def _agent_config(
    tmp_path: Path,
    *,
    device_token: str = "fwcam_test_device_token",
    rtsp_url: str = "rtsp:/" + "/user:pass@192.168.1.31/stream",
) -> AgentConfig:
    return AgentConfig(
        api_base_url="https://api.example.com",
        device_token=device_token,
        rtsp_url=rtsp_url,
        spool_dir=tmp_path / "spool",
        ffmpeg_path="ffmpeg",
        interval_seconds=10,
        local_spool_hours=24,
        http_timeout_seconds=30,
    )
