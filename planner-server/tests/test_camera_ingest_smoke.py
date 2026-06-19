from __future__ import annotations

import pytest

from scripts.camera_ingest_smoke import CameraSmokeClient


def test_camera_smoke_wait_for_analysis_accepts_succeeded(monkeypatch) -> None:
    client = CameraSmokeClient("https://api.example.com", "fwcam_test", 1)
    statuses = iter(
        [
            {"frameId": "frame-1", "analysisStatus": "queued"},
            {"frameId": "frame-1", "analysisStatus": "succeeded"},
        ]
    )
    monkeypatch.setattr(client, "frame_status", lambda _frame_id: next(statuses))
    monkeypatch.setattr("scripts.camera_ingest_smoke.time.sleep", lambda _seconds: None)

    frame = client.wait_for_analysis(
        "frame-1",
        timeout_seconds=10,
        poll_seconds=0.1,
        required_status=None,
    )

    assert frame["analysisStatus"] == "succeeded"


def test_camera_smoke_wait_for_analysis_rejects_failed() -> None:
    client = CameraSmokeClient("https://api.example.com", "fwcam_test", 1)
    client.frame_status = lambda _frame_id: {  # type: ignore[method-assign]
        "frameId": "frame-1",
        "analysisStatus": "failed",
        "errorMessage": "all_watch_zone_analysis_failed",
    }

    with pytest.raises(RuntimeError, match="analysis_failed:all_watch_zone_analysis_failed"):
        client.wait_for_analysis(
            "frame-1",
            timeout_seconds=10,
            poll_seconds=0.1,
            required_status=None,
        )


def test_camera_smoke_wait_for_analysis_can_require_succeeded() -> None:
    client = CameraSmokeClient("https://api.example.com", "fwcam_test", 1)
    client.frame_status = lambda _frame_id: {  # type: ignore[method-assign]
        "frameId": "frame-1",
        "analysisStatus": "skipped",
        "errorMessage": "no_active_watch_zones",
    }

    with pytest.raises(RuntimeError, match="unexpected_analysis_status:skipped"):
        client.wait_for_analysis(
            "frame-1",
            timeout_seconds=10,
            poll_seconds=0.1,
            required_status="succeeded",
        )
