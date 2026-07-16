from __future__ import annotations

import json

import pytest

from fourwall_openbmc_connector.config import ConfigError, load_config


def write_config(tmp_path, *, cloud_url="https://api.example.com", collector=None):
    path = tmp_path / "config.json"
    path.write_text(
        json.dumps(
            {
                "cloud": {
                    "api_base_url": cloud_url,
                    "connector_token_env": "TEST_FWOBMC_TOKEN",
                },
                "collector": collector or {"base_url": "http://127.0.0.1:8080"},
                "state_path": "state.json",
            }
        ),
        encoding="utf-8",
    )
    return path


def test_config_reads_secrets_and_collector_url_from_environment(tmp_path, monkeypatch):
    monkeypatch.setenv("TEST_FWOBMC_TOKEN", "fwobmc_secret")
    monkeypatch.setenv("TEST_COLLECTOR_URL", "http://nckusoc:8080")
    path = write_config(
        tmp_path,
        collector={
            "base_url_env": "TEST_COLLECTOR_URL",
            "allowed_hostnames": ["nckusoc"],
        },
    )

    config = load_config(path)

    assert config.cloud.token == "fwobmc_secret"
    assert config.collector.base_url == "http://nckusoc:8080"
    assert config.state_path == tmp_path / "state.json"
    assert config.heartbeat_interval_seconds == 5
    assert "fwobmc_secret" not in repr(config.cloud)


def test_cloud_http_is_rejected(tmp_path, monkeypatch):
    monkeypatch.setenv("TEST_FWOBMC_TOKEN", "fwobmc_secret")
    path = write_config(tmp_path, cloud_url="http://api.example.com")

    with pytest.raises(ConfigError, match="HTTPS"):
        load_config(path)


def test_public_collector_is_rejected(tmp_path, monkeypatch):
    monkeypatch.setenv("TEST_FWOBMC_TOKEN", "fwobmc_secret")
    path = write_config(
        tmp_path, collector={"base_url": "http://collector.example.com:8080"}
    )

    with pytest.raises(ConfigError, match="loopback"):
        load_config(path)


def test_private_collector_requires_explicit_switch(tmp_path, monkeypatch):
    monkeypatch.setenv("TEST_FWOBMC_TOKEN", "fwobmc_secret")
    path = write_config(
        tmp_path,
        collector={
            "base_url": "http://192.168.1.20:8080",
            "allow_private_lan": True,
        },
    )

    assert load_config(path).collector.base_url == "http://192.168.1.20:8080"
