from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from threading import Lock
import time

from fastapi import HTTPException, Request, status


@dataclass(frozen=True)
class RateLimitRule:
    max_attempts: int
    window_seconds: int


class RateLimiter:
    def __init__(self) -> None:
        self._attempts: dict[str, deque[float]] = {}
        self._lock = Lock()

    def check(self, bucket: str, rule: RateLimitRule) -> None:
        now = time.monotonic()
        cutoff = now - rule.window_seconds
        with self._lock:
            attempts = self._attempts.setdefault(bucket, deque())
            while attempts and attempts[0] <= cutoff:
                attempts.popleft()
            if len(attempts) >= rule.max_attempts:
                raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="rate_limit_exceeded")
            attempts.append(now)


def client_identity(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip() or "unknown"
    if request.client is not None and request.client.host:
        return request.client.host
    return "unknown"
