from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import time
from threading import Lock
from uuid import uuid4

from app.line_bot import (
    LineBotConfigurationError,
    LineBotDeliveryError,
    push_line_message,
    reply_line_messages,
)
from app.line_floorplan.messages import build_text_message


JOB_PENDING_TTL = 45
JOB_CLAIMED_TTL = 60
COMMAND_FRESH_WINDOW = 30
WORKER_ONLINE_WINDOW = 75
REPLY_TOKEN_MAX_AGE = 50
FEED_MAX_EVENTS = 100
MAX_TRACKED_JOBS = 200
TWIN_AGENT_OFFLINE_TEXT = "4WALL AI 助理暫時離線，請稍後再試。"
SNAPSHOT_SCOPE_ORGANIZATION_LIVE = "organization_live"
SNAPSHOT_SCOPE_WEB_ONLY = "web_only"
SNAPSHOT_SCOPE_ACCELERATOR_DEMO = "accelerator_demo"
DEMO_SNAPSHOT_FRESH_WINDOW = 20


@dataclass
class TwinAgentWorldSlot:
    session_id: str
    owner_user_id: str
    organization_id: str | None
    snapshot_scope: str
    world: dict
    captured_at: datetime
    received_at_monotonic: float


@dataclass
class TwinAgentJob:
    job_id: str
    source: str
    text: str
    session_id: str | None = None
    organization_id: str | None = None
    group_id: str | None = None
    reply_token: str | None = None
    site_slug: str | None = None
    status: str = "pending"
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    created_monotonic: float = field(default_factory=time.monotonic)
    claimed_monotonic: float | None = None


@dataclass
class TwinAgentFeedEvent:
    seq: int
    kind: str
    job_id: str
    source: str
    text: str | None = None
    tool_calls: list[dict] | None = None
    created_monotonic: float = field(default_factory=time.monotonic)


class TwinAgentState:
    def __init__(self) -> None:
        self.lock = Lock()
        self.world_slots: dict[str, TwinAgentWorldSlot] = {}
        self.jobs: list[TwinAgentJob] = []
        self.feeds: dict[str, list[TwinAgentFeedEvent]] = {}
        self.feed_seq: dict[str, int] = {}
        self.last_worker_seen_monotonic: float | None = None


_STATE = TwinAgentState()


def clear_twin_agent_state() -> None:
    with _STATE.lock:
        _STATE.world_slots.clear()
        _STATE.jobs.clear()
        _STATE.feeds.clear()
        _STATE.feed_seq.clear()
        _STATE.last_worker_seen_monotonic = None


def store_world_snapshot(
    *,
    session_id: str,
    owner_user_id: str,
    organization_id: str | None,
    snapshot_scope: str = SNAPSHOT_SCOPE_ORGANIZATION_LIVE,
    world: dict,
    captured_at: datetime,
) -> None:
    with _STATE.lock:
        _STATE.world_slots[session_id] = TwinAgentWorldSlot(
            session_id=session_id,
            owner_user_id=owner_user_id,
            organization_id=organization_id,
            snapshot_scope=snapshot_scope,
            world=world,
            captured_at=captured_at,
            received_at_monotonic=time.monotonic(),
        )


def get_owned_session_organization(session_id: str, owner_user_id: str) -> tuple[bool, str | None]:
    """Return whether the caller owns the browser session and its org scope."""
    with _STATE.lock:
        slot = _STATE.world_slots.get(session_id)
        if slot is None or slot.owner_user_id != owner_user_id:
            return False, None
        return True, slot.organization_id


def get_world_snapshot(
    *,
    session_id: str | None = None,
    organization_id: str | None = None,
    snapshot_scope: str | None = None,
) -> tuple[dict | None, float | None]:
    with _STATE.lock:
        slot = (
            _STATE.world_slots.get(session_id)
            if session_id
            else _latest_world_slot(organization_id, snapshot_scope=snapshot_scope)
        )
        if slot is None:
            return None, None
        return slot.world, time.monotonic() - slot.received_at_monotonic


def get_active_session_id(
    organization_id: str | None = None,
    *,
    snapshot_scope: str = SNAPSHOT_SCOPE_ORGANIZATION_LIVE,
) -> str | None:
    if organization_id is None:
        return None
    with _STATE.lock:
        slot = _latest_world_slot(organization_id, snapshot_scope=snapshot_scope)
        return slot.session_id if slot is not None else None


def get_fresh_demo_session_id(*, max_age_seconds: float = DEMO_SNAPSHOT_FRESH_WINDOW) -> str | None:
    with _STATE.lock:
        slot = _latest_world_slot(None, snapshot_scope=SNAPSHOT_SCOPE_ACCELERATOR_DEMO)
        if slot is None or time.monotonic() - slot.received_at_monotonic > max_age_seconds:
            return None
        return slot.session_id


def _latest_world_slot(
    organization_id: str | None,
    *,
    snapshot_scope: str | None = None,
) -> TwinAgentWorldSlot | None:
    candidates = [
        slot
        for slot in _STATE.world_slots.values()
        if (organization_id is None or slot.organization_id == organization_id)
        and (snapshot_scope is None or slot.snapshot_scope == snapshot_scope)
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda slot: slot.received_at_monotonic)


def enqueue_twin_agent_job(
    *,
    source: str,
    text: str,
    session_id: str | None = None,
    organization_id: str | None = None,
    group_id: str | None = None,
    reply_token: str | None = None,
    site_slug: str | None = None,
) -> TwinAgentJob:
    job = TwinAgentJob(
        job_id=uuid4().hex,
        source=source,
        text=text,
        session_id=session_id,
        organization_id=organization_id,
        group_id=group_id,
        reply_token=reply_token,
        site_slug=site_slug,
    )
    with _STATE.lock:
        _STATE.jobs.append(job)
    return job


def count_pending_line_jobs(group_id: str) -> int:
    with _STATE.lock:
        return sum(
            1
            for job in _STATE.jobs
            if job.source == "line" and job.status == "pending" and job.group_id == group_id
        )


def claim_next_job() -> TwinAgentJob | None:
    with _STATE.lock:
        for job in _STATE.jobs:
            if job.status == "pending":
                job.status = "claimed"
                job.claimed_monotonic = time.monotonic()
                return job
        return None


def complete_job(job_id: str) -> tuple[TwinAgentJob | None, str | None]:
    with _STATE.lock:
        job = next((item for item in _STATE.jobs if item.job_id == job_id), None)
        if job is None:
            return None, "not_found"
        if job.status != "claimed":
            return job, "not_claimed"
        job.status = "done"
        return job, None


def append_feed_event(
    session_id: str,
    *,
    kind: str,
    job_id: str,
    source: str,
    text: str | None = None,
    tool_calls: list[dict] | None = None,
) -> None:
    with _STATE.lock:
        seq = _STATE.feed_seq.get(session_id, 0) + 1
        _STATE.feed_seq[session_id] = seq
        feed = _STATE.feeds.setdefault(session_id, [])
        feed.append(
            TwinAgentFeedEvent(seq=seq, kind=kind, job_id=job_id, source=source, text=text, tool_calls=tool_calls)
        )
        if len(feed) > FEED_MAX_EVENTS:
            del feed[: len(feed) - FEED_MAX_EVENTS]


def collect_feed_events(session_id: str, cursor: int | None) -> tuple[list[TwinAgentFeedEvent], int]:
    now = time.monotonic()
    with _STATE.lock:
        tail = _STATE.feed_seq.get(session_id, 0)
        if cursor is None or cursor > tail:
            return [], tail
        events = [
            event
            for event in _STATE.feeds.get(session_id, [])
            if event.seq > cursor
            and (event.kind != "commands" or now - event.created_monotonic <= COMMAND_FRESH_WINDOW)
        ]
        return events, tail


def record_worker_heartbeat() -> None:
    with _STATE.lock:
        _STATE.last_worker_seen_monotonic = time.monotonic()


def is_worker_online() -> bool:
    with _STATE.lock:
        last_seen = _STATE.last_worker_seen_monotonic
    return last_seen is not None and time.monotonic() - last_seen <= WORKER_ONLINE_WINDOW


def get_twin_agent_runtime_status(*, readable_organization_ids: set[str] | None) -> dict:
    """Return health metadata without exposing any world-snapshot content."""

    now = time.monotonic()
    with _STATE.lock:
        last_seen = _STATE.last_worker_seen_monotonic
        candidates = [
            slot
            for slot in _STATE.world_slots.values()
            if readable_organization_ids is None or slot.organization_id in readable_organization_ids
        ]
        slot = max(candidates, key=lambda item: item.received_at_monotonic) if candidates else None
    worker_age = None if last_seen is None else max(0.0, now - last_seen)
    snapshot_age = None if slot is None else max(0.0, now - slot.received_at_monotonic)
    return {
        "workerOnline": worker_age is not None and worker_age <= WORKER_ONLINE_WINDOW,
        "workerLastSeenSeconds": worker_age,
        "snapshotAvailable": slot is not None,
        "snapshotAgeSeconds": snapshot_age,
        "snapshotCapturedAt": slot.captured_at if slot is not None else None,
    }


def sweep_twin_agent_jobs(settings) -> None:
    now = time.monotonic()
    expired_line_jobs: list[TwinAgentJob] = []
    expired_web_jobs: list[TwinAgentJob] = []
    with _STATE.lock:
        for job in _STATE.jobs:
            if job.status == "pending" and now - job.created_monotonic > JOB_PENDING_TTL:
                job.status = "expired"
            elif (
                job.status == "claimed"
                and job.claimed_monotonic is not None
                and now - job.claimed_monotonic > JOB_CLAIMED_TTL
            ):
                job.status = "expired"
            else:
                continue
            if job.source == "line":
                expired_line_jobs.append(job)
            elif job.source == "web" and job.session_id:
                expired_web_jobs.append(job)
        if len(_STATE.jobs) > MAX_TRACKED_JOBS:
            _STATE.jobs = _STATE.jobs[-MAX_TRACKED_JOBS:]
    for job in expired_line_jobs:
        deliver_line_job_text(settings, job, TWIN_AGENT_OFFLINE_TEXT)
    for job in expired_web_jobs:
        append_feed_event(
            job.session_id,
            kind="reply",
            job_id=job.job_id,
            source=job.source,
            text=TWIN_AGENT_OFFLINE_TEXT,
        )


def deliver_line_job_text(settings, job: TwinAgentJob, text: str) -> None:
    message = build_text_message(text)
    if job.reply_token and time.monotonic() - job.created_monotonic < REPLY_TOKEN_MAX_AGE:
        try:
            reply_line_messages(settings, job.reply_token, [message])
            return
        except (LineBotConfigurationError, LineBotDeliveryError):
            pass
    if job.group_id:
        try:
            push_line_message(settings, job.group_id, message)
        except (LineBotConfigurationError, LineBotDeliveryError):
            return
