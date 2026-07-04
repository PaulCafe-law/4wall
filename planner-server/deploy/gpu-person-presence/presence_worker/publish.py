from __future__ import annotations

from collections import deque
from dataclasses import dataclass
import json
import time
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
    queued_count: int = 0


@dataclass
class PendingObservation:
    payload: dict[str, Any]
    attempts: int = 0
    next_retry_at: float = 0.0


class PlatformSink:
    def __init__(self, config: PlatformConfig) -> None:
        self.config = config
        self.state = PlatformSinkState(enabled=config.enabled)
        self._pending: deque[PendingObservation] = deque(maxlen=max(1, config.retry_queue_size))

    def submit_person_observation(self, observation: dict[str, Any]) -> None:
        if not self.config.enabled:
            return
        self.flush_pending()
        if self._post_json("/v1/camera-ingest/person-observations", observation):
            self.state.submitted_count += 1
            self.state.last_submitted_at = str(observation.get("capturedAt"))
            return
        self._enqueue(observation)

    def flush_pending(self) -> None:
        if not self.config.enabled or not self._pending:
            return
        now = time.monotonic()
        while self._pending and self._pending[0].next_retry_at <= now:
            item = self._pending[0]
            if self._post_json("/v1/camera-ingest/person-observations", item.payload):
                self._pending.popleft()
                self.state.submitted_count += 1
                self.state.last_submitted_at = str(item.payload.get("capturedAt"))
                continue
            item.attempts += 1
            item.next_retry_at = now + min(300.0, 2.0 ** min(item.attempts, 8))
            break
        self.state.queued_count = len(self._pending)

    def _enqueue(self, observation: dict[str, Any]) -> None:
        if len(self._pending) == self._pending.maxlen:
            self._pending.popleft()
        self._pending.append(PendingObservation(payload=observation, attempts=1, next_retry_at=time.monotonic() + 2.0))
        self.state.queued_count = len(self._pending)

    def _post_json(self, path: str, payload: dict[str, Any]) -> bool:
        if not self.config.api_base_url or not self.config.device_token:
            self.state.last_error = "platform_sink_missing_api_url_or_device_token"
            return False
        data = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        request = Request(
            f"{self.config.api_base_url}{path}",
            data=data,
            headers={
                "Authorization": f"Bearer {self.config.device_token}",
                "Content-Type": "application/json",
                "User-Agent": "fourwall-person-presence/1.0",
            },
            method="POST",
        )
        try:
            with urlopen(request, timeout=self.config.timeout_sec) as response:
                response.read()
            self.state.last_error = None
            return True
        except HTTPError as exc:
            body = exc.read(512).decode("utf-8", errors="replace")
            self.state.last_error = f"platform_http_{exc.code}: {body}"
        except URLError as exc:
            self.state.last_error = f"platform_url_error: {exc.reason}"
        except TimeoutError:
            self.state.last_error = "platform_timeout"
        return False
