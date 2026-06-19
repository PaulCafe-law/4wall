from __future__ import annotations

from pathlib import Path

from scripts import camera_deployment_readiness
from scripts.camera_deployment_readiness import run_readiness_checks


REPO_ROOT = Path(__file__).resolve().parents[2]


def test_camera_deployment_readiness_accepts_current_render_blueprint() -> None:
    result = run_readiness_checks(render_yaml_path=REPO_ROOT / "render.yaml")

    assert result.ok is True
    failed = [check for check in result.checks if check.status == "fail"]
    assert failed == []


def test_camera_deployment_readiness_rejects_incomplete_production_env(monkeypatch) -> None:
    monkeypatch.setenv("BUILDING_ROUTE_ENVIRONMENT", "production")
    monkeypatch.delenv("BUILDING_ROUTE_APP_ORIGIN", raising=False)
    monkeypatch.delenv("BUILDING_ROUTE_DATABASE_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("BUILDING_ROUTE_AUTH_SECRET_KEY", "dev-insecure-secret-change-me")
    monkeypatch.setenv("BUILDING_ROUTE_ARTIFACT_BACKEND", "local")

    result = run_readiness_checks(
        render_yaml_path=REPO_ROOT / "render.yaml",
        include_runtime_env=True,
        runtime_role="api",
    )

    assert result.ok is False
    failed_names = {check.name for check in result.checks if check.status == "fail"}
    assert "runtime.validate_runtime" in failed_names
    assert "runtime.database" in failed_names
    assert "runtime.artifact_backend" in failed_names


def test_camera_deployment_readiness_accepts_worker_runtime_env(monkeypatch) -> None:
    monkeypatch.setenv("BUILDING_ROUTE_ENVIRONMENT", "production")
    monkeypatch.setenv("BUILDING_ROUTE_APP_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("BUILDING_ROUTE_DATABASE_URL", "postgresql://user:pass@db.internal/fourwall")
    monkeypatch.setenv("BUILDING_ROUTE_AUTH_SECRET_KEY", "prod-secret-not-the-dev-default")
    monkeypatch.setenv("BUILDING_ROUTE_BOOTSTRAP_OPERATOR_ENABLED", "false")
    monkeypatch.setenv("BUILDING_ROUTE_ARTIFACT_BACKEND", "s3")
    monkeypatch.setenv("BUILDING_ROUTE_S3_BUCKET", "four-wall-camera-frames")
    monkeypatch.setenv(
        "BUILDING_ROUTE_S3_ENDPOINT_URL",
        "https://52a58ec37e063801e1cf6d6789b96b69.r2.cloudflarestorage.com",
    )
    monkeypatch.setenv("BUILDING_ROUTE_S3_REGION", "auto")
    monkeypatch.setenv("BUILDING_ROUTE_S3_ACCESS_KEY_ID", "access-key")
    monkeypatch.setenv("BUILDING_ROUTE_S3_SECRET_ACCESS_KEY", "secret-key")
    monkeypatch.setenv("CAMERA_ANALYSIS_PROVIDER", "ollama")
    monkeypatch.setenv("CAMERA_ANALYSIS_OLLAMA_BASE_URL", "https://ollama.internal.example.com")
    monkeypatch.setenv("CAMERA_ANALYSIS_OLLAMA_MODEL", "qwen2.5vl:7b")
    monkeypatch.setenv("CAMERA_ANALYSIS_OLLAMA_AUTH_TOKEN", "proxy-token")
    monkeypatch.setenv("CAMERA_ANALYSIS_TIMEOUT_SECONDS", "120")

    result = run_readiness_checks(
        render_yaml_path=REPO_ROOT / "render.yaml",
        include_runtime_env=True,
        runtime_role="worker",
    )

    assert result.ok is True
    failed = [check for check in result.checks if check.status == "fail"]
    assert failed == []
    check_statuses = {check.name: check.status for check in result.checks}
    assert check_statuses["runtime.camera_analysis_ollama_auth_token"] == "pass"


def test_camera_deployment_readiness_warns_without_worker_provider_token(monkeypatch) -> None:
    monkeypatch.setenv("BUILDING_ROUTE_ENVIRONMENT", "production")
    monkeypatch.setenv("BUILDING_ROUTE_APP_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("BUILDING_ROUTE_DATABASE_URL", "postgresql://user:pass@db.internal/fourwall")
    monkeypatch.setenv("BUILDING_ROUTE_AUTH_SECRET_KEY", "prod-secret-not-the-dev-default")
    monkeypatch.setenv("BUILDING_ROUTE_BOOTSTRAP_OPERATOR_ENABLED", "false")
    monkeypatch.setenv("BUILDING_ROUTE_ARTIFACT_BACKEND", "s3")
    monkeypatch.setenv("BUILDING_ROUTE_S3_BUCKET", "four-wall-camera-frames")
    monkeypatch.setenv(
        "BUILDING_ROUTE_S3_ENDPOINT_URL",
        "https://52a58ec37e063801e1cf6d6789b96b69.r2.cloudflarestorage.com",
    )
    monkeypatch.setenv("BUILDING_ROUTE_S3_REGION", "auto")
    monkeypatch.setenv("BUILDING_ROUTE_S3_ACCESS_KEY_ID", "access-key")
    monkeypatch.setenv("BUILDING_ROUTE_S3_SECRET_ACCESS_KEY", "secret-key")
    monkeypatch.setenv("CAMERA_ANALYSIS_PROVIDER", "ollama")
    monkeypatch.setenv("CAMERA_ANALYSIS_OLLAMA_BASE_URL", "https://ollama.internal.example.com")
    monkeypatch.setenv("CAMERA_ANALYSIS_OLLAMA_MODEL", "qwen2.5vl:7b")
    monkeypatch.delenv("CAMERA_ANALYSIS_OLLAMA_AUTH_TOKEN", raising=False)
    monkeypatch.setenv("CAMERA_ANALYSIS_TIMEOUT_SECONDS", "120")

    result = run_readiness_checks(
        render_yaml_path=REPO_ROOT / "render.yaml",
        include_runtime_env=True,
        runtime_role="worker",
    )

    assert result.ok is True
    check_statuses = {check.name: check.status for check in result.checks}
    assert check_statuses["runtime.camera_analysis_ollama_auth_token"] == "warn"


def test_camera_deployment_readiness_accepts_noop_worker_provider(monkeypatch) -> None:
    monkeypatch.setenv("BUILDING_ROUTE_ENVIRONMENT", "production")
    monkeypatch.setenv("BUILDING_ROUTE_APP_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("BUILDING_ROUTE_DATABASE_URL", "postgresql://user:pass@db.internal/fourwall")
    monkeypatch.setenv("BUILDING_ROUTE_AUTH_SECRET_KEY", "prod-secret-not-the-dev-default")
    monkeypatch.setenv("BUILDING_ROUTE_BOOTSTRAP_OPERATOR_ENABLED", "false")
    monkeypatch.setenv("BUILDING_ROUTE_ARTIFACT_BACKEND", "s3")
    monkeypatch.setenv("BUILDING_ROUTE_S3_BUCKET", "four-wall-camera-frames")
    monkeypatch.setenv(
        "BUILDING_ROUTE_S3_ENDPOINT_URL",
        "https://52a58ec37e063801e1cf6d6789b96b69.r2.cloudflarestorage.com",
    )
    monkeypatch.setenv("BUILDING_ROUTE_S3_REGION", "auto")
    monkeypatch.setenv("BUILDING_ROUTE_S3_ACCESS_KEY_ID", "access-key")
    monkeypatch.setenv("BUILDING_ROUTE_S3_SECRET_ACCESS_KEY", "secret-key")
    monkeypatch.setenv("CAMERA_ANALYSIS_PROVIDER", "noop")
    monkeypatch.setenv("CAMERA_ANALYSIS_TIMEOUT_SECONDS", "120")

    result = run_readiness_checks(
        render_yaml_path=REPO_ROOT / "render.yaml",
        include_runtime_env=True,
        runtime_role="worker",
    )

    assert result.ok is True
    failed = [check for check in result.checks if check.status == "fail"]
    assert failed == []
    check_statuses = {check.name: check.status for check in result.checks}
    assert check_statuses["runtime.camera_analysis_provider"] == "pass"
    assert "runtime.camera_analysis_ollama_auth_token" not in check_statuses


def test_camera_deployment_readiness_rejects_localhost_worker_provider(monkeypatch) -> None:
    monkeypatch.setenv("BUILDING_ROUTE_ENVIRONMENT", "production")
    monkeypatch.setenv("BUILDING_ROUTE_APP_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("BUILDING_ROUTE_DATABASE_URL", "postgresql://user:pass@db.internal/fourwall")
    monkeypatch.setenv("BUILDING_ROUTE_AUTH_SECRET_KEY", "prod-secret-not-the-dev-default")
    monkeypatch.setenv("BUILDING_ROUTE_BOOTSTRAP_OPERATOR_ENABLED", "false")
    monkeypatch.setenv("BUILDING_ROUTE_ARTIFACT_BACKEND", "s3")
    monkeypatch.setenv("BUILDING_ROUTE_S3_BUCKET", "four-wall-camera-frames")
    monkeypatch.setenv(
        "BUILDING_ROUTE_S3_ENDPOINT_URL",
        "https://52a58ec37e063801e1cf6d6789b96b69.r2.cloudflarestorage.com",
    )
    monkeypatch.setenv("BUILDING_ROUTE_S3_REGION", "auto")
    monkeypatch.setenv("BUILDING_ROUTE_S3_ACCESS_KEY_ID", "access-key")
    monkeypatch.setenv("BUILDING_ROUTE_S3_SECRET_ACCESS_KEY", "secret-key")
    monkeypatch.setenv("CAMERA_ANALYSIS_PROVIDER", "ollama")
    monkeypatch.setenv("CAMERA_ANALYSIS_OLLAMA_BASE_URL", "http://localhost:11434")

    result = run_readiness_checks(
        render_yaml_path=REPO_ROOT / "render.yaml",
        include_runtime_env=True,
        runtime_role="worker",
    )

    assert result.ok is False
    failed_names = {check.name for check in result.checks if check.status == "fail"}
    assert "runtime.camera_analysis_ollama_base_url" in failed_names


def test_camera_deployment_readiness_live_storage_probe_writes_reads_and_deletes(monkeypatch) -> None:
    _set_s3_env(monkeypatch)
    fake_storage = FakeStorage(readback=b"factory-camera-readiness\n")
    monkeypatch.setattr(
        camera_deployment_readiness,
        "S3ArtifactStorage",
        FakeS3ArtifactStorage(fake_storage),
    )

    result = run_readiness_checks(
        render_yaml_path=REPO_ROOT / "render.yaml",
        check_storage_live=True,
    )

    assert result.ok is True
    check_statuses = {check.name: check.status for check in result.checks}
    assert check_statuses["storage_live.write"] == "pass"
    assert check_statuses["storage_live.read"] == "pass"
    assert check_statuses["storage_live.delete"] == "pass"
    assert fake_storage.deleted_keys == fake_storage.written_keys


def test_camera_deployment_readiness_live_storage_probe_fails_on_readback_mismatch(monkeypatch) -> None:
    _set_s3_env(monkeypatch)
    fake_storage = FakeStorage(readback=b"wrong")
    monkeypatch.setattr(
        camera_deployment_readiness,
        "S3ArtifactStorage",
        FakeS3ArtifactStorage(fake_storage),
    )

    result = run_readiness_checks(
        render_yaml_path=REPO_ROOT / "render.yaml",
        check_storage_live=True,
    )

    assert result.ok is False
    failed_names = {check.name for check in result.checks if check.status == "fail"}
    assert "storage_live.read" in failed_names


def _set_s3_env(monkeypatch) -> None:
    monkeypatch.setenv("BUILDING_ROUTE_ENVIRONMENT", "production")
    monkeypatch.setenv("BUILDING_ROUTE_ARTIFACT_BACKEND", "s3")
    monkeypatch.setenv("BUILDING_ROUTE_S3_BUCKET", "four-wall-camera-frames")
    monkeypatch.setenv("BUILDING_ROUTE_S3_ENDPOINT_URL", "https://example.r2.cloudflarestorage.com")
    monkeypatch.setenv("BUILDING_ROUTE_S3_REGION", "auto")
    monkeypatch.setenv("BUILDING_ROUTE_S3_ACCESS_KEY_ID", "access-key")
    monkeypatch.setenv("BUILDING_ROUTE_S3_SECRET_ACCESS_KEY", "secret-key")


class FakeS3ArtifactStorage:
    def __init__(self, storage: "FakeStorage") -> None:
        self.storage = storage

    def from_settings(self, _settings):
        return self.storage


class FakeStorage:
    def __init__(self, *, readback: bytes) -> None:
        self.readback = readback
        self.written_keys: list[str] = []
        self.deleted_keys: list[str] = []

    def write(self, *, key: str, data: bytes, content_type: str, cache_control: str):
        self.written_keys.append(key)

    def read(self, key: str) -> bytes:
        return self.readback

    def delete(self, key: str) -> None:
        self.deleted_keys.append(key)
