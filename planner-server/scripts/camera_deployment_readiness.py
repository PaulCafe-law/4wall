from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
from typing import Any, Literal

import yaml


REPO_ROOT = Path(__file__).resolve().parents[2]
PLANNER_ROOT = Path(__file__).resolve().parents[1]
if str(PLANNER_ROOT) not in sys.path:
    sys.path.insert(0, str(PLANNER_ROOT))

from app.config import Settings
from app.storage import S3ArtifactStorage


Status = Literal["pass", "fail", "warn"]
RuntimeRole = Literal["api", "worker"]


@dataclass(frozen=True)
class ReadinessCheck:
    name: str
    status: Status
    detail: str


@dataclass(frozen=True)
class ReadinessResult:
    ok: bool
    checks: list[ReadinessCheck]

    def to_dict(self) -> dict[str, Any]:
        return {"ok": self.ok, "checks": [asdict(check) for check in self.checks]}


REQUIRED_API_ENV: dict[str, str | None] = {
    "BUILDING_ROUTE_ENVIRONMENT": None,
    "BUILDING_ROUTE_APP_ORIGIN": None,
    "BUILDING_ROUTE_DATABASE_URL": None,
    "BUILDING_ROUTE_AUTH_SECRET_KEY": None,
    "BUILDING_ROUTE_ARTIFACT_BACKEND": "s3",
    "BUILDING_ROUTE_S3_BUCKET": None,
    "BUILDING_ROUTE_S3_ENDPOINT_URL": None,
    "BUILDING_ROUTE_S3_REGION": None,
    "BUILDING_ROUTE_S3_ACCESS_KEY_ID": None,
    "BUILDING_ROUTE_S3_SECRET_ACCESS_KEY": None,
    "BUILDING_ROUTE_BOOTSTRAP_OPERATOR_ENABLED": "false",
}

REQUIRED_CAMERA_WORKER_ENV: dict[str, str | None] = {
    **REQUIRED_API_ENV,
    "CAMERA_ANALYSIS_PROVIDER": None,
    "CAMERA_ANALYSIS_OLLAMA_BASE_URL": None,
    "CAMERA_ANALYSIS_OLLAMA_MODEL": None,
    "CAMERA_ANALYSIS_OLLAMA_AUTH_TOKEN": None,
    "CAMERA_ANALYSIS_TIMEOUT_SECONDS": None,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate Factory Camera deployment readiness.")
    parser.add_argument("--render-yaml", default=str(REPO_ROOT / "render.yaml"), help="Render blueprint path.")
    parser.add_argument(
        "--include-runtime-env",
        action="store_true",
        help="Also validate the current process environment as a staging/production runtime.",
    )
    parser.add_argument("--runtime-role", choices=["api", "worker"], default="api")
    parser.add_argument(
        "--allow-non-r2",
        action="store_true",
        help="Allow S3-compatible storage endpoints that are not Cloudflare R2.",
    )
    parser.add_argument(
        "--check-storage-live",
        action="store_true",
        help="Use current runtime env to write/read/delete a small S3/R2 probe object.",
    )
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    result = run_readiness_checks(
        render_yaml_path=Path(args.render_yaml),
        include_runtime_env=args.include_runtime_env,
        runtime_role=args.runtime_role,
        allow_non_r2=args.allow_non_r2,
        check_storage_live=args.check_storage_live,
    )
    if args.json:
        print(json.dumps(result.to_dict(), indent=2, sort_keys=True))
    else:
        for check in result.checks:
            print(f"[{check.status.upper()}] {check.name}: {check.detail}")
        print(f"ok={str(result.ok).lower()}")
    return 0 if result.ok else 1


def run_readiness_checks(
    *,
    render_yaml_path: Path,
    include_runtime_env: bool = False,
    runtime_role: RuntimeRole = "api",
    allow_non_r2: bool = False,
    check_storage_live: bool = False,
) -> ReadinessResult:
    checks: list[ReadinessCheck] = []
    checks.extend(_check_render_blueprint(render_yaml_path))
    if include_runtime_env:
        checks.extend(_check_runtime_environment(role=runtime_role, allow_non_r2=allow_non_r2))
    if check_storage_live:
        checks.extend(_check_live_artifact_storage(Settings.from_env()))
    return ReadinessResult(ok=not any(check.status == "fail" for check in checks), checks=checks)


def _check_render_blueprint(render_yaml_path: Path) -> list[ReadinessCheck]:
    checks: list[ReadinessCheck] = []
    if not render_yaml_path.exists():
        return [ReadinessCheck("render.blueprint.exists", "fail", f"{render_yaml_path} does not exist")]

    with render_yaml_path.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}

    services = data.get("services")
    if not isinstance(services, list):
        return [ReadinessCheck("render.blueprint.services", "fail", "render.yaml must define a services list")]

    service_by_name = {service.get("name"): service for service in services if isinstance(service, dict)}
    checks.append(ReadinessCheck("render.blueprint.services", "pass", f"{len(service_by_name)} services parsed"))

    expected_api_services = {
        "four-wall-api-staging": "commit",
        "four-wall-api": "off",
    }
    for service_name, expected_auto_deploy in expected_api_services.items():
        service = service_by_name.get(service_name)
        if service is None:
            checks.append(ReadinessCheck(f"render.{service_name}.exists", "fail", "API service is missing"))
            continue
        checks.append(ReadinessCheck(f"render.{service_name}.exists", "pass", "API service exists"))
        checks.extend(_check_api_service_shape(service_name, service, expected_auto_deploy=expected_auto_deploy))
        checks.extend(_check_service_env(service_name, service, REQUIRED_API_ENV))

    expected_workers = {
        "four-wall-camera-analysis-worker-staging": "commit",
        "four-wall-camera-analysis-worker": "off",
    }
    for service_name, expected_auto_deploy in expected_workers.items():
        service = service_by_name.get(service_name)
        if service is None:
            checks.append(ReadinessCheck(f"render.{service_name}.exists", "fail", "camera worker service is missing"))
            continue
        checks.append(ReadinessCheck(f"render.{service_name}.exists", "pass", "camera worker service exists"))
        checks.extend(
            _check_service_shape(
                service_name,
                service,
                expected_type="worker",
                expected_start_command="python -m app.camera_analysis_worker",
                expected_auto_deploy=expected_auto_deploy,
            )
        )
        checks.extend(_check_service_env(service_name, service, REQUIRED_CAMERA_WORKER_ENV))

    return checks


def _check_api_service_shape(
    service_name: str,
    service: dict[str, Any],
    *,
    expected_auto_deploy: str,
) -> list[ReadinessCheck]:
    checks: list[ReadinessCheck] = []
    checks.append(_check_equal(f"render.{service_name}.type", service.get("type"), "web", "service type"))
    checks.append(_check_equal(f"render.{service_name}.runtime", service.get("runtime"), "docker", "service runtime"))
    checks.append(_check_equal(f"render.{service_name}.rootDir", service.get("rootDir"), "planner-server", "service rootDir"))
    checks.append(_check_equal(f"render.{service_name}.healthCheckPath", service.get("healthCheckPath"), "/healthz", "healthCheckPath"))
    checks.append(
        _check_equal(
            f"render.{service_name}.autoDeployTrigger",
            str(service.get("autoDeployTrigger")),
            expected_auto_deploy,
            "autoDeployTrigger",
        )
    )
    return checks


def _check_service_shape(
    service_name: str,
    service: dict[str, Any],
    *,
    expected_type: str,
    expected_start_command: str,
    expected_auto_deploy: str,
) -> list[ReadinessCheck]:
    checks: list[ReadinessCheck] = []
    checks.append(
        _check_equal(
            f"render.{service_name}.type",
            service.get("type"),
            expected_type,
            "service type",
        )
    )
    checks.append(
        _check_equal(
            f"render.{service_name}.rootDir",
            service.get("rootDir"),
            "planner-server",
            "service rootDir",
        )
    )
    checks.append(
        _check_equal(
            f"render.{service_name}.startCommand",
            service.get("startCommand"),
            expected_start_command,
            "worker startCommand",
        )
    )
    checks.append(
        _check_equal(
            f"render.{service_name}.autoDeployTrigger",
            str(service.get("autoDeployTrigger")),
            expected_auto_deploy,
            "autoDeployTrigger",
        )
    )
    return checks


def _check_service_env(
    service_name: str,
    service: dict[str, Any],
    expected_env: dict[str, str | None],
) -> list[ReadinessCheck]:
    checks: list[ReadinessCheck] = []
    env = _service_env(service)
    for key, expected_value in expected_env.items():
        item = env.get(key)
        if item is None:
            checks.append(ReadinessCheck(f"render.{service_name}.env.{key}", "fail", "env var is missing"))
            continue
        if expected_value is None:
            checks.append(ReadinessCheck(f"render.{service_name}.env.{key}", "pass", "env var is declared"))
            continue
        actual_value = str(item.get("value", "")).lower()
        if actual_value == expected_value:
            checks.append(
                ReadinessCheck(f"render.{service_name}.env.{key}", "pass", f"value is {expected_value}")
            )
        else:
            checks.append(
                ReadinessCheck(
                    f"render.{service_name}.env.{key}",
                    "fail",
                    f"expected value {expected_value}, got {item.get('value')!r}",
                )
            )
    return checks


def _check_runtime_environment(*, role: RuntimeRole, allow_non_r2: bool) -> list[ReadinessCheck]:
    checks: list[ReadinessCheck] = []
    settings = Settings.from_env()
    environment = settings.environment.lower()
    if environment in {"staging", "production"}:
        checks.append(ReadinessCheck("runtime.environment", "pass", settings.environment))
    else:
        checks.append(ReadinessCheck("runtime.environment", "fail", "must be staging or production"))

    try:
        settings.validate_runtime()
    except ValueError as exc:
        checks.append(ReadinessCheck("runtime.validate_runtime", "fail", str(exc)))
    else:
        checks.append(ReadinessCheck("runtime.validate_runtime", "pass", "production safeguards passed"))

    if settings.is_sqlite:
        checks.append(ReadinessCheck("runtime.database", "fail", "staging/production must not use sqlite"))
    else:
        checks.append(ReadinessCheck("runtime.database", "pass", "database is non-sqlite"))

    if settings.artifact_backend == "s3":
        checks.append(ReadinessCheck("runtime.artifact_backend", "pass", "s3"))
    else:
        checks.append(ReadinessCheck("runtime.artifact_backend", "fail", "must be s3"))

    for key, value in _runtime_storage_values(settings).items():
        if value:
            checks.append(ReadinessCheck(f"runtime.{key}", "pass", "configured"))
        else:
            checks.append(ReadinessCheck(f"runtime.{key}", "fail", "missing"))

    if settings.s3_endpoint_url and (allow_non_r2 or "r2.cloudflarestorage.com" in settings.s3_endpoint_url):
        checks.append(ReadinessCheck("runtime.r2_endpoint", "pass", settings.s3_endpoint_url))
    elif settings.s3_endpoint_url:
        checks.append(
            ReadinessCheck(
                "runtime.r2_endpoint",
                "fail",
                "expected a Cloudflare R2 endpoint or pass --allow-non-r2",
            )
        )

    if settings.bootstrap_operator_enabled:
        checks.append(ReadinessCheck("runtime.bootstrap_operator", "fail", "must be disabled"))
    else:
        checks.append(ReadinessCheck("runtime.bootstrap_operator", "pass", "disabled"))

    if role == "worker":
        checks.extend(_check_worker_runtime(settings))
    return checks


def _check_worker_runtime(settings: Settings) -> list[ReadinessCheck]:
    checks: list[ReadinessCheck] = []
    provider = settings.camera_analysis_provider.strip().lower()
    if provider and provider != "disabled":
        checks.append(ReadinessCheck("runtime.camera_analysis_provider", "pass", provider))
    else:
        checks.append(ReadinessCheck("runtime.camera_analysis_provider", "fail", "must not be disabled"))

    if provider == "ollama":
        base_url = settings.camera_analysis_ollama_base_url
        if _is_local_url(base_url):
            checks.append(
                ReadinessCheck(
                    "runtime.camera_analysis_ollama_base_url",
                    "fail",
                    "Render worker cannot reach localhost Ollama for real deployment",
                )
            )
        else:
            checks.append(ReadinessCheck("runtime.camera_analysis_ollama_base_url", "pass", base_url))
        checks.append(
            ReadinessCheck(
                "runtime.camera_analysis_ollama_model",
                "pass" if settings.camera_analysis_ollama_model else "fail",
                settings.camera_analysis_ollama_model or "missing",
            )
        )
        if settings.camera_analysis_ollama_auth_token:
            checks.append(ReadinessCheck("runtime.camera_analysis_ollama_auth_token", "pass", "configured"))
        else:
            checks.append(
                ReadinessCheck(
                    "runtime.camera_analysis_ollama_auth_token",
                    "warn",
                    "not configured; require private network/VPN or an authenticated proxy exception",
                )
            )

    if settings.camera_analysis_timeout_seconds <= 0:
        checks.append(ReadinessCheck("runtime.camera_analysis_timeout_seconds", "fail", "must be positive"))
    else:
        checks.append(
            ReadinessCheck(
                "runtime.camera_analysis_timeout_seconds",
                "pass",
                str(settings.camera_analysis_timeout_seconds),
            )
        )
    return checks


def _check_live_artifact_storage(settings: Settings) -> list[ReadinessCheck]:
    checks: list[ReadinessCheck] = []
    if settings.artifact_backend != "s3":
        return [ReadinessCheck("storage_live.artifact_backend", "fail", "live storage probe requires s3 backend")]
    try:
        storage = S3ArtifactStorage.from_settings(settings)
    except Exception as exc:
        return [ReadinessCheck("storage_live.init", "fail", _safe_error_detail(exc))]

    key = f"camera-readiness/{settings.environment}/{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}.txt"
    payload = b"factory-camera-readiness\n"
    try:
        storage.write(key=key, data=payload, content_type="text/plain", cache_control="private, max-age=60")
    except Exception as exc:
        checks.append(ReadinessCheck("storage_live.write", "fail", _safe_error_detail(exc)))
        return checks
    checks.append(ReadinessCheck("storage_live.write", "pass", key))

    try:
        readback = storage.read(key)
    except Exception as exc:
        checks.append(ReadinessCheck("storage_live.read", "fail", _safe_error_detail(exc)))
    else:
        if readback == payload:
            checks.append(ReadinessCheck("storage_live.read", "pass", "readback matched probe payload"))
        else:
            checks.append(ReadinessCheck("storage_live.read", "fail", "readback did not match probe payload"))

    try:
        storage.delete(key)
    except Exception as exc:
        checks.append(ReadinessCheck("storage_live.delete", "warn", _safe_error_detail(exc)))
    else:
        checks.append(ReadinessCheck("storage_live.delete", "pass", "probe object deleted"))
    return checks


def _runtime_storage_values(settings: Settings) -> dict[str, str | None]:
    return {
        "BUILDING_ROUTE_S3_BUCKET": settings.s3_bucket,
        "BUILDING_ROUTE_S3_ENDPOINT_URL": settings.s3_endpoint_url,
        "BUILDING_ROUTE_S3_REGION": settings.s3_region,
        "BUILDING_ROUTE_S3_ACCESS_KEY_ID": settings.s3_access_key_id,
        "BUILDING_ROUTE_S3_SECRET_ACCESS_KEY": settings.s3_secret_access_key,
    }


def _service_env(service: dict[str, Any]) -> dict[str, dict[str, Any]]:
    env_vars = service.get("envVars") or []
    return {item.get("key"): item for item in env_vars if isinstance(item, dict) and item.get("key")}


def _check_equal(name: str, actual: Any, expected: str, label: str) -> ReadinessCheck:
    if actual == expected:
        return ReadinessCheck(name, "pass", f"{label} is {expected}")
    return ReadinessCheck(name, "fail", f"expected {expected}, got {actual!r}")


def _safe_error_detail(exc: BaseException) -> str:
    return str(exc).replace("\n", " ").replace("\r", " ").strip()[:240] or exc.__class__.__name__


def _is_local_url(value: str) -> bool:
    normalized = value.lower()
    return (
        normalized.startswith("http://localhost")
        or normalized.startswith("https://localhost")
        or normalized.startswith("http://127.")
        or normalized.startswith("https://127.")
    )


if __name__ == "__main__":
    raise SystemExit(main())
