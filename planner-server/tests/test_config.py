from app.config import Settings


def test_settings_from_env_trims_string_values(monkeypatch):
    monkeypatch.setenv("BUILDING_ROUTE_ENVIRONMENT", " staging ")
    monkeypatch.setenv("BUILDING_ROUTE_APP_ORIGIN", " https://four-wall-web-staging.onrender.com \n")
    monkeypatch.setenv("BUILDING_ROUTE_DATABASE_URL", " postgresql://user:pass@db.internal/fourwall ")
    monkeypatch.setenv("BUILDING_ROUTE_ARTIFACT_BACKEND", " s3 ")
    monkeypatch.setenv("BUILDING_ROUTE_S3_BUCKET", " four-wall-artifacts-staging ")
    monkeypatch.setenv(
        "BUILDING_ROUTE_S3_ENDPOINT_URL",
        " https://52a58ec37e063801e1cf6d6789b96b69.r2.cloudflarestorage.com \n",
    )
    monkeypatch.setenv("BUILDING_ROUTE_S3_REGION", " auto ")
    monkeypatch.setenv("BUILDING_ROUTE_S3_ACCESS_KEY_ID", " access-key ")
    monkeypatch.setenv("BUILDING_ROUTE_S3_SECRET_ACCESS_KEY", " secret-key ")
    monkeypatch.setenv("BUILDING_ROUTE_AUTH_SECRET_KEY", " test-secret ")

    settings = Settings.from_env()

    assert settings.environment == "staging"
    assert settings.app_origin == "https://four-wall-web-staging.onrender.com"
    assert settings.database_url == "postgresql://user:pass@db.internal/fourwall"
    assert settings.artifact_backend == "s3"
    assert settings.s3_bucket == "four-wall-artifacts-staging"
    assert settings.s3_endpoint_url == "https://52a58ec37e063801e1cf6d6789b96b69.r2.cloudflarestorage.com"
    assert settings.s3_region == "auto"
    assert settings.s3_access_key_id == "access-key"
    assert settings.s3_secret_access_key == "secret-key"
    assert settings.auth_secret_key == "test-secret"
