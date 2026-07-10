from __future__ import annotations

from datetime import datetime
import hmac
import json
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, Field

from app.deps import CurrentWebUser, auth_scheme, get_current_web_user, get_rate_limiter, get_session, get_settings
from app.dispatch import build_daily_brief_context
from app.rate_limit import RateLimitRule, RateLimiter
from app.twin_agent import (
    TwinAgentFeedEvent,
    TwinAgentJob,
    SNAPSHOT_SCOPE_ACCELERATOR_DEMO,
    SNAPSHOT_SCOPE_ORGANIZATION_LIVE,
    SNAPSHOT_SCOPE_WEB_ONLY,
    append_feed_event,
    claim_next_job,
    collect_feed_events,
    complete_job,
    deliver_line_job_text,
    enqueue_twin_agent_job,
    get_active_session_id,
    get_owned_session_organization,
    get_twin_agent_runtime_status,
    get_world_snapshot,
    is_worker_online,
    record_worker_heartbeat,
    store_world_snapshot,
    sweep_twin_agent_jobs,
)


TWIN_AGENT_WEB_MESSAGE_RATE_LIMIT = RateLimitRule(max_attempts=10, window_seconds=60)
SNAPSHOT_MAX_JSON_CHARS = 120_000


def require_twin_agent_enabled(settings=Depends(get_settings)) -> None:
    if not settings.twin_agent_enabled:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="twin_agent_disabled")


def require_twin_agent_worker(
    credentials: HTTPAuthorizationCredentials | None = Depends(auth_scheme),
    settings=Depends(get_settings),
) -> None:
    if not settings.twin_agent_worker_token:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="twin_agent_worker_token_missing")
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing_bearer_token")
    if not hmac.compare_digest(credentials.credentials, settings.twin_agent_worker_token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="twin_agent_worker_unauthorized")


router = APIRouter(tags=["twin-agent"], dependencies=[Depends(require_twin_agent_enabled)])


class TwinAgentSnapshotDto(BaseModel):
    sessionId: str = Field(min_length=1, max_length=80)
    capturedAt: datetime
    world: dict[str, Any]
    organizationId: str | None = Field(default=None, min_length=1, max_length=80)
    snapshotScope: Literal["organization_live", "web_only", "accelerator_demo"] | None = None


class TwinAgentMessageDto(BaseModel):
    sessionId: str = Field(min_length=1, max_length=80)
    text: str = Field(min_length=1, max_length=500)
    organizationId: str | None = Field(default=None, min_length=1, max_length=80)


class TwinAgentToolCallDto(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    arguments: dict[str, Any] = Field(default_factory=dict)


class TwinAgentJobResultDto(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    toolCalls: list[TwinAgentToolCallDto] = Field(default_factory=list, max_length=10)


@router.post("/v1/twin-agent/snapshot", status_code=status.HTTP_204_NO_CONTENT)
def post_twin_agent_snapshot(
    payload: TwinAgentSnapshotDto,
    current_user: CurrentWebUser = Depends(get_current_web_user),
) -> Response:
    if len(json.dumps(payload.world)) > SNAPSHOT_MAX_JSON_CHARS:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="twin_agent_snapshot_too_large")
    snapshot_scope = payload.snapshotScope or _infer_legacy_snapshot_scope(payload)
    organization_id = _resolve_snapshot_organization(current_user, payload.organizationId, snapshot_scope)
    if payload.snapshotScope is not None:
        _validate_explicit_snapshot_scope(payload, snapshot_scope)
    store_world_snapshot(
        session_id=payload.sessionId,
        owner_user_id=current_user.user.id,
        organization_id=organization_id,
        snapshot_scope=snapshot_scope,
        world=payload.world,
        captured_at=payload.capturedAt,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/v1/twin-agent/messages")
def post_twin_agent_message(
    payload: TwinAgentMessageDto,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    rate_limiter: RateLimiter = Depends(get_rate_limiter),
) -> dict:
    rate_limiter.check(f"twin-agent-web:{payload.sessionId}", TWIN_AGENT_WEB_MESSAGE_RATE_LIMIT)
    owns_session, organization_id = get_owned_session_organization(payload.sessionId, current_user.user.id)
    if not owns_session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="twin_agent_session_not_found")
    if payload.organizationId is not None and payload.organizationId != organization_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden_role")
    job = enqueue_twin_agent_job(
        source="web",
        text=payload.text,
        session_id=payload.sessionId,
        organization_id=organization_id,
    )
    return {"jobId": job.job_id}


@router.get("/v1/twin-agent/updates")
def get_twin_agent_updates(
    sessionId: str,
    cursor: int | None = None,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    settings=Depends(get_settings),
) -> dict:
    owns_session, _organization_id = get_owned_session_organization(sessionId, current_user.user.id)
    if not owns_session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="twin_agent_session_not_found")
    sweep_twin_agent_jobs(settings)
    events, tail = collect_feed_events(sessionId, cursor)
    return {
        "workerOnline": is_worker_online(),
        "events": [_feed_event_payload(event) for event in events],
        "cursor": tail,
    }


@router.get("/v1/twin-agent/status")
def get_twin_agent_status(
    current_user: CurrentWebUser = Depends(get_current_web_user),
) -> dict:
    readable_organization_ids = (
        None
        if current_user.global_roles.intersection({"platform_admin", "ops"})
        else set(current_user.readable_org_ids)
    )
    return {
        "enabled": True,
        **get_twin_agent_runtime_status(readable_organization_ids=readable_organization_ids),
    }


@router.get("/v1/twin-agent/jobs")
def get_twin_agent_job(
    settings=Depends(get_settings),
    session=Depends(get_session),
    _worker: None = Depends(require_twin_agent_worker),
) -> dict:
    record_worker_heartbeat()
    sweep_twin_agent_jobs(settings)
    job = claim_next_job()
    world, world_age_seconds = get_world_snapshot(
        session_id=job.session_id if job is not None else None,
        organization_id=job.organization_id if job is not None else None,
        snapshot_scope=(
            None
            if job is None or job.session_id
            else SNAPSHOT_SCOPE_ORGANIZATION_LIVE
        ),
    )
    return {
        "job": _job_payload(job) if job is not None else None,
        "world": world,
        "worldAgeSeconds": world_age_seconds,
        "ledgerContext": _ledger_context_payload(session, job),
    }


@router.post("/v1/twin-agent/jobs/{job_id}/result", status_code=status.HTTP_204_NO_CONTENT)
def post_twin_agent_job_result(
    job_id: str,
    payload: TwinAgentJobResultDto,
    settings=Depends(get_settings),
    _worker: None = Depends(require_twin_agent_worker),
) -> Response:
    record_worker_heartbeat()
    job, error = complete_job(job_id)
    if error == "not_found" or job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="twin_agent_job_not_found")
    if error == "not_claimed":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="twin_agent_job_not_claimed")
    tool_calls = [{"name": call.name, "arguments": call.arguments} for call in payload.toolCalls]
    if job.source == "web" and job.session_id:
        append_feed_event(job.session_id, kind="reply", job_id=job.job_id, source=job.source, text=payload.text)
        if tool_calls:
            append_feed_event(job.session_id, kind="commands", job_id=job.job_id, source=job.source, tool_calls=tool_calls)
    elif job.source == "line":
        deliver_line_job_text(settings, job, payload.text)
        if tool_calls:
            active_session_id = job.session_id or get_active_session_id(job.organization_id)
            if active_session_id:
                append_feed_event(
                    active_session_id,
                    kind="commands",
                    job_id=job.job_id,
                    source=job.source,
                    tool_calls=tool_calls,
                )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _feed_event_payload(event: TwinAgentFeedEvent) -> dict:
    payload: dict[str, Any] = {"seq": event.seq, "kind": event.kind, "jobId": event.job_id, "source": event.source}
    if event.text is not None:
        payload["text"] = event.text
    if event.tool_calls is not None:
        payload["toolCalls"] = event.tool_calls
    return payload


def _job_payload(job: TwinAgentJob) -> dict:
    return {
        "jobId": job.job_id,
        "source": job.source,
        "text": job.text,
        "sessionId": job.session_id,
        "organizationId": job.organization_id,
        "groupId": job.group_id,
        "siteSlug": job.site_slug,
        "createdAt": job.created_at,
    }


def _ledger_context_payload(session, job: TwinAgentJob | None) -> dict | None:
    if job is None:
        return None
    if not job.organization_id:
        return {"available": False, "reason": "organization_scope_missing"}
    return build_daily_brief_context(session, organization_id=job.organization_id, target_date=job.created_at)


def _infer_legacy_snapshot_scope(payload: TwinAgentSnapshotDto) -> str:
    availability = payload.world.get("dataAvailability")
    mode = availability.get("mode") if isinstance(availability, dict) else None
    if mode == "simulation":
        return SNAPSHOT_SCOPE_WEB_ONLY
    if payload.organizationId is not None or mode == "live":
        return SNAPSHOT_SCOPE_ORGANIZATION_LIVE
    return SNAPSHOT_SCOPE_WEB_ONLY


def _validate_explicit_snapshot_scope(payload: TwinAgentSnapshotDto, snapshot_scope: str) -> None:
    availability = payload.world.get("dataAvailability")
    mode = availability.get("mode") if isinstance(availability, dict) else None
    if snapshot_scope == SNAPSHOT_SCOPE_ORGANIZATION_LIVE and mode != "live":
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="snapshot_scope_mode_mismatch")
    if snapshot_scope == SNAPSHOT_SCOPE_ACCELERATOR_DEMO:
        simulation_context = payload.world.get("simulationContext")
        if mode != "simulation" or not isinstance(simulation_context, dict):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="snapshot_scope_mode_mismatch")


def _resolve_snapshot_organization(
    current_user: CurrentWebUser,
    requested_organization_id: str | None,
    snapshot_scope: str,
) -> str | None:
    if snapshot_scope in {SNAPSHOT_SCOPE_WEB_ONLY, SNAPSHOT_SCOPE_ACCELERATOR_DEMO}:
        if not current_user.global_roles.intersection({"platform_admin", "ops"}):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden_role")
        if requested_organization_id is not None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="snapshot_scope_conflict")
        return None
    if requested_organization_id is not None:
        if not current_user.can_read_org(requested_organization_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden_role")
        return requested_organization_id
    if len(current_user.readable_org_ids) == 1:
        return current_user.readable_org_ids[0]
    if current_user.global_roles.intersection({"platform_admin", "ops"}):
        return None
    raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="twin_agent_organization_required")
