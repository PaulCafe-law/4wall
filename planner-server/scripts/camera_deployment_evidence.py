from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any, Literal, Sequence


Status = Literal["pass", "fail", "missing", "warn"]

REQUIRED_STORAGE_CHECKS = ("storage_live.write", "storage_live.read", "storage_live.delete")
REQUIRED_PI_DOCTOR_CHECKS = (
    "config.device_token",
    "config.rtsp_url",
    "system.clock",
    "spool.write",
    "ffmpeg.available",
    "api.device_config",
    "rtsp.capture",
)
DEFAULT_ACCEPTED_ANALYSIS_STATUSES = ("succeeded", "skipped")


@dataclass(frozen=True)
class EvidenceItem:
    name: str
    status: Status
    detail: str


@dataclass(frozen=True)
class EvidenceReport:
    ok: bool
    deployment_name: str
    environment: str | None
    generated_at: str
    items: list[EvidenceItem]

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "deploymentName": self.deployment_name,
            "environment": self.environment,
            "generatedAt": self.generated_at,
            "items": [asdict(item) for item in self.items],
        }


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a Factory Camera deployment evidence report from JSON outputs.")
    parser.add_argument("--deployment-name", default="factory-camera")
    parser.add_argument("--environment", choices=["staging", "production"], help="Target deployment environment.")
    parser.add_argument(
        "--readiness-json",
        action="append",
        type=Path,
        default=[],
        help="JSON output from scripts/camera_deployment_readiness.py. May be passed more than once.",
    )
    parser.add_argument(
        "--smoke-json",
        action="append",
        type=Path,
        default=[],
        help="JSON output from scripts/camera_ingest_smoke.py. May be passed more than once.",
    )
    parser.add_argument(
        "--pi-doctor-json",
        action="append",
        type=Path,
        default=[],
        help="JSON output from scripts/camera_agent.py --doctor --json on the Pi.",
    )
    parser.add_argument(
        "--accepted-analysis-status",
        action="append",
        choices=["succeeded", "skipped"],
        default=[],
        help="Final analysis statuses accepted as worker evidence. Defaults to succeeded and skipped.",
    )
    parser.add_argument("--output", type=Path, help="Write report JSON to this path instead of stdout.")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    report = build_report(
        deployment_name=args.deployment_name,
        environment=args.environment,
        readiness_payloads=[load_json(path) for path in args.readiness_json],
        smoke_payloads=[load_json(path) for path in args.smoke_json],
        pi_doctor_payloads=[load_json(path) for path in args.pi_doctor_json],
        accepted_analysis_statuses=tuple(args.accepted_analysis_status or DEFAULT_ACCEPTED_ANALYSIS_STATUSES),
    )
    output = json.dumps(report.to_dict(), ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output + "\n", encoding="utf-8")
    else:
        print(output)
    return 0 if report.ok else 1


def load_json(path: Path) -> dict[str, Any]:
    payload = None
    last_error: UnicodeError | None = None
    for encoding in ("utf-8", "utf-8-sig", "utf-16"):
        try:
            payload = json.loads(path.read_text(encoding=encoding))
            break
        except UnicodeError as exc:
            last_error = exc
            continue
    if payload is None:
        raise SystemExit(f"json_decode_failed:{path}:{last_error}")
    if not isinstance(payload, dict):
        raise SystemExit(f"json_root_must_be_object:{path}")
    return payload


def build_report(
    *,
    deployment_name: str,
    environment: str | None,
    readiness_payloads: Sequence[dict[str, Any]],
    smoke_payloads: Sequence[dict[str, Any]],
    pi_doctor_payloads: Sequence[dict[str, Any]],
    accepted_analysis_statuses: Sequence[str] = DEFAULT_ACCEPTED_ANALYSIS_STATUSES,
) -> EvidenceReport:
    items = [
        _render_blueprint_item(readiness_payloads),
        _runtime_readiness_item(readiness_payloads),
        _storage_live_item(readiness_payloads),
        _synthetic_upload_item(smoke_payloads),
        _synthetic_analysis_item(smoke_payloads, accepted_statuses=set(accepted_analysis_statuses)),
        _pi_doctor_item(pi_doctor_payloads),
    ]
    return EvidenceReport(
        ok=not any(item.status in {"fail", "missing"} for item in items),
        deployment_name=deployment_name,
        environment=environment,
        generated_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        items=items,
    )


def _render_blueprint_item(payloads: Sequence[dict[str, Any]]) -> EvidenceItem:
    if not payloads:
        return EvidenceItem("render.blueprint", "missing", "camera_deployment_readiness.py --json output is required")
    for payload in payloads:
        checks = _checks_by_name(payload)
        if checks.get("render.blueprint.services", {}).get("status") == "pass":
            render_failures = [
                name
                for name, check in checks.items()
                if name.startswith("render.") and check.get("status") == "fail"
            ]
            if not render_failures:
                return EvidenceItem("render.blueprint", "pass", "Render blueprint checks passed")
            return EvidenceItem("render.blueprint", "fail", f"Render failures: {', '.join(render_failures[:6])}")
    return EvidenceItem("render.blueprint", "fail", "no readiness payload had passing render.blueprint.services")


def _runtime_readiness_item(payloads: Sequence[dict[str, Any]]) -> EvidenceItem:
    runtime_payloads = [payload for payload in payloads if any(name.startswith("runtime.") for name in _checks_by_name(payload))]
    if not runtime_payloads:
        return EvidenceItem(
            "runtime.environment",
            "missing",
            "run camera_deployment_readiness.py --include-runtime-env --runtime-role worker",
        )
    for payload in runtime_payloads:
        checks = _checks_by_name(payload)
        failures = [name for name, check in checks.items() if name.startswith("runtime.") and check.get("status") == "fail"]
        warnings = [name for name, check in checks.items() if name.startswith("runtime.") and check.get("status") == "warn"]
        if not failures:
            if warnings:
                return EvidenceItem("runtime.environment", "warn", f"runtime passed with warnings: {', '.join(warnings[:6])}")
            return EvidenceItem("runtime.environment", "pass", "runtime readiness checks passed")
    return EvidenceItem("runtime.environment", "fail", "all runtime readiness payloads had failures")


def _storage_live_item(payloads: Sequence[dict[str, Any]]) -> EvidenceItem:
    for payload in payloads:
        checks = _checks_by_name(payload)
        if all(checks.get(name, {}).get("status") == "pass" for name in REQUIRED_STORAGE_CHECKS):
            return EvidenceItem("storage.live_probe", "pass", "R2/S3 write, read, and delete probe passed")
    if any(any(name.startswith("storage_live.") for name in _checks_by_name(payload)) for payload in payloads):
        return EvidenceItem("storage.live_probe", "fail", "storage live probe ran but did not pass write/read/delete")
    return EvidenceItem(
        "storage.live_probe",
        "missing",
        "run camera_deployment_readiness.py --check-storage-live with target R2 env",
    )


def _synthetic_upload_item(payloads: Sequence[dict[str, Any]]) -> EvidenceItem:
    if not payloads:
        return EvidenceItem("synthetic.upload", "missing", "run camera_ingest_smoke.py against the deployed API")
    for payload in payloads:
        if payload.get("ok") is True and payload.get("uploadStatus") == "uploaded":
            return EvidenceItem(
                "synthetic.upload",
                "pass",
                f"frame={_safe_value(payload.get('frameId'))} camera={_safe_value(payload.get('cameraId'))}",
            )
    return EvidenceItem("synthetic.upload", "fail", "no smoke payload proved uploadStatus=uploaded")


def _synthetic_analysis_item(payloads: Sequence[dict[str, Any]], *, accepted_statuses: set[str]) -> EvidenceItem:
    if not payloads:
        return EvidenceItem("synthetic.analysis", "missing", "run camera_ingest_smoke.py --wait-for-analysis")
    seen_statuses: list[str] = []
    for payload in payloads:
        status = str(payload.get("analysisStatus") or "")
        if status:
            seen_statuses.append(status)
        if payload.get("ok") is True and status in accepted_statuses:
            return EvidenceItem("synthetic.analysis", "pass", f"analysisStatus={status}")
    if seen_statuses:
        return EvidenceItem("synthetic.analysis", "fail", f"analysis statuses did not match: {', '.join(seen_statuses[:6])}")
    return EvidenceItem("synthetic.analysis", "missing", "smoke payload did not include analysisStatus")


def _pi_doctor_item(payloads: Sequence[dict[str, Any]]) -> EvidenceItem:
    if not payloads:
        return EvidenceItem("pi.doctor", "missing", "run camera_agent.py --doctor --json on the Pi")
    for payload in payloads:
        checks = _checks_by_name(payload)
        missing = [name for name in REQUIRED_PI_DOCTOR_CHECKS if name not in checks]
        failing = [name for name in REQUIRED_PI_DOCTOR_CHECKS if checks.get(name, {}).get("status") != "pass"]
        if payload.get("ok") is True and not missing and not failing:
            return EvidenceItem("pi.doctor", "pass", "Pi agent doctor passed with API and RTSP checks")
        if missing:
            return EvidenceItem("pi.doctor", "fail", f"missing doctor checks: {', '.join(missing)}")
        if failing:
            return EvidenceItem("pi.doctor", "fail", f"failing doctor checks: {', '.join(failing)}")
    return EvidenceItem("pi.doctor", "fail", "no Pi doctor payload passed")


def _checks_by_name(payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    checks = payload.get("checks") or []
    if not isinstance(checks, list):
        return {}
    return {
        str(check.get("name")): check
        for check in checks
        if isinstance(check, dict) and isinstance(check.get("name"), str)
    }


def _safe_value(value: Any) -> str:
    if value is None:
        return "unknown"
    text = str(value)
    return text.replace("\n", " ").replace("\r", " ")[:80]


if __name__ == "__main__":
    raise SystemExit(main())
