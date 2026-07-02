from __future__ import annotations

import threading
from dataclasses import dataclass, field
from typing import Any

import uvicorn
from fastapi import FastAPI


@dataclass
class RuntimeStatus:
    status: str = "starting"
    camera: dict[str, Any] = field(default_factory=lambda: {"last_capture_at": None, "last_error": None})
    gauges: dict[str, dict[str, Any]] = field(default_factory=dict)
    mqtt: dict[str, Any] = field(default_factory=lambda: {"connected": False, "queued": 0, "last_error": None})
    platform: dict[str, Any] = field(
        default_factory=lambda: {"enabled": False, "submitted_count": 0, "last_submitted_at": None, "last_error": None}
    )

    def snapshot(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "camera": dict(self.camera),
            "gauges": {key: dict(value) for key, value in self.gauges.items()},
            "mqtt": dict(self.mqtt),
            "platform": dict(self.platform),
        }


def create_app(runtime_status: RuntimeStatus) -> FastAPI:
    app = FastAPI(title="Four Wall Gauge Reader")

    @app.get("/status")
    def get_status() -> dict[str, Any]:
        return runtime_status.snapshot()

    return app


def start_status_server(runtime_status: RuntimeStatus, host: str, port: int) -> threading.Thread:
    app = create_app(runtime_status)

    def run() -> None:
        uvicorn.run(app, host=host, port=port, log_level="warning")

    thread = threading.Thread(target=run, daemon=True)
    thread.start()
    return thread
