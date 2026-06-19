from __future__ import annotations

from dataclasses import replace
from io import BytesIO
import json

from PIL import Image

from app import camera_analysis
from app.camera_analysis import NoopEquipmentStateProvider, OllamaEquipmentStateProvider, build_equipment_state_provider
from app.models import CameraFrame, EquipmentWatchZone


def test_build_equipment_state_provider_defaults_to_disabled(test_settings) -> None:
    assert build_equipment_state_provider(test_settings) is None


def test_build_equipment_state_provider_uses_ollama_settings(test_settings) -> None:
    settings = replace(
        test_settings,
        camera_analysis_provider="ollama",
        camera_analysis_ollama_base_url="http://ollama.test:11434",
        camera_analysis_ollama_model="qwen2.5vl:3b",
        camera_analysis_ollama_auth_token="proxy-token",
        camera_analysis_timeout_seconds=44,
    )

    provider = build_equipment_state_provider(settings)

    assert isinstance(provider, OllamaEquipmentStateProvider)
    assert provider.base_url == "http://ollama.test:11434"
    assert provider.model == "qwen2.5vl:3b"
    assert provider.auth_token == "proxy-token"
    assert provider.timeout_seconds == 44


def test_build_equipment_state_provider_uses_noop(test_settings) -> None:
    settings = replace(test_settings, camera_analysis_provider="noop")

    provider = build_equipment_state_provider(settings)

    assert isinstance(provider, NoopEquipmentStateProvider)


def test_noop_provider_returns_low_confidence_unknown() -> None:
    provider = NoopEquipmentStateProvider()

    result = provider.analyze(
        frame=CameraFrame(
            id="noop-frame",
            camera_id="camera-1",
            organization_id="org-1",
            captured_at=camera_analysis.utc_now(),
            storage_key="camera-frames/org-1/camera-1/noop-frame.jpg",
            content_type="image/jpeg",
            upload_expires_at=camera_analysis.utc_now(),
        ),
        zone=EquipmentWatchZone(
            camera_id="camera-1",
            organization_id="org-1",
            name="Stack light",
            equipment_name="CNC stack light",
            roi_json={"type": "box", "x": 0, "y": 0, "w": 1, "h": 1},
            expected_state="green",
            alert_on_states_json=["red", "off"],
        ),
        frame_bytes=_jpeg_bytes(),
    )

    assert result.state == "unknown"
    assert result.confidence == 0.0
    assert result.raw_output == {"provider": "noop"}


def test_ollama_provider_sends_roi_image_and_parses_bounded_json(monkeypatch) -> None:
    captured = {}

    def fake_post(base_url, payload, *, timeout_seconds, auth_token):
        captured["base_url"] = base_url
        captured["payload"] = payload
        captured["timeout_seconds"] = timeout_seconds
        captured["auth_token"] = auth_token
        return {"response": json.dumps({"state": "red", "confidence": 1.4, "reason": "Stack light is red."})}

    monkeypatch.setattr(camera_analysis, "_post_ollama_generate", fake_post)
    provider = OllamaEquipmentStateProvider(
        base_url="http://ollama.test:11434/",
        model="qwen2.5vl:7b",
        timeout_seconds=12,
    )

    result = provider.analyze(
        frame=CameraFrame(
            id="provider-frame",
            camera_id="camera-1",
            organization_id="org-1",
            captured_at=camera_analysis.utc_now(),
            storage_key="camera-frames/org-1/camera-1/provider-frame.jpg",
            content_type="image/jpeg",
            upload_expires_at=camera_analysis.utc_now(),
        ),
        zone=EquipmentWatchZone(
            camera_id="camera-1",
            organization_id="org-1",
            name="Stack light",
            equipment_name="CNC stack light",
            roi_json={"type": "box", "x": 0, "y": 0, "w": 1, "h": 1},
            expected_state="green",
            alert_on_states_json=["red", "off"],
        ),
        frame_bytes=_jpeg_bytes(),
    )

    assert captured["base_url"] == "http://ollama.test:11434"
    assert captured["timeout_seconds"] == 12
    assert captured["auth_token"] is None
    assert captured["payload"]["model"] == "qwen2.5vl:7b"
    assert captured["payload"]["format"] == "json"
    assert captured["payload"]["stream"] is False
    assert captured["payload"]["images"]
    assert result.state == "red"
    assert result.confidence == 1.0
    assert result.reason == "Stack light is red."


def test_ollama_generate_adds_authorization_header(monkeypatch) -> None:
    captured = {}

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, traceback):
            return None

        def read(self) -> bytes:
            return b'{"response":"{}"}'

    def fake_urlopen(request, *, timeout):
        captured["authorization"] = request.get_header("Authorization")
        captured["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr(camera_analysis, "urlopen", fake_urlopen)

    response = camera_analysis._post_ollama_generate(
        "http://ollama.test:11434",
        {"model": "qwen2.5vl:7b"},
        timeout_seconds=9,
        auth_token="proxy-token",
    )

    assert captured["authorization"] == "Bearer proxy-token"
    assert captured["timeout"] == 9
    assert response == {"response": "{}"}


def _jpeg_bytes() -> bytes:
    output = BytesIO()
    Image.new("RGB", (8, 8), (255, 0, 0)).save(output, format="JPEG")
    return output.getvalue()
