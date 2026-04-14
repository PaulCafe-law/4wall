from app.config import Settings
from app.db import create_engine_for_settings


def test_postgres_driver_is_available_for_engine_creation():
    settings = Settings(
        app_name="Planner Test",
        environment="test",
        app_origin=None,
        database_url="postgresql://planner:secret@localhost:5432/planner",
        artifact_backend="local",
        artifact_root="./data/artifacts",
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
        web_signup_rate_limit_attempts=5,
        web_signup_rate_limit_window_seconds=300,
        invite_accept_rate_limit_attempts=5,
        invite_accept_rate_limit_window_seconds=300,
        bootstrap_operator_enabled=False,
        bootstrap_operator_username="pilot",
        bootstrap_operator_password="pilot-dev-only",
        bootstrap_operator_display_name="Test Pilot",
        route_provider="mock",
        osrm_base_url="https://example-osrm.local",
        osrm_profile="driving",
    )

    engine = create_engine_for_settings(settings)

    assert engine.url.drivername == "postgresql"
