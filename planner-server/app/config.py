from __future__ import annotations

from dataclasses import dataclass
import os


def _env_str(name: str, default: str | None = None) -> str | None:
    value = os.getenv(name)
    if value is None:
        return default
    value = value.strip()
    if not value:
        return default
    return value


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    return int(value) if value is not None else default


@dataclass(frozen=True)
class Settings:
    app_name: str
    environment: str
    app_origin: str | None
    database_url: str
    artifact_backend: str
    artifact_root: str
    s3_bucket: str | None
    s3_endpoint_url: str | None
    s3_region: str | None
    s3_access_key_id: str | None
    s3_secret_access_key: str | None
    auth_secret_key: str
    access_token_ttl_minutes: int
    refresh_token_ttl_days: int
    web_login_rate_limit_attempts: int
    web_login_rate_limit_window_seconds: int
    web_signup_rate_limit_attempts: int
    web_signup_rate_limit_window_seconds: int
    invite_accept_rate_limit_attempts: int
    invite_accept_rate_limit_window_seconds: int
    bootstrap_operator_enabled: bool
    bootstrap_operator_username: str
    bootstrap_operator_password: str
    bootstrap_operator_display_name: str
    route_provider: str
    osrm_base_url: str
    osrm_profile: str

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            app_name=_env_str("BUILDING_ROUTE_APP_NAME", "Building Route Planner") or "Building Route Planner",
            environment=_env_str("BUILDING_ROUTE_ENVIRONMENT", "development") or "development",
            app_origin=_env_str("BUILDING_ROUTE_APP_ORIGIN"),
            database_url=_env_str("BUILDING_ROUTE_DATABASE_URL", "sqlite:///./data/planner.db")
            or "sqlite:///./data/planner.db",
            artifact_backend=_env_str("BUILDING_ROUTE_ARTIFACT_BACKEND", "local") or "local",
            artifact_root=_env_str("BUILDING_ROUTE_ARTIFACT_ROOT", "./data/artifacts") or "./data/artifacts",
            s3_bucket=_env_str("BUILDING_ROUTE_S3_BUCKET"),
            s3_endpoint_url=_env_str("BUILDING_ROUTE_S3_ENDPOINT_URL"),
            s3_region=_env_str("BUILDING_ROUTE_S3_REGION"),
            s3_access_key_id=_env_str("BUILDING_ROUTE_S3_ACCESS_KEY_ID"),
            s3_secret_access_key=_env_str("BUILDING_ROUTE_S3_SECRET_ACCESS_KEY"),
            auth_secret_key=_env_str("BUILDING_ROUTE_AUTH_SECRET_KEY", "dev-insecure-secret-change-me")
            or "dev-insecure-secret-change-me",
            access_token_ttl_minutes=_env_int("BUILDING_ROUTE_ACCESS_TOKEN_TTL_MINUTES", 15),
            refresh_token_ttl_days=_env_int("BUILDING_ROUTE_REFRESH_TOKEN_TTL_DAYS", 7),
            web_login_rate_limit_attempts=_env_int("BUILDING_ROUTE_WEB_LOGIN_RATE_LIMIT_ATTEMPTS", 5),
            web_login_rate_limit_window_seconds=_env_int("BUILDING_ROUTE_WEB_LOGIN_RATE_LIMIT_WINDOW_SECONDS", 300),
            web_signup_rate_limit_attempts=_env_int("BUILDING_ROUTE_WEB_SIGNUP_RATE_LIMIT_ATTEMPTS", 5),
            web_signup_rate_limit_window_seconds=_env_int("BUILDING_ROUTE_WEB_SIGNUP_RATE_LIMIT_WINDOW_SECONDS", 300),
            invite_accept_rate_limit_attempts=_env_int("BUILDING_ROUTE_INVITE_ACCEPT_RATE_LIMIT_ATTEMPTS", 5),
            invite_accept_rate_limit_window_seconds=_env_int("BUILDING_ROUTE_INVITE_ACCEPT_RATE_LIMIT_WINDOW_SECONDS", 300),
            bootstrap_operator_enabled=_env_bool("BUILDING_ROUTE_BOOTSTRAP_OPERATOR_ENABLED", True),
            bootstrap_operator_username=_env_str("BUILDING_ROUTE_BOOTSTRAP_OPERATOR_USERNAME", "pilot") or "pilot",
            bootstrap_operator_password=_env_str("BUILDING_ROUTE_BOOTSTRAP_OPERATOR_PASSWORD", "pilot-dev-only")
            or "pilot-dev-only",
            bootstrap_operator_display_name=_env_str(
                "BUILDING_ROUTE_BOOTSTRAP_OPERATOR_DISPLAY_NAME", "Demo Pilot"
            )
            or "Demo Pilot",
            route_provider=_env_str("BUILDING_ROUTE_ROUTE_PROVIDER", "mock") or "mock",
            osrm_base_url=_env_str("BUILDING_ROUTE_OSRM_BASE_URL", "https://router.project-osrm.org")
            or "https://router.project-osrm.org",
            osrm_profile=_env_str("BUILDING_ROUTE_OSRM_PROFILE", "driving") or "driving",
        )

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    def validate_runtime(self) -> None:
        if self.environment.lower() not in {"development", "dev", "test"}:
            if not self.app_origin:
                raise ValueError("BUILDING_ROUTE_APP_ORIGIN must be set outside development/test")
            if self.auth_secret_key == "dev-insecure-secret-change-me":
                raise ValueError("BUILDING_ROUTE_AUTH_SECRET_KEY must be set outside development/test")
            if self.bootstrap_operator_enabled:
                raise ValueError("Bootstrap operator must be disabled outside development/test")
