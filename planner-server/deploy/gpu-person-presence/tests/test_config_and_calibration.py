from __future__ import annotations

import yaml

from presence_worker.config import load_config
from scripts.calibrate_homography import compute_homography


def test_load_config_expands_env_headers(tmp_path, monkeypatch) -> None:
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        yaml.safe_dump(
            {
                "frame_source": {
                    "mode": "url",
                    "url": "https://api.example.test/v1/camera-ingest/latest-frame/image",
                    "headers": {"Authorization": "Bearer ${PERSON_PRESENCE_DEVICE_TOKEN}"},
                },
                "platform": {"api_base_url": "https://api.example.test"},
                "debug": {"runtime_dir": "runtime"},
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("PERSON_PRESENCE_DEVICE_TOKEN", "secret-token")
    monkeypatch.setenv("PERSON_PRESENCE_ENABLED", "true")

    config = load_config(config_path)

    assert config.frame_source.headers["Authorization"] == "Bearer secret-token"
    assert config.platform.enabled is True
    assert config.debug.runtime_dir == tmp_path / "runtime"


def test_calibrate_homography_reports_low_error_for_synthetic_points() -> None:
    points = [
        {"image": [0, 0], "world": [10, -5]},
        {"image": [100, 0], "world": [12, -5]},
        {"image": [0, 100], "world": [10, -2]},
        {"image": [100, 100], "world": [12, -2]},
    ]

    matrix, errors = compute_homography(points)

    assert matrix[0][0] == 0.02
    assert matrix[1][1] == 0.03
    assert max(item["error"] for item in errors) < 0.0001
