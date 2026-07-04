from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .config import PlatformConfig


class JobSourceError(RuntimeError):
    pass


@dataclass(frozen=True)
class PolledJob:
    job: dict[str, Any] | None
    world: dict[str, Any] | None
    world_age_seconds: float | None


def fetch_job(config: PlatformConfig) -> PolledJob:
    if not config.api_base_url or not config.worker_token:
        raise JobSourceError("job source missing api_base_url or worker_token")
    request = Request(
        f"{config.api_base_url}/v1/twin-agent/jobs",
        headers={
            "Authorization": f"Bearer {config.worker_token}",
            "User-Agent": "fourwall-twin-agent/1.0",
        },
        method="GET",
    )
    try:
        with urlopen(request, timeout=config.timeout_sec) as response:
            data = response.read()
    except HTTPError as exc:
        body = exc.read(512).decode("utf-8", errors="replace")
        raise JobSourceError(f"job source HTTP {exc.code}: {body}") from exc
    except URLError as exc:
        raise JobSourceError(f"job source URL error: {exc.reason}") from exc
    except TimeoutError as exc:
        raise JobSourceError("job source timeout") from exc
    return parse_poll_payload(data)


def parse_poll_payload(data: bytes | str) -> PolledJob:
    try:
        payload = json.loads(data if isinstance(data, str) else data.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise JobSourceError(f"job source invalid JSON: {exc}") from exc
    if not isinstance(payload, dict):
        raise JobSourceError(f"job source payload must be an object, got {payload!r}")
    job = payload.get("job")
    world = payload.get("world")
    age = payload.get("worldAgeSeconds")
    return PolledJob(
        job=job if isinstance(job, dict) else None,
        world=world if isinstance(world, dict) else None,
        world_age_seconds=float(age) if isinstance(age, (int, float)) and not isinstance(age, bool) else None,
    )
