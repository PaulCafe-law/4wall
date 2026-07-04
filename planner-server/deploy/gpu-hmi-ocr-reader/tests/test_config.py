from __future__ import annotations

from pathlib import Path

from ocr_worker.config import load_config


def test_frame_source_headers_expand_environment_variables(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("HMI_OCR_DEVICE_TOKEN", "fwcam_test")
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        """
frame_source:
  mode: "url"
  url: "https://four-wall-api.onrender.com/v1/camera-ingest/latest-frame/image"
  headers:
    Authorization: "Bearer ${HMI_OCR_DEVICE_TOKEN}"
platform:
  enabled: false
hmi:
  camera_label: "PoE Camera 192.168.1.10"
  detector_name: "paddleocr_ppocrv5_hmi"
  roi: [925, 550, 450, 325]
  fields: []
debug:
  runtime_dir: "runtime"
""".strip(),
        encoding="utf-8",
    )

    config = load_config(config_path)

    assert config.frame_source.headers["Authorization"] == "Bearer fwcam_test"
