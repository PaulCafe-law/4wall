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
    monkeypatch.setenv("GEMINI_API_KEY", " gemini-key ")
    monkeypatch.setenv("GEMINI_TEXT_MODEL", " gemini-test ")
    monkeypatch.setenv("WORLDLABS_API_KEY", " worldlabs-key ")
    monkeypatch.setenv("WORLDLABS_MODEL", " marble-test ")
    monkeypatch.setenv("OLLAMA_BASE_URL", " http://ollama.local:11434/ ")
    monkeypatch.setenv("OLLAMA_QWEN_VLM_MODEL", " qwen2.5vl:3b ")
    monkeypatch.setenv("OLLAMA_REQUEST_TIMEOUT_SECONDS", " 33 ")
    monkeypatch.setenv("STORAGE_PROVIDER", " local ")
    monkeypatch.setenv("STORAGE_BASE_PATH", " ./storage/test ")
    monkeypatch.setenv("BOXER_REPO_PATH", " C:/boxer ")
    monkeypatch.setenv("BOXER_CHECKPOINT_PATH", " C:/boxer/checkpoint.pt ")
    monkeypatch.setenv("GSPLAT_PYTHON_ENV", " C:/venv/Scripts/python.exe ")
    monkeypatch.setenv("ENABLE_EGO_PLANNER", " true ")
    monkeypatch.setenv("EGO_PLANNER_ROS_WORKSPACE", " C:/ego ")
    monkeypatch.setenv("INDUSTRIAL_ENGINE_MAX_SCENES_PER_RUN", " 2 ")
    monkeypatch.setenv("INDUSTRIAL_ENGINE_MAX_INCIDENTS_PER_SCENE", " 7 ")
    monkeypatch.setenv("INDUSTRIAL_ENGINE_MAX_CAMERA_POSES", " 64 ")

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
    assert settings.gemini_api_key == "gemini-key"
    assert settings.gemini_text_model == "gemini-test"
    assert settings.worldlabs_api_key == "worldlabs-key"
    assert settings.worldlabs_model == "marble-test"
    assert settings.ollama_base_url == "http://ollama.local:11434"
    assert settings.ollama_qwen_vlm_model == "qwen2.5vl:3b"
    assert settings.ollama_request_timeout_seconds == 33
    assert settings.industrial_storage_provider == "local"
    assert settings.industrial_storage_base_path == "./storage/test"
    assert settings.boxer_repo_path == "C:/boxer"
    assert settings.boxer_checkpoint_path == "C:/boxer/checkpoint.pt"
    assert settings.gsplat_python_env == "C:/venv/Scripts/python.exe"
    assert settings.enable_ego_planner is True
    assert settings.ego_planner_ros_workspace == "C:/ego"
    assert settings.industrial_engine_max_scenes_per_run == 2
    assert settings.industrial_engine_max_incidents_per_scene == 7
    assert settings.industrial_engine_max_camera_poses == 64
