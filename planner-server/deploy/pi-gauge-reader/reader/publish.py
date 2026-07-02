from __future__ import annotations

import json
from collections import deque
from dataclasses import dataclass, field
from typing import Any

from .config import MqttConfig


@dataclass
class PublishState:
    connected: bool = False
    queued: int = 0
    last_error: str | None = None


@dataclass
class MqttPublisher:
    config: MqttConfig
    max_queue: int = 1000
    queue: deque[tuple[str, dict[str, Any]]] = field(default_factory=deque)
    client: Any = None
    state: PublishState = field(default_factory=PublishState)

    def start(self) -> None:
        if not self.config.enabled:
            return
        try:
            import paho.mqtt.client as mqtt
        except Exception as exc:  # pragma: no cover - exercised on Pi by install validation.
            self.state.last_error = f"paho_mqtt_unavailable: {exc}"
            return

        self.client = mqtt.Client(client_id=self.config.client_id)
        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        try:
            self.client.connect_async(self.config.host, self.config.port, keepalive=30)
            self.client.loop_start()
        except Exception as exc:
            self.state.last_error = f"mqtt_connect_failed: {exc}"

    def stop(self) -> None:
        if self.client is not None:
            self.client.loop_stop()
            self.client.disconnect()

    def publish_reading(self, gauge_id: str, payload: dict[str, Any]) -> None:
        topic = f"{self.config.base_topic}/gauge/{gauge_id}"
        self._enqueue(topic, payload)
        self.flush()

    def flush(self) -> None:
        if not self.client or not self.state.connected:
            self.state.queued = len(self.queue)
            return

        while self.queue:
            topic, payload = self.queue[0]
            result = self.client.publish(topic, json.dumps(payload, separators=(",", ":")), qos=1)
            if result.rc != 0:
                self.state.last_error = f"mqtt_publish_failed_rc_{result.rc}"
                break
            self.queue.popleft()
        self.state.queued = len(self.queue)

    def _enqueue(self, topic: str, payload: dict[str, Any]) -> None:
        self.queue.append((topic, payload))
        while len(self.queue) > self.max_queue:
            self.queue.popleft()
        self.state.queued = len(self.queue)

    def _on_connect(self, _client, _userdata, _flags, rc) -> None:
        self.state.connected = rc == 0
        self.state.last_error = None if rc == 0 else f"mqtt_connect_rc_{rc}"
        self.flush()

    def _on_disconnect(self, _client, _userdata, rc) -> None:
        self.state.connected = False
        if rc != 0:
            self.state.last_error = f"mqtt_disconnect_rc_{rc}"
