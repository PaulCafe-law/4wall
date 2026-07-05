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
    assert config.reference_resolution is None


def test_reference_resolution_and_fractional_rois_parse(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        """
frame_source:
  mode: "file"
  path: "samples/hc600.jpg"
platform:
  enabled: false
reference_resolution: [2560, 1440]
hmi:
  camera_label: "PoE Camera 192.168.1.10"
  detector_name: "paddleocr_ppocrv5_hmi"
  roi: [925, 550, 450, 325]
  fields: []
work_order:
  enabled: true
  roi: [0.3516, 0.0833, 0.2148, 0.2326]
debug:
  runtime_dir: "runtime"
""".strip(),
        encoding="utf-8",
    )

    config = load_config(config_path)

    assert config.reference_resolution == (2560, 1440)
    # Pixel ROIs stay exact ints so published metadata is unchanged.
    assert config.hmi.roi == (925, 550, 450, 325)
    assert all(isinstance(part, int) for part in config.hmi.roi)
    # Fractional ROIs keep their float values for frame-relative scaling.
    assert config.work_order.roi == (0.3516, 0.0833, 0.2148, 0.2326)
