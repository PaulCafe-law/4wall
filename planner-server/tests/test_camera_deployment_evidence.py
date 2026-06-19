from __future__ import annotations

import json

from scripts import camera_deployment_evidence
from scripts.camera_deployment_evidence import build_report


def test_camera_deployment_evidence_report_passes_with_required_outputs() -> None:
    report = build_report(
        deployment_name="factory-camera",
        environment="staging",
        readiness_payloads=[_readiness_payload(include_runtime=True, include_storage=True)],
        smoke_payloads=[_smoke_payload(analysis_status="succeeded")],
        pi_doctor_payloads=[_pi_doctor_payload()],
    )

    assert report.ok is True
    statuses = {item.name: item.status for item in report.items}
    assert statuses == {
        "render.blueprint": "pass",
        "runtime.environment": "pass",
        "storage.live_probe": "pass",
        "synthetic.upload": "pass",
        "synthetic.analysis": "pass",
        "pi.doctor": "pass",
    }


def test_camera_deployment_evidence_report_marks_missing_live_outputs() -> None:
    report = build_report(
        deployment_name="factory-camera",
        environment="production",
        readiness_payloads=[_readiness_payload(include_runtime=False, include_storage=False)],
        smoke_payloads=[],
        pi_doctor_payloads=[],
    )

    assert report.ok is False
    statuses = {item.name: item.status for item in report.items}
    assert statuses["render.blueprint"] == "pass"
    assert statuses["runtime.environment"] == "missing"
    assert statuses["storage.live_probe"] == "missing"
    assert statuses["synthetic.upload"] == "missing"
    assert statuses["synthetic.analysis"] == "missing"
    assert statuses["pi.doctor"] == "missing"


def test_camera_deployment_evidence_report_rejects_queued_analysis_and_skipped_pi_doctor_checks() -> None:
    report = build_report(
        deployment_name="factory-camera",
        environment="staging",
        readiness_payloads=[_readiness_payload(include_runtime=True, include_storage=True)],
        smoke_payloads=[_smoke_payload(analysis_status="queued")],
        pi_doctor_payloads=[{"ok": True, "checks": [{"name": "config.device_token", "status": "pass", "detail": "ok"}]}],
    )

    assert report.ok is False
    statuses = {item.name: item.status for item in report.items}
    assert statuses["synthetic.analysis"] == "fail"
    assert statuses["pi.doctor"] == "fail"


def test_camera_deployment_evidence_cli_writes_report_without_echoing_secret_input(tmp_path) -> None:
    readiness_path = tmp_path / "readiness.json"
    smoke_path = tmp_path / "smoke.json"
    doctor_path = tmp_path / "doctor.json"
    output_path = tmp_path / "report.json"
    readiness_path.write_text(json.dumps(_readiness_payload(include_runtime=True, include_storage=True)), encoding="utf-8")
    smoke_path.write_text(json.dumps(_smoke_payload(analysis_status="skipped")), encoding="utf-8")
    doctor_payload = _pi_doctor_payload()
    doctor_payload["deviceToken"] = "fwcam_secret_device_token"
    doctor_payload["rtspUrl"] = "rtsp:/" + "/user:pass@192.168.1.31/stream"
    doctor_path.write_text(json.dumps(doctor_payload), encoding="utf-8")

    exit_code = camera_deployment_evidence.main(
        [
            "--deployment-name",
            "factory-camera-staging",
            "--environment",
            "staging",
            "--readiness-json",
            str(readiness_path),
            "--smoke-json",
            str(smoke_path),
            "--pi-doctor-json",
            str(doctor_path),
            "--output",
            str(output_path),
        ]
    )

    rendered = output_path.read_text(encoding="utf-8")
    assert exit_code == 0
    assert "factory-camera-staging" in rendered
    assert "fwcam_secret_device_token" not in rendered
    assert "user:pass" not in rendered


def test_camera_deployment_evidence_loads_powershell_redirected_utf16_json(tmp_path) -> None:
    path = tmp_path / "readiness.json"
    path.write_text(json.dumps(_readiness_payload(include_runtime=False, include_storage=False)), encoding="utf-16")

    payload = camera_deployment_evidence.load_json(path)

    assert payload["checks"][0]["name"] == "render.blueprint.services"


def _readiness_payload(*, include_runtime: bool, include_storage: bool) -> dict:
    checks = [{"name": "render.blueprint.services", "status": "pass", "detail": "8 services parsed"}]
    if include_runtime:
        checks.extend(
            [
                {"name": "runtime.environment", "status": "pass", "detail": "staging"},
                {"name": "runtime.validate_runtime", "status": "pass", "detail": "ok"},
                {"name": "runtime.database", "status": "pass", "detail": "non-sqlite"},
                {"name": "runtime.artifact_backend", "status": "pass", "detail": "s3"},
                {"name": "runtime.camera_analysis_provider", "status": "pass", "detail": "ollama"},
            ]
        )
    if include_storage:
        checks.extend(
            [
                {"name": "storage_live.write", "status": "pass", "detail": "camera-readiness/staging/probe.txt"},
                {"name": "storage_live.read", "status": "pass", "detail": "readback matched probe payload"},
                {"name": "storage_live.delete", "status": "pass", "detail": "probe object deleted"},
            ]
        )
    return {"ok": True, "checks": checks}


def _smoke_payload(*, analysis_status: str) -> dict:
    return {
        "ok": True,
        "frameId": "smoke-frame-1",
        "cameraId": "camera-1",
        "uploadStatus": "uploaded",
        "analysisStatus": analysis_status,
    }


def _pi_doctor_payload() -> dict:
    return {
        "ok": True,
        "checks": [
            {"name": name, "status": "pass", "detail": "ok"}
            for name in (
                "config.device_token",
                "config.rtsp_url",
                "system.clock",
                "spool.write",
                "ffmpeg.available",
                "api.device_config",
                "rtsp.capture",
            )
        ],
    }
