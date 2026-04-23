from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import build_app


@pytest.fixture
def test_settings(tmp_path: Path) -> Settings:
    return Settings(
        app_name="Planner Test",
        environment="test",
        app_origin=None,
        database_url=f"sqlite:///{tmp_path / 'planner.db'}",
        artifact_backend="local",
        artifact_root=str(tmp_path / "artifacts"),
        s3_bucket=None,
        s3_endpoint_url=None,
        s3_region=None,
        s3_access_key_id=None,
        s3_secret_access_key=None,
        auth_secret_key="test-secret-key-with-32-bytes-minimum",
        access_token_ttl_minutes=15,
        refresh_token_ttl_days=7,
        web_login_rate_limit_attempts=5,
        web_login_rate_limit_window_seconds=300,
        invite_accept_rate_limit_attempts=5,
        invite_accept_rate_limit_window_seconds=300,
        bootstrap_operator_enabled=True,
        bootstrap_operator_username="pilot",
        bootstrap_operator_password="pilot-dev-only",
        bootstrap_operator_display_name="Test Pilot",
        route_provider="mock",
        osrm_base_url="https://example-osrm.local",
        osrm_profile="driving",
    )


@pytest.fixture
def app(test_settings: Settings) -> FastAPI:
    return build_app(settings=test_settings)


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    with TestClient(app) as client:
        yield client


@pytest.fixture
def auth_headers(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/v1/auth/login",
        json={"username": "pilot", "password": "pilot-dev-only"},
    )
    token = response.json()["accessToken"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def session_factory(app: FastAPI):
    return app.state.session_factory
