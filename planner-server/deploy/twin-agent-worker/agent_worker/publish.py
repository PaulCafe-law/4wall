from __future__ import annotations

from collections import deque
from dataclasses import dataclass
import json
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .config import PlatformConfig


RETRY_QUEUE_SIZE = 20


@dataclass
class ResultSinkState:
    enabled: bool = False
    last_error: str | None = None
    last_submitted_job_id: str | None = None
    submitted_count: int = 0
    queued_count: int = 0


@dataclass
class PendingResult:
    job_id: str
    payload: dict[str, Any]
    attempts: int = 0
    next_retry_at: float = 0.0


class ResultSink:
    def __init__(self, config: PlatformConfig) -> None:
        self.config = config
        self.state = ResultSinkState(enabled=config.enabled)
        self._pending: deque[PendingResult] = deque(maxlen=RETRY_QUEUE_SIZE)

    def submit_job_result(self, job_id: str, result: dict[str, Any]) -> None:
        if not self.config.enabled:
            self.state.last_error = "platform_sink_disabled"
            return
        self.flush_pending()
        if self._post_json(f"/v1/twin-agent/jobs/{job_id}/result", result):
            self.state.submitted_count += 1
            self.state.last_submitted_job_id = job_id
            return
        if self._last_error_is_permanent():
            return
        self._enqueue(job_id, result)

    def flush_pending(self) -> None:
        if not self.config.enabled or not self._pending:
            return
        now = time.monotonic()
        while self._pending and self._pending[0].next_retry_at <= now:
            item = self._pending[0]
            if self._post_json(f"/v1/twin-agent/jobs/{item.job_id}/result", item.payload):
                self._pending.popleft()
                self.state.submitted_count += 1
                self.state.last_submitted_job_id = item.job_id
                continue
            if self._last_error_is_permanent():
                self._pending.popleft()
                continue
            item.attempts += 1
            item.next_retry_at = now + min(300.0, 2.0 ** min(item.attempts, 8))
            break
        self.state.queued_count = len(self._pending)

    def _enqueue(self, job_id: str, result: dict[str, Any]) -> None:
        if len(self._pending) == self._pending.maxlen:
            self._pending.popleft()
        self._pending.append(PendingResult(job_id=job_id, payload=result, attempts=1, next_retry_at=time.monotonic() + 2.0))
        self.state.queued_count = len(self._pending)

    def _last_error_is_permanent(self) -> bool:
        return bool(self.state.last_error and self.state.last_error.startswith(("platform_http_404", "platform_http_409")))

    def _post_json(self, path: str, payload: dict[str, Any]) -> bool:
        if not self.config.api_base_url or not self.config.worker_token:
            self.state.last_error = "platform_sink_missing_api_url_or_worker_token"
            return False
        data = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        request = Request(
            f"{self.config.api_base_url}{path}",
            data=data,
            headers={
                "Authorization": f"Bearer {self.config.worker_token}",
                "Content-Type": "application/json",
                "User-Agent": "fourwall-twin-agent/1.0",
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
