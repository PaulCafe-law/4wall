from cryptography.fernet import Fernet
import pytest

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
    monkeypatch.setenv("LINE_CHANNEL_ACCESS_TOKEN", " token ")
    monkeypatch.setenv("LINE_CHANNEL_SECRET", " secret ")
    monkeypatch.setenv("LINE_WEBHOOK_ENABLED", " true ")
    monkeypatch.setenv("LINE_DEFAULT_GROUP_ID", " group-1 ")
    monkeypatch.setenv("LINE_INCIDENT_NOTIFY_ENABLED", " true ")
    monkeypatch.setenv("LINE_PUBLIC_BASE_URL", " https://four-wall-api-staging.onrender.com/ ")
    monkeypatch.setenv("LINE_ACCOUNT_LINKING_ENABLED", " true ")
    monkeypatch.setenv("LINE_ACCOUNT_LINK_ENCRYPTION_KEYS", " key-new , key-old ")
    monkeypatch.setenv("LINE_DESTINATION_ID", " Uofficial-account ")
    monkeypatch.setenv("CODEX_CLI_PATH", " /usr/local/bin/codex ")
    monkeypatch.setenv("CODEX_TEXT_MODEL", " gpt-test ")
    monkeypatch.setenv("CODEX_TEXT_TIMEOUT_SECONDS", " 321 ")
    monkeypatch.setenv("CODEX_HOME", " /srv/codex-home ")
    monkeypatch.setenv("GPT_IMAGE_OAUTH_COMMAND", " /usr/local/bin/gpt-image-oauth ")
    monkeypatch.setenv("GPT_IMAGE_OAUTH_MODEL", " gpt-image-test ")
    monkeypatch.setenv("GPT_IMAGE_OAUTH_TIMEOUT_SECONDS", " 901 ")
    monkeypatch.setenv("GPT_IMAGE_OAUTH_SIZE", " 1024x1024 ")
    monkeypatch.setenv("GPT_IMAGE_OAUTH_OUTPUT_FORMAT", " png ")
    monkeypatch.setenv("WORLDLABS_API_KEY", " worldlabs-key ")
    monkeypatch.setenv("WORLDLABS_MODEL", " marble-test ")
    monkeypatch.setenv("WORLDLABS_OPERATION_TIMEOUT_SECONDS", " 1800 ")
    monkeypatch.setenv("OLLAMA_BASE_URL", " http://ollama.local:11434/ ")
    monkeypatch.setenv("OLLAMA_QWEN_VLM_MODEL", " qwen2.5vl:3b ")
    monkeypatch.setenv("OLLAMA_REQUEST_TIMEOUT_SECONDS", " 33 ")
    monkeypatch.setenv("STORAGE_PROVIDER", " local ")
    monkeypatch.setenv("STORAGE_BASE_PATH", " ./storage/test ")
    monkeypatch.setenv("BOXER_REPO_PATH", " C:/boxer ")
    monkeypatch.setenv("BOXER_CHECKPOINT_PATH", " C:/boxer/checkpoint.pt ")
    monkeypatch.setenv("BOXER_ANNOTATION_COMMAND", " python annotate.py --output-dir {output_dir} ")
    monkeypatch.setenv("GSPLAT_PYTHON_ENV", " C:/venv/Scripts/python.exe ")
    monkeypatch.setenv("GSPLAT_RENDER_COMMAND", " python render.py --output-dir {output_dir} ")
    monkeypatch.setenv("ENABLE_EGO_PLANNER", " true ")
    monkeypatch.setenv("EGO_PLANNER_ROS_WORKSPACE", " C:/ego ")
    monkeypatch.setenv("EGO_PLANNER_COMMAND", " ros2 launch ego planner.launch.py ")
    monkeypatch.setenv("INDUSTRIAL_ENGINE_MAX_SCENES_PER_RUN", " 2 ")
    monkeypatch.setenv("INDUSTRIAL_ENGINE_MAX_INCIDENTS_PER_SCENE", " 7 ")
    monkeypatch.setenv("INDUSTRIAL_ENGINE_MAX_CAMERA_POSES", " 64 ")
    monkeypatch.setenv("CAMERA_ANALYSIS_PROVIDER", " ollama ")
    monkeypatch.setenv("CAMERA_ANALYSIS_OLLAMA_BASE_URL", " http://camera-ollama.local:11434/ ")
    monkeypatch.setenv("CAMERA_ANALYSIS_OLLAMA_MODEL", " qwen2.5vl:7b ")
    monkeypatch.setenv("CAMERA_ANALYSIS_OLLAMA_AUTH_TOKEN", " proxy-token ")
    monkeypatch.setenv("CAMERA_ANALYSIS_TIMEOUT_SECONDS", " 44 ")

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
    assert settings.line_channel_access_token == "token"
    assert settings.line_channel_secret == "secret"
    assert settings.line_webhook_enabled is True
    assert settings.line_default_group_id == "group-1"
    assert settings.line_incident_notify_enabled is True
    assert settings.line_public_base_url == "https://four-wall-api-staging.onrender.com/"
    assert settings.line_account_linking_enabled is True
    assert settings.line_account_link_encryption_keys == ("key-new", "key-old")
    assert settings.line_destination_id == "Uofficial-account"
    assert settings.codex_cli_path == "/usr/local/bin/codex"
    assert settings.codex_text_model == "gpt-test"
    assert settings.codex_text_timeout_seconds == 321
    assert settings.codex_home == "/srv/codex-home"
    assert settings.gpt_image_oauth_command == "/usr/local/bin/gpt-image-oauth"
    assert settings.gpt_image_oauth_model == "gpt-image-test"
    assert settings.gpt_image_oauth_timeout_seconds == 901
    assert settings.gpt_image_oauth_size == "1024x1024"
    assert settings.gpt_image_oauth_output_format == "png"
    assert settings.worldlabs_api_key == "worldlabs-key"
    assert settings.worldlabs_model == "marble-test"
    assert settings.worldlabs_operation_timeout_seconds == 1800
    assert settings.ollama_base_url == "http://ollama.local:11434"
    assert settings.ollama_qwen_vlm_model == "qwen2.5vl:3b"
    assert settings.ollama_request_timeout_seconds == 33
    assert settings.industrial_storage_provider == "local"
    assert settings.industrial_storage_base_path == "./storage/test"
    assert settings.boxer_repo_path == "C:/boxer"
    assert settings.boxer_checkpoint_path == "C:/boxer/checkpoint.pt"
    assert settings.boxer_annotation_command == "python annotate.py --output-dir {output_dir}"
    assert settings.gsplat_python_env == "C:/venv/Scripts/python.exe"
    assert settings.gsplat_render_command == "python render.py --output-dir {output_dir}"
    assert settings.enable_ego_planner is True
    assert settings.ego_planner_ros_workspace == "C:/ego"
    assert settings.ego_planner_command == "ros2 launch ego planner.launch.py"
    assert settings.industrial_engine_max_scenes_per_run == 2
    assert settings.industrial_engine_max_incidents_per_scene == 7
    assert settings.industrial_engine_max_camera_poses == 64
    assert settings.camera_analysis_provider == "ollama"
    assert settings.camera_analysis_ollama_base_url == "http://camera-ollama.local:11434"
    assert settings.camera_analysis_ollama_model == "qwen2.5vl:7b"
    assert settings.camera_analysis_ollama_auth_token == "proxy-token"
    assert settings.camera_analysis_timeout_seconds == 44


def test_codex_text_model_defaults_to_chatgpt_oauth_supported_model(monkeypatch):
    monkeypatch.setenv("CODEX_TEXT_MODEL", " ")

    settings = Settings.from_env()

    assert settings.codex_text_model == "gpt-5.5"


def test_account_linking_requires_dedicated_encryption_keys(monkeypatch):
    monkeypatch.setenv("LINE_ACCOUNT_LINKING_ENABLED", "true")
    monkeypatch.setenv("LINE_DESTINATION_ID", "Uofficial-account")
    monkeypatch.delenv("LINE_ACCOUNT_LINK_ENCRYPTION_KEYS", raising=False)

    settings = Settings.from_env()

    try:
        settings.validate_runtime()
    except ValueError as exc:
        assert str(exc) == "LINE_ACCOUNT_LINK_ENCRYPTION_KEYS must be set when account linking is enabled"
    else:
        raise AssertionError("enabled account linking must fail closed without encryption keys")


def test_account_linking_requires_destination_and_valid_fernet_keys(monkeypatch):
    valid_key = Fernet.generate_key().decode("ascii")
    monkeypatch.setenv("LINE_ACCOUNT_LINKING_ENABLED", "true")
    monkeypatch.setenv("LINE_ACCOUNT_LINK_ENCRYPTION_KEYS", valid_key)
    monkeypatch.delenv("LINE_DESTINATION_ID", raising=False)

    missing_destination = Settings.from_env()
    with_destination_error = None
    try:
        missing_destination.validate_runtime()
    except ValueError as exc:
        with_destination_error = str(exc)
    assert with_destination_error == "LINE_DESTINATION_ID must be set when account linking is enabled"

    monkeypatch.setenv("LINE_DESTINATION_ID", "Uofficial-account")
    monkeypatch.setenv("LINE_ACCOUNT_LINK_ENCRYPTION_KEYS", f"{valid_key},not-a-fernet-key")
    invalid_keys = Settings.from_env()
    with_key_error = None
    try:
        invalid_keys.validate_runtime()
    except ValueError as exc:
        with_key_error = str(exc)
    assert with_key_error == "LINE_ACCOUNT_LINK_ENCRYPTION_KEYS contains an invalid Fernet key"


@pytest.mark.parametrize(
    ("missing_env", "expected_error"),
    [
        ("LINE_WEBHOOK_ENABLED", "LINE_WEBHOOK_ENABLED must be true when account linking is enabled"),
        (
            "LINE_CHANNEL_ACCESS_TOKEN",
            "LINE_CHANNEL_ACCESS_TOKEN must be set when account linking is enabled",
        ),
        ("LINE_CHANNEL_SECRET", "LINE_CHANNEL_SECRET must be set when account linking is enabled"),
        (
            "BUILDING_ROUTE_APP_ORIGIN",
            "BUILDING_ROUTE_APP_ORIGIN must be set when account linking is enabled",
        ),
        ("LINE_PUBLIC_BASE_URL", "LINE_PUBLIC_BASE_URL must be set when account linking is enabled"),
    ],
)
def test_account_linking_requires_all_runtime_prerequisites(monkeypatch, missing_env, expected_error):
    _set_valid_account_linking_env(monkeypatch)
    monkeypatch.delenv(missing_env)

    with pytest.raises(ValueError, match=f"^{expected_error}$"):
        Settings.from_env().validate_runtime()


def test_account_linking_accepts_complete_runtime_configuration(monkeypatch):
    _set_valid_account_linking_env(monkeypatch)

    Settings.from_env().validate_runtime()


def _set_valid_account_linking_env(monkeypatch) -> None:
    monkeypatch.setenv("LINE_ACCOUNT_LINKING_ENABLED", "true")
    monkeypatch.setenv("LINE_ACCOUNT_LINK_ENCRYPTION_KEYS", Fernet.generate_key().decode("ascii"))
    monkeypatch.setenv("LINE_DESTINATION_ID", "Uofficial-account")
    monkeypatch.setenv("LINE_WEBHOOK_ENABLED", "true")
    monkeypatch.setenv("LINE_CHANNEL_ACCESS_TOKEN", "channel-token")
    monkeypatch.setenv("LINE_CHANNEL_SECRET", "channel-secret")
    monkeypatch.setenv("BUILDING_ROUTE_APP_ORIGIN", "https://app.example.test")
    monkeypatch.setenv("LINE_PUBLIC_BASE_URL", "https://api.example.test")
