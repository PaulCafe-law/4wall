from __future__ import annotations

from dataclasses import dataclass
import os

from cryptography.fernet import Fernet


def _env_str(name: str, default: str | None = None) -> str | None:
    value = os.getenv(name)
    if value is None:
        return default
    trimmed = value.strip()
    return trimmed or default


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    return int(value.strip()) if value is not None else default


def _env_csv(name: str) -> tuple[str, ...]:
    value = os.getenv(name)
    if value is None:
        return ()
    return tuple(item.strip() for item in value.split(",") if item.strip())


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
    invite_accept_rate_limit_attempts: int
    invite_accept_rate_limit_window_seconds: int
    bootstrap_operator_enabled: bool
    bootstrap_operator_username: str
    bootstrap_operator_password: str
    bootstrap_operator_display_name: str
    route_provider: str
    osrm_base_url: str
    osrm_profile: str
    line_channel_access_token: str | None
    line_channel_secret: str | None
    line_webhook_enabled: bool
    line_default_group_id: str | None
    line_incident_notify_enabled: bool
    line_public_base_url: str | None
    line_account_linking_enabled: bool = False
    line_account_link_encryption_keys: tuple[str, ...] = ()
    line_destination_id: str | None = None
    line_natural_language_enabled: bool = False
    line_natural_language_canary_org_ids: tuple[str, ...] = ()
    line_navigation_allowed_hosts: tuple[str, ...] = ()
    web_signup_rate_limit_attempts: int = 5
    web_signup_rate_limit_window_seconds: int = 300
    codex_cli_path: str = "codex"
    codex_text_model: str = "gpt-5.5"
    codex_text_timeout_seconds: int = 600
    codex_home: str | None = None
    gpt_image_oauth_command: str | None = None
    gpt_image_oauth_model: str = "gpt-image-2"
    gpt_image_oauth_timeout_seconds: int = 900
    gpt_image_oauth_size: str = "1536x1024"
    gpt_image_oauth_output_format: str = "png"
    worldlabs_api_key: str | None = None
    worldlabs_model: str = "marble-1.1-plus"
    worldlabs_operation_timeout_seconds: int = 3600
    ollama_base_url: str = "http://localhost:11434"
    ollama_qwen_vlm_model: str = "qwen2.5vl:7b"
    ollama_request_timeout_seconds: int = 120
    industrial_storage_provider: str = "local"
    industrial_storage_base_path: str = "./storage/industrial-data-engine"
    boxer_repo_path: str | None = None
    boxer_checkpoint_path: str | None = None
    boxer_annotation_command: str | None = None
    gsplat_python_env: str | None = None
    gsplat_render_command: str | None = None
    enable_ego_planner: bool = False
    ego_planner_ros_workspace: str | None = None
    ego_planner_command: str | None = None
    industrial_engine_max_scenes_per_run: int = 1
    industrial_engine_max_incidents_per_scene: int = 5
    industrial_engine_max_camera_poses: int = 48
    camera_analysis_provider: str = "disabled"
    camera_analysis_ollama_base_url: str = "http://localhost:11434"
    camera_analysis_ollama_model: str = "qwen2.5vl:7b"
    camera_analysis_ollama_auth_token: str | None = None
    camera_analysis_timeout_seconds: int = 120
    site_map_rent_house_sog_key: str | None = None
    site_map_asset_url_ttl_seconds: int = 300
    twin_agent_enabled: bool = False
    twin_agent_worker_token: str | None = None
    openbmc_integration_enabled: bool = False
    openbmc_live_view_enabled: bool = False
    openbmc_command_proposals_enabled: bool = False
    openbmc_command_execution_enabled: bool = False
    openbmc_read_freshness_seconds: int = 30
    openbmc_command_freshness_seconds: int = 15
    openbmc_clock_skew_seconds: int = 120
    openbmc_confirmation_ttl_seconds: int = 300
    openbmc_execution_ttl_seconds: int = 120
    openbmc_claim_lease_seconds: int = 30

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            app_name=_env_str("BUILDING_ROUTE_APP_NAME", "Building Route Planner") or "Building Route Planner",
            environment=_env_str("BUILDING_ROUTE_ENVIRONMENT", "development") or "development",
            app_origin=_env_str("BUILDING_ROUTE_APP_ORIGIN"),
            database_url=(
                _env_str("BUILDING_ROUTE_DATABASE_URL")
                or _env_str("DATABASE_URL", "sqlite:///./data/planner.db")
                or "sqlite:///./data/planner.db"
            ),
            artifact_backend=_env_str("BUILDING_ROUTE_ARTIFACT_BACKEND", "local") or "local",
            artifact_root=_env_str("BUILDING_ROUTE_ARTIFACT_ROOT", "./data/artifacts") or "./data/artifacts",
            s3_bucket=_env_str("BUILDING_ROUTE_S3_BUCKET"),
            s3_endpoint_url=_env_str("BUILDING_ROUTE_S3_ENDPOINT_URL"),
            s3_region=_env_str("BUILDING_ROUTE_S3_REGION"),
            s3_access_key_id=_env_str("BUILDING_ROUTE_S3_ACCESS_KEY_ID"),
            s3_secret_access_key=_env_str("BUILDING_ROUTE_S3_SECRET_ACCESS_KEY"),
            auth_secret_key=_env_str("BUILDING_ROUTE_AUTH_SECRET_KEY", "dev-insecure-secret-change-me") or "dev-insecure-secret-change-me",
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
            bootstrap_operator_password=_env_str("BUILDING_ROUTE_BOOTSTRAP_OPERATOR_PASSWORD", "pilot-dev-only") or "pilot-dev-only",
            bootstrap_operator_display_name=_env_str("BUILDING_ROUTE_BOOTSTRAP_OPERATOR_DISPLAY_NAME", "Demo Pilot") or "Demo Pilot",
            route_provider=_env_str("BUILDING_ROUTE_ROUTE_PROVIDER", "mock") or "mock",
            osrm_base_url=_env_str("BUILDING_ROUTE_OSRM_BASE_URL", "https://router.project-osrm.org") or "https://router.project-osrm.org",
            osrm_profile=_env_str("BUILDING_ROUTE_OSRM_PROFILE", "driving") or "driving",
            line_channel_access_token=_env_str("LINE_CHANNEL_ACCESS_TOKEN"),
            line_channel_secret=_env_str("LINE_CHANNEL_SECRET"),
            line_webhook_enabled=_env_bool("LINE_WEBHOOK_ENABLED", False),
            line_default_group_id=_env_str("LINE_DEFAULT_GROUP_ID"),
            line_incident_notify_enabled=_env_bool("LINE_INCIDENT_NOTIFY_ENABLED", False),
            line_public_base_url=_env_str("LINE_PUBLIC_BASE_URL"),
            line_account_linking_enabled=_env_bool("LINE_ACCOUNT_LINKING_ENABLED", False),
            line_account_link_encryption_keys=_env_csv("LINE_ACCOUNT_LINK_ENCRYPTION_KEYS"),
            line_destination_id=_env_str("LINE_DESTINATION_ID"),
            line_natural_language_enabled=_env_bool("LINE_NATURAL_LANGUAGE_ENABLED", False),
            line_natural_language_canary_org_ids=_env_csv("LINE_NATURAL_LANGUAGE_CANARY_ORG_IDS"),
            line_navigation_allowed_hosts=_env_csv("LINE_NAVIGATION_ALLOWED_HOSTS"),
            codex_cli_path=_env_str("CODEX_CLI_PATH", "codex") or "codex",
            codex_text_model=_env_str("CODEX_TEXT_MODEL", "gpt-5.5") or "gpt-5.5",
            codex_text_timeout_seconds=_env_int("CODEX_TEXT_TIMEOUT_SECONDS", 600),
            codex_home=_env_str("CODEX_HOME"),
            gpt_image_oauth_command=_env_str("GPT_IMAGE_OAUTH_COMMAND"),
            gpt_image_oauth_model=_env_str("GPT_IMAGE_OAUTH_MODEL", "gpt-image-2") or "gpt-image-2",
            gpt_image_oauth_timeout_seconds=_env_int("GPT_IMAGE_OAUTH_TIMEOUT_SECONDS", 900),
            gpt_image_oauth_size=_env_str("GPT_IMAGE_OAUTH_SIZE", "1536x1024") or "1536x1024",
            gpt_image_oauth_output_format=_env_str("GPT_IMAGE_OAUTH_OUTPUT_FORMAT", "png") or "png",
            worldlabs_api_key=_env_str("WORLDLABS_API_KEY"),
            worldlabs_model=_env_str("WORLDLABS_MODEL", "marble-1.1-plus") or "marble-1.1-plus",
            worldlabs_operation_timeout_seconds=_env_int("WORLDLABS_OPERATION_TIMEOUT_SECONDS", 3600),
            ollama_base_url=(_env_str("OLLAMA_BASE_URL", "http://localhost:11434") or "http://localhost:11434").rstrip("/"),
            ollama_qwen_vlm_model=_env_str("OLLAMA_QWEN_VLM_MODEL", "qwen2.5vl:7b") or "qwen2.5vl:7b",
            ollama_request_timeout_seconds=_env_int("OLLAMA_REQUEST_TIMEOUT_SECONDS", 120),
            industrial_storage_provider=_env_str("STORAGE_PROVIDER", "local") or "local",
            industrial_storage_base_path=(
                _env_str("STORAGE_BASE_PATH", "./storage/industrial-data-engine")
                or "./storage/industrial-data-engine"
            ),
            boxer_repo_path=_env_str("BOXER_REPO_PATH"),
            boxer_checkpoint_path=_env_str("BOXER_CHECKPOINT_PATH"),
            boxer_annotation_command=_env_str("BOXER_ANNOTATION_COMMAND"),
            gsplat_python_env=_env_str("GSPLAT_PYTHON_ENV"),
            gsplat_render_command=_env_str("GSPLAT_RENDER_COMMAND"),
            enable_ego_planner=_env_bool("ENABLE_EGO_PLANNER", False),
            ego_planner_ros_workspace=_env_str("EGO_PLANNER_ROS_WORKSPACE"),
            ego_planner_command=_env_str("EGO_PLANNER_COMMAND"),
            industrial_engine_max_scenes_per_run=_env_int("INDUSTRIAL_ENGINE_MAX_SCENES_PER_RUN", 1),
            industrial_engine_max_incidents_per_scene=_env_int("INDUSTRIAL_ENGINE_MAX_INCIDENTS_PER_SCENE", 5),
            industrial_engine_max_camera_poses=_env_int("INDUSTRIAL_ENGINE_MAX_CAMERA_POSES", 48),
            camera_analysis_provider=_env_str("CAMERA_ANALYSIS_PROVIDER", "disabled") or "disabled",
            camera_analysis_ollama_base_url=(
                _env_str("CAMERA_ANALYSIS_OLLAMA_BASE_URL")
                or (_env_str("OLLAMA_BASE_URL", "http://localhost:11434") or "http://localhost:11434").rstrip("/")
            ).rstrip("/"),
            camera_analysis_ollama_model=(
                _env_str("CAMERA_ANALYSIS_OLLAMA_MODEL")
                or _env_str("OLLAMA_QWEN_VLM_MODEL", "qwen2.5vl:7b")
                or "qwen2.5vl:7b"
            ),
            camera_analysis_ollama_auth_token=_env_str("CAMERA_ANALYSIS_OLLAMA_AUTH_TOKEN"),
            camera_analysis_timeout_seconds=_env_int("CAMERA_ANALYSIS_TIMEOUT_SECONDS", 120),
            site_map_rent_house_sog_key=_env_str("BUILDING_ROUTE_SITE_MAP_RENT_HOUSE_SOG_KEY"),
            site_map_asset_url_ttl_seconds=_env_int("BUILDING_ROUTE_SITE_MAP_ASSET_URL_TTL_SECONDS", 300),
            twin_agent_enabled=_env_bool("TWIN_AGENT_ENABLED", False),
            twin_agent_worker_token=_env_str("TWIN_AGENT_WORKER_TOKEN") or None,
            openbmc_integration_enabled=_env_bool("OPENBMC_INTEGRATION_ENABLED", False),
            openbmc_live_view_enabled=_env_bool("OPENBMC_LIVE_VIEW_ENABLED", False),
            openbmc_command_proposals_enabled=_env_bool("OPENBMC_COMMAND_PROPOSALS_ENABLED", False),
            openbmc_command_execution_enabled=_env_bool("OPENBMC_COMMAND_EXECUTION_ENABLED", False),
            openbmc_read_freshness_seconds=_env_int("OPENBMC_READ_FRESHNESS_SECONDS", 30),
            openbmc_command_freshness_seconds=_env_int("OPENBMC_COMMAND_FRESHNESS_SECONDS", 15),
            openbmc_clock_skew_seconds=_env_int("OPENBMC_CLOCK_SKEW_SECONDS", 120),
            openbmc_confirmation_ttl_seconds=_env_int("OPENBMC_CONFIRMATION_TTL_SECONDS", 300),
            openbmc_execution_ttl_seconds=_env_int("OPENBMC_EXECUTION_TTL_SECONDS", 120),
            openbmc_claim_lease_seconds=_env_int("OPENBMC_CLAIM_LEASE_SECONDS", 30),
        )

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    def validate_runtime(self) -> None:
        openbmc_positive_values = {
            "OPENBMC_READ_FRESHNESS_SECONDS": self.openbmc_read_freshness_seconds,
            "OPENBMC_COMMAND_FRESHNESS_SECONDS": self.openbmc_command_freshness_seconds,
            "OPENBMC_CLOCK_SKEW_SECONDS": self.openbmc_clock_skew_seconds,
            "OPENBMC_CONFIRMATION_TTL_SECONDS": self.openbmc_confirmation_ttl_seconds,
            "OPENBMC_EXECUTION_TTL_SECONDS": self.openbmc_execution_ttl_seconds,
            "OPENBMC_CLAIM_LEASE_SECONDS": self.openbmc_claim_lease_seconds,
        }
        invalid_openbmc_setting = next(
            (name for name, value in openbmc_positive_values.items() if value <= 0),
            None,
        )
        if invalid_openbmc_setting is not None:
            raise ValueError(f"{invalid_openbmc_setting} must be greater than zero")
        if self.openbmc_command_proposals_enabled and not self.openbmc_integration_enabled:
            raise ValueError("OPENBMC_INTEGRATION_ENABLED must be true when command proposals are enabled")
        if self.openbmc_command_execution_enabled and not self.openbmc_command_proposals_enabled:
            raise ValueError("OPENBMC_COMMAND_PROPOSALS_ENABLED must be true when command execution is enabled")
        if self.line_account_linking_enabled:
            if not self.line_destination_id:
                raise ValueError("LINE_DESTINATION_ID must be set when account linking is enabled")
            if not self.line_account_link_encryption_keys:
                raise ValueError("LINE_ACCOUNT_LINK_ENCRYPTION_KEYS must be set when account linking is enabled")
            try:
                for key in self.line_account_link_encryption_keys:
                    Fernet(key.encode("ascii"))
            except (TypeError, ValueError, UnicodeEncodeError) as exc:
                raise ValueError("LINE_ACCOUNT_LINK_ENCRYPTION_KEYS contains an invalid Fernet key") from exc
            if not self.line_webhook_enabled:
                raise ValueError("LINE_WEBHOOK_ENABLED must be true when account linking is enabled")
            if not self.line_channel_access_token:
                raise ValueError("LINE_CHANNEL_ACCESS_TOKEN must be set when account linking is enabled")
            if not self.line_channel_secret:
                raise ValueError("LINE_CHANNEL_SECRET must be set when account linking is enabled")
            if not self.app_origin:
                raise ValueError("BUILDING_ROUTE_APP_ORIGIN must be set when account linking is enabled")
            if not self.line_public_base_url:
                raise ValueError("LINE_PUBLIC_BASE_URL must be set when account linking is enabled")
        if self.environment.lower() not in {"development", "dev", "test"}:
            if not self.app_origin:
                raise ValueError("BUILDING_ROUTE_APP_ORIGIN must be set outside development/test")
            if self.auth_secret_key == "dev-insecure-secret-change-me":
                raise ValueError("BUILDING_ROUTE_AUTH_SECRET_KEY must be set outside development/test")
            if self.bootstrap_operator_enabled:
                raise ValueError("Bootstrap operator must be disabled outside development/test")
