from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .config import PlatformConfig


@dataclass
class PlatformSinkState:
    enabled: bool = False
    last_error: str | None = None
    last_submitted_at: str | None = None
    submitted_count: int = 0


class PlatformSink:
    def __init__(self, config: PlatformConfig) -> None:
        self.config = config
        self.state = PlatformSinkState(enabled=config.enabled)

    def submit_readings(self, readings: list[dict[str, Any]]) -> None:
        if not self.config.enabled:
            return
        if not self.config.api_base_url or not self.config.device_token:
            self.state.last_error = "platform_sink_missing_api_url_or_device_token"
            return

        payload = {"readings": [_to_platform_reading(reading) for reading in readings]}
        data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        request = Request(
            f"{self.config.api_base_url}/v1/camera-ingest/gauge-readings",
            data=data,
            headers={
                "Authorization": f"Bearer {self.config.device_token}",
                "Content-Type": "application/json",
                "User-Agent": "fourwall-gauge-reader/1.0",
            },
            method="POST",
        )
        try:
            with urlopen(request, timeout=self.config.timeout_sec) as response:
                response.read()
            self.state.last_error = None
            self.state.submitted_count += len(readings)
            self.state.last_submitted_at = max((str(reading["ts"]) for reading in readings), default=None)
        except HTTPError as exc:
            body = exc.read(512).decode("utf-8", errors="replace")
            self.state.last_error = f"platform_http_{exc.code}: {body}"
        except URLError as exc:
            self.state.last_error = f"platform_url_error: {exc.reason}"
        except TimeoutError:
            self.state.last_error = "platform_timeout"


def _to_platform_reading(reading: dict[str, Any]) -> dict[str, Any]:
    return {
        "gaugeId": reading["gauge_id"],
        "label": reading["label"],
        "value": reading["value"],
        "unit": reading["unit"],
        "confidence": reading["confidence"],
        "rawPosition": reading["raw_position"],
        "status": reading["status"],
        "source": reading["source"],
        "capturedAt": reading["ts"],
        "metadata": {
            "detector": "classical_linear_meter",
            "message": reading.get("message"),
            "accepted": reading.get("accepted"),
        },
    }
