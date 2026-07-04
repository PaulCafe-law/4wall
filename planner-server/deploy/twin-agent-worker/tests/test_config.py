from __future__ import annotations

from pathlib import Path

from agent_worker.config import load_config


def test_load_config_reads_sections_and_resolves_runtime_dir(tmp_path: Path, monkeypatch) -> None:
    for name in ("TWIN_AGENT_ENABLED", "TWIN_AGENT_API_BASE_URL", "TWIN_AGENT_WORKER_TOKEN", "TWIN_AGENT_AUTH_CACHE_DIR"):
        monkeypatch.delenv(name, raising=False)
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        """
platform:
  enabled: true
  api_base_url: "https://api.example.com/"
  worker_token: "fwtwin_yaml"
  timeout_sec: 5
  poll_interval_sec: 2.5
agent:
  model: "gpt-5"
  auth_cache_dir: ""
  command:
    - "python"
    - "bridge.py"
    - "--model"
    - "{model}"
  timeout_sec: 30
  max_output_chars: 1200
debug:
  runtime_dir: "runtime"
""".strip(),
        encoding="utf-8",
    )

    config = load_config(config_path)

    assert config.platform.enabled is True
    assert config.platform.api_base_url == "https://api.example.com"
    assert config.platform.worker_token == "fwtwin_yaml"
    assert config.platform.timeout_sec == 5.0
    assert config.platform.poll_interval_sec == 2.5
    assert config.agent.model == "gpt-5"
    assert config.agent.command == ["python", "bridge.py", "--model", "{model}"]
    assert config.agent.timeout_sec == 30.0
    assert config.agent.auth_cache_dir is None
    assert config.agent.max_output_chars == 1200
    assert config.debug.runtime_dir == tmp_path / "runtime"


def test_environment_overrides_platform_settings(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("TWIN_AGENT_ENABLED", "true")
    monkeypatch.setenv("TWIN_AGENT_API_BASE_URL", "https://env.example.com/")
    monkeypatch.setenv("TWIN_AGENT_WORKER_TOKEN", "fwtwin_env")
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        """
platform:
  enabled: false
  api_base_url: "https://yaml.example.com"
  worker_token: "fwtwin_yaml"
""".strip(),
        encoding="utf-8",
    )

    config = load_config(config_path)

    assert config.platform.enabled is True
    assert config.platform.api_base_url == "https://env.example.com"
    assert config.platform.worker_token == "fwtwin_env"


def test_missing_sections_fall_back_to_defaults(tmp_path: Path, monkeypatch) -> None:
    for name in ("TWIN_AGENT_ENABLED", "TWIN_AGENT_API_BASE_URL", "TWIN_AGENT_WORKER_TOKEN", "TWIN_AGENT_COMMAND"):
        monkeypatch.delenv(name, raising=False)
    config_path = tmp_path / "config.yaml"
    config_path.write_text("platform: {}\n", encoding="utf-8")

    config = load_config(config_path)

    assert config.platform.enabled is False
    assert config.platform.poll_interval_sec == 1.0
    assert config.agent.model == "latest"
    assert config.agent.command == []
    assert config.agent.timeout_sec == 45.0
    assert config.agent.max_output_chars == 4000
    assert config.debug.runtime_dir == tmp_path / "runtime"
