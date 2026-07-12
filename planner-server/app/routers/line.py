from __future__ import annotations

import json
import logging
import re
import time
from threading import Lock
from urllib.parse import quote

from fastapi.concurrency import run_in_threadpool
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.deps import (
    CurrentWebUser,
    get_artifact_storage,
    get_current_web_user,
    get_rate_limiter,
    get_session,
    get_settings,
)
from app.incident_dto import CreateIncidentRequestDto, IncidentLocationDto, LineWebhookResponseDto
from app.dispatch import create_dispatch_point, record_machine_actual, reset_mold_counter
from app.incidents import build_daily_summary, create_incident, reopen_incident, update_incident_status
from app.line_bot import (
    LineBotConfigurationError,
    LineBotDeliveryError,
    build_line_daily_summary_message,
    line_event_key,
    line_is_configured,
    parse_postback_data,
    reply_line_messages,
    verify_line_signature,
)
from app.line_dispatch_ticket import (
    DISPATCH_TICKET_ALIGNMENT_ERROR,
    DispatchTicketCropError,
    build_dispatch_ticket_summary,
    crop_dispatch_ticket_png,
    dispatch_ticket_storage_key,
    hmi_screen_storage_key,
    find_latest_line_crop_capture,
    find_line_crop_capture_for_frame,
)
from app.line_floorplan.layout import (
    FloorplanLayoutError,
    load_floorplan_layout,
    load_floorplan_layout_for_site,
    validate_imagemap_width,
)
from app.line_floorplan.messages import (
    build_account_link_message,
    build_floorplan_imagemap_message,
    build_help_message,
    build_hmi_screen_message,
    build_image_message,
    build_intent_clarification_message,
    build_machine_list_message,
    build_navigation_message,
    build_text_message,
)
from app.line_intent import parse_line_intent, resolve_machine_candidate, safe_line_navigation_url
from app.line_floorplan.render import render_floorplan_png
from app.line_floorplan.service import (
    build_floorplan_state_payload,
    build_hmi_screen_view,
    hmi_screen_is_overexposed,
    build_machine_detail_payload,
    build_machine_detail_view,
    camera_ids_for_matches,
    get_site_for_binding,
    latest_machine_people_count,
    machine_center,
    today_bounds_taipei,
)
from app.line_floorplan.tokens import (
    FloorplanTokenError,
    create_floorplan_render_token,
    verify_floorplan_liveview_token,
    verify_floorplan_render_token,
)
from app.line_identity import (
    LineAccountLinkConflictError,
    LineAccountLinkError,
    LineConversationScope,
    LineIdentityAuthorizationError,
    LineIdentityConfigurationError,
    confirm_line_account_link_site,
    consume_line_account_link,
    consume_line_account_link_redirect,
    create_line_account_link_attempt,
    decrypt_line_account_link_reply_messages,
    encrypt_line_account_link_reply_messages,
    resolve_line_group_scope,
    resolve_line_user_scope,
    unlink_line_user_binding,
)
from app.models import IncidentRecord, LineWebhookEventRecord, Organization, Site, utc_now
from app.rate_limit import RateLimitRule, RateLimiter, client_identity
from app.storage import ArtifactStorage
from app.web_dto import (
    LineAccountLinkCompleteRequestDto,
    LineAccountLinkCompleteResponseDto,
    LineAccountLinkSiteDto,
)


router = APIRouter(tags=["line"])
logger = logging.getLogger(__name__)

FLOORPLAN_RENDER_RATE_LIMIT = RateLimitRule(max_attempts=120, window_seconds=60)
FLOORPLAN_LIVEVIEW_RATE_LIMIT = RateLimitRule(max_attempts=120, window_seconds=60)
LINE_ACCOUNT_LINK_USER_RATE_LIMIT = RateLimitRule(max_attempts=3, window_seconds=10 * 60)
LINE_ACCOUNT_LINK_DESTINATION_RATE_LIMIT = RateLimitRule(max_attempts=30, window_seconds=60)
LINE_WEBHOOK_MAX_BODY_BYTES = 1024 * 1024
FLOORPLAN_STATE_CACHE_SECONDS = 5
RICH_MENU_ACTIONS = {
    "floorplan",
    "machines",
    "gauges",
    "hmi_screen",
    "daily_incidents",
    "project_progress",
    "people_portal",
    "machine_people",
    "official_site",
    "contact_us",
}
INCIDENT_POSTBACK_ACTIONS = {
    "confirm_incident",
    "mark_false_positive",
    "start_progress",
    "resolve_incident",
    "reopen_incident",
    "view_incident",
}
INCIDENT_POSTBACK_WRITE_ACTIONS = INCIDENT_POSTBACK_ACTIONS - {"view_incident"}
_floorplan_state_cache: dict[tuple[str, str], tuple[float, dict]] = {}
_floorplan_state_cache_lock = Lock()
LINE_ACCOUNT_LINK_RESPONSE_HEADERS = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
}


@router.get("/v1/line/floorplan/{site_slug}/state")
def get_line_floorplan_state(
    site_slug: str,
    request: Request,
    token: str = "",
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
    rate_limiter: RateLimiter = Depends(get_rate_limiter),
) -> JSONResponse:
    rate_limiter.check(f"line-floorplan-liveview:{client_identity(request, settings)}", FLOORPLAN_LIVEVIEW_RATE_LIMIT)
    layout, binding = _liveview_scope_or_403(session, settings, site_slug, token)
    cache_key = (layout.site_slug, f"{binding.source_type}:{binding.source_id}")
    now_seconds = time.monotonic()
    with _floorplan_state_cache_lock:
        cached = _floorplan_state_cache.get(cache_key)
        if cached and now_seconds - cached[0] <= FLOORPLAN_STATE_CACHE_SECONDS:
            return JSONResponse(
                cached[1],
                headers={
                    "Cache-Control": "private, max-age=5",
                    "X-Line-Floorplan-State-Cache": "hit",
                },
            )
    payload = build_floorplan_state_payload(session, layout=layout, binding=binding)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="invalid_floorplan_token")
    with _floorplan_state_cache_lock:
        _floorplan_state_cache[cache_key] = (time.monotonic(), payload)
    return JSONResponse(
        payload,
        headers={
            "Cache-Control": "private, max-age=5",
            "X-Line-Floorplan-State-Cache": "miss",
        },
    )


@router.get("/v1/line/floorplan/{site_slug}/machine/{machine_id}")
def get_line_floorplan_machine_detail(
    site_slug: str,
    machine_id: str,
    request: Request,
    token: str = "",
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
    storage: ArtifactStorage = Depends(get_artifact_storage),
    rate_limiter: RateLimiter = Depends(get_rate_limiter),
) -> dict:
    rate_limiter.check(f"line-floorplan-liveview:{client_identity(request, settings)}", FLOORPLAN_LIVEVIEW_RATE_LIMIT)
    layout, binding = _liveview_scope_or_403(session, settings, site_slug, token)
    machine = layout.machine(machine_id)
    if machine is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="machine_not_found")
    if not machine.line_enabled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="machine_not_available")
    detail = build_machine_detail_view(
        session,
        storage,
        layout=layout,
        binding=binding,
        machine=machine,
        include_legacy_gauges=False,
    )
    if detail is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="invalid_floorplan_token")
    return build_machine_detail_payload(detail)


@router.get("/v1/line/floorplan/{site_slug}/{render_token}/{width}")
def get_line_floorplan_image(
    site_slug: str,
    render_token: str,
    width: int,
    request: Request,
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
    rate_limiter: RateLimiter = Depends(get_rate_limiter),
) -> Response:
    try:
        layout = load_floorplan_layout(site_slug)
    except FloorplanLayoutError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="floorplan_not_found") from exc
    try:
        validate_imagemap_width(width)
    except FloorplanLayoutError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="unsupported_width") from exc
    try:
        token_payload = verify_floorplan_render_token(settings, site_slug=site_slug, token=render_token)
    except FloorplanTokenError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc

    rate_limiter.check(f"line-floorplan:{site_slug}:{client_identity(request, settings)}", FLOORPLAN_RENDER_RATE_LIMIT)
    binding = _scope_for_floorplan_token(session, settings, token_payload)
    if binding is None or get_site_for_binding(session, layout, binding) is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="floorplan_binding_not_found")

    rendered = render_floorplan_png(session, layout=layout, binding=binding, width=width)
    return Response(
        content=rendered.content,
        media_type="image/png",
        headers={
            "Cache-Control": (
                "private, max-age=60" if binding.source_type == "user" else "public, max-age=60"
            ),
            "X-Line-Floorplan-Cache": rendered.cache_status,
            "X-Line-Floorplan-Width": str(rendered.width),
            "X-Line-Floorplan-Height": str(rendered.height),
        },
    )


@router.get("/v1/line/dispatch-ticket/{site_slug}/{render_token}/{frame_id}")
def get_line_dispatch_ticket_image(
    site_slug: str,
    render_token: str,
    frame_id: str,
    request: Request,
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
    storage: ArtifactStorage = Depends(get_artifact_storage),
    rate_limiter: RateLimiter = Depends(get_rate_limiter),
) -> Response:
    try:
        token_payload = verify_floorplan_render_token(settings, site_slug=site_slug, token=render_token)
    except FloorplanTokenError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    rate_limiter.check(
        f"line-dispatch-ticket:{site_slug}:{client_identity(request, settings)}", FLOORPLAN_RENDER_RATE_LIMIT
    )
    binding = _scope_for_floorplan_token(session, settings, token_payload)
    if binding is None or binding.site_slug != site_slug:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="dispatch_ticket_binding_not_found")
    layout = load_floorplan_layout(binding.site_slug)
    dispatch_machine = next((machine for machine in layout.machines if machine.line_enabled), None)
    dispatch_camera_ids = (
        camera_ids_for_matches(session, binding=binding, matches=dispatch_machine.camera_matches)
        if dispatch_machine is not None
        else ()
    )
    capture = find_line_crop_capture_for_frame(
        session,
        organization_id=binding.organization_id,
        site_id=binding.site_id,
        frame_id=frame_id,
        camera_ids=dispatch_camera_ids,
        now=token_payload.issued_at,
    )
    if capture is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="dispatch_ticket_not_found")
    content = storage.read(dispatch_ticket_storage_key(capture.frame.id))
    if content is None:
        # Crops are created only after a fresh OCR observation has linked this
        # exact frame to a validated calibration ROI. Never reconstruct a crop
        # here from a camera's latest frame or a server-side fallback ROI.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="dispatch_ticket_not_found")
    return Response(
        content=content,
        media_type="image/png",
        headers={"Cache-Control": "private, max-age=600"},
    )


@router.get("/v1/line/hmi-screen/{site_slug}/{render_token}/{frame_id}")
def get_line_hmi_screen_image(
    site_slug: str,
    render_token: str,
    frame_id: str,
    request: Request,
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
    storage: ArtifactStorage = Depends(get_artifact_storage),
    rate_limiter: RateLimiter = Depends(get_rate_limiter),
) -> Response:
    try:
        token_payload = verify_floorplan_render_token(settings, site_slug=site_slug, token=render_token)
    except FloorplanTokenError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    rate_limiter.check(
        f"line-hmi-screen:{site_slug}:{client_identity(request, settings)}", FLOORPLAN_RENDER_RATE_LIMIT
    )
    binding = _scope_for_floorplan_token(session, settings, token_payload)
    if binding is None or binding.site_slug != site_slug:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="hmi_screen_binding_not_found")
    layout = load_floorplan_layout(binding.site_slug)
    machine = next((item for item in layout.machines if item.line_enabled), None)
    camera_ids = (
        camera_ids_for_matches(session, binding=binding, matches=machine.camera_matches)
        if machine is not None
        else ()
    )
    capture = find_line_crop_capture_for_frame(
        session,
        organization_id=binding.organization_id,
        site_id=binding.site_id,
        frame_id=frame_id,
        camera_ids=camera_ids,
        now=token_payload.issued_at,
    )
    if capture is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="hmi_screen_not_found")
    content = storage.read(hmi_screen_storage_key(capture.frame.id))
    if content is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="hmi_screen_not_found")
    return Response(content=content, media_type="image/png", headers={"Cache-Control": "private, max-age=600"})


def _liveview_scope_or_403(session: Session, settings, site_slug: str, token: str):
    try:
        token_payload = verify_floorplan_liveview_token(settings, site_slug=site_slug, token=token)
        layout = load_floorplan_layout(site_slug)
    except (FloorplanTokenError, FloorplanLayoutError) as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="invalid_floorplan_token") from exc
    binding = _scope_for_floorplan_token(session, settings, token_payload)
    if binding is None or get_site_for_binding(session, layout, binding) is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="invalid_floorplan_token")
    return layout, binding


def _scope_for_floorplan_token(session: Session, settings, token_payload) -> LineConversationScope | None:
    if token_payload.source_type == "group":
        return resolve_line_group_scope(
            session,
            token_payload.destination_id or "",
            token_payload.source_id,
        )
    if token_payload.source_type == "user" and settings.line_account_linking_enabled:
        return resolve_line_user_scope(
            session,
            token_payload.destination_id or "",
            token_payload.source_id,
        )
    return None


@router.get(
    "/v1/line/account-links/sites",
    response_model=list[LineAccountLinkSiteDto],
)
def list_line_account_link_sites(
    response: Response,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> list[LineAccountLinkSiteDto]:
    response.headers["Cache-Control"] = "no-store"
    result: list[LineAccountLinkSiteDto] = []
    for site in session.exec(select(Site).order_by(Site.name)).all():
        if not current_user.can_read_org(site.organization_id):
            continue
        organization = session.get(Organization, site.organization_id)
        if organization is None or not organization.is_active:
            continue
        try:
            load_floorplan_layout_for_site(site.id)
        except FloorplanLayoutError:
            continue
        result.append(
            LineAccountLinkSiteDto(
                siteId=site.id,
                organizationId=site.organization_id,
                name=site.name,
                address=site.address,
            )
        )
    return result


@router.post(
    "/v1/line/account-links/complete",
    response_model=LineAccountLinkCompleteResponseDto,
)
def complete_line_account_link(
    payload: LineAccountLinkCompleteRequestDto,
    request: Request,
    response: Response,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
) -> LineAccountLinkCompleteResponseDto:
    for header, value in LINE_ACCOUNT_LINK_RESPONSE_HEADERS.items():
        response.headers[header] = value
    _enforce_line_account_link_origin(request, settings)
    try:
        confirmation = confirm_line_account_link_site(
            session,
            settings,
            flow_token=payload.flowToken,
            user_id=current_user.user.id,
            site_id=payload.siteId,
        )
    except LineIdentityAuthorizationError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="line_site_not_authorized",
            headers=LINE_ACCOUNT_LINK_RESPONSE_HEADERS,
        ) from exc
    except LineAccountLinkConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="line_account_link_conflict",
            headers=LINE_ACCOUNT_LINK_RESPONSE_HEADERS,
        ) from exc
    except LineIdentityConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="line_account_link_unavailable",
            headers=LINE_ACCOUNT_LINK_RESPONSE_HEADERS,
        ) from exc
    except LineAccountLinkError as exc:
        error_code = str(exc)
        http_status = (
            status.HTTP_410_GONE
            if error_code in {"line_account_link_expired", "line_account_link_used"}
            else status.HTTP_400_BAD_REQUEST
        )
        if error_code == "line_account_link_expired":
            session.commit()
        raise HTTPException(
            status_code=http_status,
            detail=error_code,
            headers=LINE_ACCOUNT_LINK_RESPONSE_HEADERS,
        ) from exc
    session.commit()
    api_origin = (settings.line_public_base_url or str(request.base_url)).rstrip("/")
    redirect_url = (
        f"{api_origin}/v1/line/account-links/redirect/"
        f"{quote(confirmation.redirect_token, safe='')}"
    )
    return LineAccountLinkCompleteResponseDto(accountLinkUrl=redirect_url)


@router.get(
    "/v1/line/account-links/redirect/{redirect_token}",
    include_in_schema=False,
)
def redirect_line_account_link(
    redirect_token: str,
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
) -> RedirectResponse:
    try:
        account_link_url = consume_line_account_link_redirect(
            session,
            settings,
            redirect_token=redirect_token,
        )
    except LineIdentityConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="line_account_link_unavailable",
            headers=LINE_ACCOUNT_LINK_RESPONSE_HEADERS,
        ) from exc
    except LineAccountLinkError as exc:
        if str(exc) == "line_account_link_expired":
            session.commit()
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="line_account_link_redirect_invalid",
            headers=LINE_ACCOUNT_LINK_RESPONSE_HEADERS,
        ) from exc
    session.commit()
    return RedirectResponse(
        url=account_link_url,
        status_code=status.HTTP_303_SEE_OTHER,
        headers=LINE_ACCOUNT_LINK_RESPONSE_HEADERS,
    )


def _enforce_line_account_link_origin(request: Request, settings) -> None:
    expected_origin = (settings.app_origin or "").rstrip("/")
    if not expected_origin:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="line_account_link_unavailable",
            headers=LINE_ACCOUNT_LINK_RESPONSE_HEADERS,
        )
    origin = (request.headers.get("origin") or "").rstrip("/")
    if origin == expected_origin:
        return
    referer = request.headers.get("referer") or ""
    if not origin and (referer == expected_origin or referer.startswith(f"{expected_origin}/")):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="origin_not_allowed",
        headers=LINE_ACCOUNT_LINK_RESPONSE_HEADERS,
    )


@router.post("/v1/line/webhook", response_model=LineWebhookResponseDto)
async def line_webhook(
    request: Request,
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
    storage: ArtifactStorage = Depends(get_artifact_storage),
    rate_limiter: RateLimiter = Depends(get_rate_limiter),
) -> LineWebhookResponseDto:
    if not settings.line_webhook_enabled:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="line_webhook_disabled")
    if not line_is_configured(settings):
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="line_not_configured")

    raw_body = await _read_limited_line_webhook_body(request)
    signature = request.headers.get("x-line-signature")
    if not verify_line_signature(raw_body, signature, settings.line_channel_secret):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="invalid_line_signature")

    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_line_payload") from exc

    destination_id = str(payload.get("destination") or "").strip()
    if settings.line_destination_id and destination_id != settings.line_destination_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="invalid_line_destination")

    return await run_in_threadpool(
        _process_line_webhook_events,
        session,
        storage,
        settings,
        rate_limiter,
        payload,
        destination_id,
    )


async def _read_limited_line_webhook_body(request: Request) -> bytes:
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            declared_size = int(content_length)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="invalid_content_length",
            ) from exc
        if declared_size < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="invalid_content_length",
            )
        if declared_size > LINE_WEBHOOK_MAX_BODY_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail="line_webhook_body_too_large",
            )

    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > LINE_WEBHOOK_MAX_BODY_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail="line_webhook_body_too_large",
            )
        body.extend(chunk)
    return bytes(body)


def _process_line_webhook_events(
    session: Session,
    storage: ArtifactStorage,
    settings,
    rate_limiter: RateLimiter,
    payload: dict,
    destination_id: str,
) -> LineWebhookResponseDto:
    processed = 0
    skipped = 0
    for event in payload.get("events", []):
        event_key = line_event_key(event)
        record, is_fresh = _claim_line_webhook_event(session, event=event, event_key=event_key)
        if record is None:
            skipped += 1
            continue
        try:
            if is_fresh:
                _handle_line_event(
                    session,
                    storage,
                    settings,
                    rate_limiter,
                    event,
                    destination_id,
                    record,
                )
            else:
                _retry_encrypted_line_reply(settings, event, record)
            record.processed_status = "processed"
            record.processed_at = utc_now()
            record.error_message = None
            record.encrypted_reply_messages = None
            session.commit()
            processed += 1
        except LineBotConfigurationError as exc:
            if record.encrypted_reply_messages:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="line_reply_delivery_failed",
                ) from exc
            raise
        except LineBotDeliveryError as exc:
            if record.encrypted_reply_messages and exc.retryable:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="line_reply_delivery_failed",
                ) from exc
            if record.encrypted_reply_messages:
                _terminalize_durable_line_reply_failure(session, record, exc)
                processed += 1
                continue
            raise
        except Exception as exc:
            session.rollback()
            _mark_line_webhook_event_failed(
                session,
                event=event,
                event_key=event_key,
                error=exc,
            )
            _reply_messages_if_possible(settings, event, [build_text_message("處理 LINE 訊息時發生錯誤，請稍後再試。")])
            processed += 1
    return LineWebhookResponseDto(processed=processed, skipped=skipped)


def _claim_line_webhook_event(
    session: Session,
    *,
    event: dict,
    event_key: str,
) -> tuple[LineWebhookEventRecord | None, bool]:
    existing = session.exec(
        select(LineWebhookEventRecord).where(LineWebhookEventRecord.event_key == event_key)
    ).first()
    if existing is not None:
        return _existing_line_webhook_event_claim(existing)

    source = event.get("source") or {}
    record = LineWebhookEventRecord(
        event_key=event_key,
        source_type=source.get("type"),
        source_id=source.get("userId") or source.get("groupId") or source.get("roomId"),
        event_type=event.get("type"),
        payload_json=_redacted_line_event(event),
        processed_status="received",
    )
    try:
        with session.begin_nested():
            session.add(record)
            session.flush()
    except IntegrityError:
        existing = session.exec(
            select(LineWebhookEventRecord).where(LineWebhookEventRecord.event_key == event_key)
        ).first()
        if existing is not None:
            return _existing_line_webhook_event_claim(existing)
        raise
    return record, True


def _existing_line_webhook_event_claim(
    record: LineWebhookEventRecord,
) -> tuple[LineWebhookEventRecord | None, bool]:
    if record.processed_status == "received" and record.encrypted_reply_messages:
        return record, False
    return None, False


def _retry_encrypted_line_reply(
    settings,
    event: dict,
    record: LineWebhookEventRecord,
) -> None:
    encrypted_messages = record.encrypted_reply_messages
    if not encrypted_messages:
        return
    messages = decrypt_line_account_link_reply_messages(settings, encrypted_messages)
    _reply_messages_strict(settings, event, messages)


def _mark_line_webhook_event_failed(
    session: Session,
    *,
    event: dict,
    event_key: str,
    error: Exception,
) -> None:
    record = session.exec(
        select(LineWebhookEventRecord).where(LineWebhookEventRecord.event_key == event_key)
    ).first()
    if record is not None and record.processed_status == "processed":
        return
    if record is None:
        source = event.get("source") or {}
        record = LineWebhookEventRecord(
            event_key=event_key,
            source_type=source.get("type"),
            source_id=source.get("userId") or source.get("groupId") or source.get("roomId"),
            event_type=event.get("type"),
            payload_json=_redacted_line_event(event),
        )
        session.add(record)
    record.processed_status = "failed"
    record.error_message = type(error).__name__[:500]
    record.encrypted_reply_messages = None
    record.processed_at = utc_now()
    session.commit()


def _terminalize_durable_line_reply_failure(
    session: Session,
    record: LineWebhookEventRecord,
    error: LineBotDeliveryError,
) -> None:
    record.processed_status = "failed"
    record.error_message = str(error)[:500] or type(error).__name__
    record.encrypted_reply_messages = None
    record.processed_at = utc_now()
    session.add(record)
    session.commit()


def _redacted_line_event(event: dict) -> dict:
    persisted = dict(event)
    if event.get("type") == "accountLink" and isinstance(event.get("link"), dict):
        persisted["link"] = {**event["link"], "nonce": "[REDACTED]"}
    return persisted


def _handle_line_event(
    session: Session,
    storage: ArtifactStorage,
    settings,
    rate_limiter: RateLimiter,
    event: dict,
    destination_id: str,
    record: LineWebhookEventRecord,
) -> None:
    event_type = event.get("type")
    if event_type == "accountLink":
        _handle_account_link_event(session, settings, event, destination_id, record)
        return
    if event_type == "postback":
        _handle_postback_event(session, settings, rate_limiter, event, destination_id, record)
        return
    if event_type == "message":
        _handle_message_event(session, storage, settings, rate_limiter, event, destination_id, record)


def _handle_account_link_event(
    session: Session,
    settings,
    event: dict,
    destination_id: str,
    record: LineWebhookEventRecord,
) -> None:
    source = event.get("source") or {}
    link = event.get("link") or {}
    result = str(link.get("result") or "failed")
    if not link.get("nonce"):
        raise LineAccountLinkError("line_account_link_invalid")
    if result == "ok" and (source.get("type") != "user" or not source.get("userId")):
        raise LineAccountLinkError("line_account_link_invalid")
    try:
        binding = consume_line_account_link(
            session,
            settings,
            nonce=str(link["nonce"]),
            destination_id=destination_id,
            line_user_id=str(source.get("userId") or ""),
            result=result,
        )
    except LineAccountLinkConflictError:
        # consume_line_account_link has already retired and scrubbed the
        # conflicting attempt. Persist that terminal state before the outer
        # webhook failure recorder rolls back its own unit of work.
        session.commit()
        raise
    except LineAccountLinkError as exc:
        if str(exc) == "line_account_link_expired":
            # Expiry retirement is an intentional state transition, not work
            # that should be undone by generic webhook error handling.
            session.commit()
        raise
    # LINE omits both source and replyToken when account linking fails. Retire the
    # attempt durably, but do not create a reply queue that can never be delivered.
    if result != "ok" or binding is None or not event.get("replyToken"):
        session.commit()
        return
    _commit_and_reply_durable_line_messages(
        session,
        settings,
        event,
        record,
        [build_text_message("LINE 帳號已連結完成。之後私聊我，就會依你的授權場域回覆。")],
    )


def _handle_postback_event(
    session: Session,
    settings,
    rate_limiter: RateLimiter,
    event: dict,
    destination_id: str,
    record: LineWebhookEventRecord,
) -> None:
    postback = event.get("postback") or {}
    data = parse_postback_data(str(postback.get("data") or ""))
    action = data.get("action")
    if action in INCIDENT_POSTBACK_ACTIONS:
        _handle_incident_postback(session, settings, rate_limiter, event, data, destination_id, record)
        return
    if action in RICH_MENU_ACTIONS:
        binding = _conversation_scope_or_reply(session, settings, rate_limiter, event, destination_id, record)
        if binding is None:
            return
        _reply_rich_menu_action(session, settings, event, binding, action)
        return
    if action == "report_machine_incident":
        binding = _conversation_scope_or_reply(session, settings, rate_limiter, event, destination_id, record)
        if binding is None:
            return
        actor_user_id = _write_actor_or_reply(session, settings, event, destination_id, binding)
        if actor_user_id is False:
            return
        _report_machine_incident(
            session,
            settings,
            event,
            binding,
            data.get("machineId") or "",
            actor_user_id=actor_user_id,
        )
        return
    _reply_messages_if_possible(settings, event, [build_text_message(f"不支援的 LINE 動作：{action or 'unknown'}")])


def _handle_message_event(
    session: Session,
    storage: ArtifactStorage,
    settings,
    rate_limiter: RateLimiter,
    event: dict,
    destination_id: str,
    record: LineWebhookEventRecord,
) -> None:
    message = event.get("message") or {}
    source = event.get("source") or {}
    source_type = source.get("type")
    line_user_id = str(source.get("userId") or "").strip()
    if message.get("type") != "text":
        binding = _conversation_scope_or_reply(session, settings, rate_limiter, event, destination_id, record)
        if binding is not None:
            _reply_messages_if_possible(settings, event, [build_help_message()])
        return
    text = str(message.get("text") or "").strip()
    if source_type == "user" and text == "解除連結":
        unlinked = unlink_line_user_binding(
            session,
            destination_id=destination_id,
            line_user_id=line_user_id,
        )
        message_text = "已解除 LINE 帳號連結。" if unlinked else "目前沒有已連結的 4WALL 帳號。"
        _commit_and_reply_durable_line_messages(
            session,
            settings,
            event,
            record,
            [build_text_message(message_text)],
        )
        return
    if source_type == "user" and text in {"連結帳號", "切換場域"}:
        _reply_account_link_start(
            session,
            settings,
            rate_limiter,
            event,
            destination_id,
            line_user_id,
            record,
        )
        return
    if text == "綁定 靚程":
        if source_type == "group" and source.get("groupId"):
            logger.info(
                "line_group_binding_requested",
                extra={"line_group_id": source.get("groupId"), "line_source_type": source.get("type")},
            )
            _reply_messages_if_possible(
                settings,
                event,
                [build_text_message("已收到綁定請求。請管理者查看伺服器 log 取得 group_id，並執行 bind_line_group.py 完成綁定。")],
            )
            return
        _reply_messages_if_possible(settings, event, [build_text_message("請在 LINE 群組內輸入綁定指令。")])
        return
    if source_type == "room":
        _reply_messages_if_possible(settings, event, [build_text_message("目前不支援 LINE 多人聊天室，請改用一對一聊天或已綁定群組。")])
        return
    binding = _conversation_scope_or_reply(session, settings, rate_limiter, event, destination_id, record)
    if binding is None:
        return
    if _handle_dispatch_command(
        session,
        settings,
        event,
        binding,
        text,
        storage=storage,
        destination_id=destination_id,
    ):
        return
    natural_language_enabled = (
        settings.line_natural_language_enabled
        or binding.organization_id in settings.line_natural_language_canary_org_ids
    )
    parsed_intent = parse_line_intent(text, natural_language_enabled=natural_language_enabled)
    logger.info(
        "line_intent_resolved",
        extra={
            "line_intent": parsed_intent.intent or "none",
            "line_intent_reason": parsed_intent.reason,
            "line_intent_match_count": len(parsed_intent.matched_intents),
            "line_site_slug": binding.site_slug,
            "line_source_type": binding.source_type,
        },
    )
    if parsed_intent.intent == "machine_detail":
        layout = load_floorplan_layout(binding.site_slug)
        resolution = resolve_machine_candidate(layout, parsed_intent.machine_candidate or "")
        if resolution.status == "resolved" and resolution.machine is not None:
            _reply_machine_detail(session, storage, settings, event, binding, resolution.machine.id)
        elif resolution.status == "ambiguous":
            _reply_messages_if_possible(
                settings,
                event,
                [build_text_message("找到多台相符機台，請從機台清單選擇。"), build_machine_list_message(layout)],
            )
        else:
            _reply_messages_if_possible(
                settings,
                event,
                [build_text_message("找不到這台機台，請從此場域的機台清單選擇。"), build_machine_list_message(layout)],
            )
        return
    if parsed_intent.intent is not None:
        _reply_rich_menu_action(session, settings, event, binding, parsed_intent.intent)
        return
    if parsed_intent.reason == "ambiguous":
        _reply_messages_if_possible(
            settings,
            event,
            [build_intent_clarification_message(parsed_intent.matched_intents)],
        )
        return
    # LINE is an external trust boundary. Keep unmatched text on deterministic
    # command/help handling and never forward it to the local Codex CLI worker,
    # whose read-only sandbox does not isolate operator-host reads.
    _reply_messages_if_possible(settings, event, [build_help_message()])


_DISPATCH_REPORT_RE = re.compile(r"^回報\s+(\S+)\s+(?:數量\s*)?(\d+)\s*$")
_DISPATCH_ASSIGN_RE = re.compile(r"^派工\s+(\S+)\s+(\S+)\s*$")
_MAINTENANCE_DONE_RE = re.compile(r"^保養完成\s+(\S+)\s*$")


def _handle_dispatch_command(
    session: Session,
    settings,
    event: dict,
    binding: LineConversationScope,
    text: str,
    storage: ArtifactStorage | None = None,
    destination_id: str = "",
) -> bool:
    """Decision-ledger text commands. Returns True when the text was consumed.

    Ledger writes stay deterministic and are never model-mediated.
    """

    if text == "派工單":
        _reply_dispatch_ticket(session, storage, settings, event, binding)
        return True

    match = _DISPATCH_REPORT_RE.match(text)
    if match:
        if _write_actor_or_reply(session, settings, event, destination_id, binding) is False:
            return True
        machine_no, amount = match.group(1), int(match.group(2))
        point = record_machine_actual(
            session,
            organization_id=binding.organization_id,
            site_id=binding.site_id,
            machine_no=machine_no,
            actual_total=amount,
            reported_by=str((event.get("source") or {}).get("userId") or "line"),
        )
        session.commit()
        if point is None:
            reply = f"找不到 {machine_no} 今天的派工單對帳項。請確認機台編號,或先等派工單辨識入帳。"
        else:
            mark = "✅ 達標" if point.consistent else ("⚠️ 與計畫有差異" if point.consistent is False else "已記錄")
            planned = point.plan_json.get("plannedTotal")
            reply = f"已回報 {machine_no} 實際 {amount} PCS(計畫 {planned if planned is not None else '?'}){mark}"
        _reply_messages_if_possible(settings, event, [build_text_message(reply)])
        return True

    match = _DISPATCH_ASSIGN_RE.match(text)
    if match:
        if _write_actor_or_reply(session, settings, event, destination_id, binding) is False:
            return True
        machine_no, assignee = match.group(1), match.group(2)
        point = create_dispatch_point(
            session,
            organization_id=binding.organization_id,
            site_id=binding.site_id,
            machine_no=machine_no,
            occurred_at=utc_now(),
            source="line_report",
            actual_assignee=assignee,
        )
        session.commit()
        candidates = point.prediction_json.get("candidates") or []
        suggestion = "、".join(c["name"] for c in candidates) if candidates else "(無建議:缺排班/技能資料)"
        reply = f"已記錄:{machine_no} 派 {assignee}。\n影子建議:{suggestion}"
        _reply_messages_if_possible(settings, event, [build_text_message(reply)])
        return True

    match = _MAINTENANCE_DONE_RE.match(text)
    if match:
        if _write_actor_or_reply(session, settings, event, destination_id, binding) is False:
            return True
        mold_no = match.group(1)
        rule = reset_mold_counter(
            session,
            organization_id=binding.organization_id,
            mold_no=mold_no,
            actor_name=str((event.get("source") or {}).get("userId") or "line"),
        )
        session.commit()
        if rule is None:
            reply = f"找不到模具 {mold_no} 的保養規則。請先在平台設定。"
        else:
            reply = f"已記錄 {mold_no} 保養完成,模數歸零(門檻 {rule.threshold_count})。"
        _reply_messages_if_possible(settings, event, [build_text_message(reply)])
        return True

    return False


def _reply_dispatch_ticket(
    session: Session,
    storage: ArtifactStorage | None,
    settings,
    event: dict,
    binding: LineConversationScope,
) -> None:
    """LINE「派工單」: crop the dispatch-sheet region of the newest frame and
    reply image + parsed summary. Honest fallback when nothing fresh exists."""

    no_image = [build_text_message(DISPATCH_TICKET_ALIGNMENT_ERROR)]
    layout = load_floorplan_layout(binding.site_slug)
    dispatch_machine = next((machine for machine in layout.machines if machine.line_enabled), None)
    dispatch_camera_ids = (
        camera_ids_for_matches(session, binding=binding, matches=dispatch_machine.camera_matches)
        if dispatch_machine is not None
        else ()
    )
    capture = find_latest_line_crop_capture(
        session,
        organization_id=binding.organization_id,
        site_id=binding.site_id,
        camera_ids=dispatch_camera_ids,
    )
    if capture is None:
        _reply_messages_if_possible(settings, event, no_image)
        return
    image_bytes = storage.read(capture.frame.storage_key) if storage is not None else None
    if not image_bytes:
        _reply_messages_if_possible(settings, event, no_image)
        return
    try:
        cropped = crop_dispatch_ticket_png(
            image_bytes,
            roi=capture.work_order_roi,
            frame_size=capture.frame_size,
        )
    except DispatchTicketCropError:
        _reply_messages_if_possible(settings, event, no_image)
        return
    storage.write(
        key=dispatch_ticket_storage_key(capture.frame.id),
        data=cropped,
        content_type="image/png",
        cache_control="private, max-age=600",
    )
    messages: list[dict] = []
    if settings.line_public_base_url:
        token = create_floorplan_render_token(
            settings,
            site_slug=binding.site_slug,
            source_type=binding.source_type,
            source_id=binding.source_id,
            destination_id=binding.destination_id,
        )
        base_origin = settings.line_public_base_url.rstrip("/")
        image_url = f"{base_origin}/v1/line/dispatch-ticket/{binding.site_slug}/{token}/{capture.frame.id}"
        messages.append(build_image_message(image_url))
    else:
        messages.append(build_text_message("LINE_PUBLIC_BASE_URL 尚未設定，無法傳送派工單圖片。"))
    messages.append(build_text_message(build_dispatch_ticket_summary(capture.observation)))
    _reply_messages_if_possible(settings, event, messages)


def _reply_rich_menu_action(
    session: Session,
    settings,
    event: dict,
    binding: LineConversationScope,
    action: str,
) -> None:
    if action == "floorplan":
        _reply_floorplan(session, settings, event, binding)
        return
    if action == "machines":
        layout = load_floorplan_layout(binding.site_slug)
        _reply_messages_if_possible(settings, event, [build_machine_list_message(layout)])
        return
    if action in {"gauges", "hmi_screen"}:
        _reply_hmi_screen(session, settings, event, binding)
        return
    if action == "daily_incidents":
        _reply_daily_incidents(session, settings, event, binding)
        return
    if action in {"people_portal", "machine_people"}:
        _reply_machine_people(session, settings, event, binding)
        return
    if action == "contact_us":
        _reply_messages_if_possible(settings, event, [build_text_message("聯絡我們：4wallaitech@gmail.com")])
        return
    if action in {"project_progress", "official_site"}:
        _reply_navigation_action(settings, event, action)
        return
    _reply_messages_if_possible(settings, event, [build_help_message()])


def _reply_navigation_action(settings, event: dict, action: str) -> None:
    navigation = {
        "project_progress": (
            "檢視工程進度",
            "請登入 4WALL，在即時工廠頁查看你有權限的工程與現場進度。",
            "開啟工程進度",
            "/factory-twin",
            "",
        ),
        "official_site": (
            "4WALL 官方網站",
            "查看 4WALL 的產品、工廠數位分身與最新服務資訊。",
            "前往官網",
            "/official",
            "",
        ),
    }
    title, body, button_label, path, fragment = navigation[action]
    uri = safe_line_navigation_url(settings, path, fragment=fragment)
    _reply_messages_if_possible(
        settings,
        event,
        [
            build_navigation_message(
                title=title,
                body=body,
                button_label=button_label,
                uri=uri,
            )
        ],
    )


def _reply_floorplan(session: Session, settings, event: dict, binding: LineConversationScope) -> None:
    layout = load_floorplan_layout(binding.site_slug)
    if get_site_for_binding(session, layout, binding) is None:
        _reply_messages_if_possible(settings, event, [build_text_message("此 LINE 對話的場域不存在或與廠區圖不一致。")])
        return
    token = create_floorplan_render_token(
        settings,
        site_slug=layout.site_slug,
        source_type=binding.source_type,
        source_id=binding.source_id,
        destination_id=binding.destination_id,
    )
    try:
        message = build_floorplan_imagemap_message(settings, layout=layout, group_id=binding.source_id, render_token=token)
    except ValueError:
        message = build_text_message("LINE_PUBLIC_BASE_URL 尚未設定，無法產生廠區圖。")
    _reply_messages_if_possible(settings, event, [message])


def _reply_machine_detail(
    session: Session,
    storage: ArtifactStorage,
    settings,
    event: dict,
    binding: LineConversationScope,
    machine_id: str,
) -> None:
    layout = load_floorplan_layout(binding.site_slug)
    machine = layout.machine(machine_id)
    if machine is None:
        _reply_messages_if_possible(settings, event, [build_text_message("找不到指定機台。")])
        return
    if not machine.line_enabled:
        _reply_messages_if_possible(settings, event, [build_text_message(f"{machine.label} 尚未開通。")])
        return
    dispatch_camera_ids = camera_ids_for_matches(session, binding=binding, matches=machine.camera_matches)
    capture = find_latest_line_crop_capture(
        session,
        organization_id=binding.organization_id,
        site_id=binding.site_id,
        camera_ids=dispatch_camera_ids,
    )
    if capture is None:
        _reply_messages_if_possible(settings, event, [build_text_message(DISPATCH_TICKET_ALIGNMENT_ERROR)])
        return
    image_bytes = storage.read(capture.frame.storage_key)
    if not image_bytes:
        _reply_messages_if_possible(settings, event, [build_text_message(DISPATCH_TICKET_ALIGNMENT_ERROR)])
        return
    try:
        dispatch_crop = crop_dispatch_ticket_png(
            image_bytes,
            roi=capture.work_order_roi,
            frame_size=capture.frame_size,
        )
        hmi_crop = crop_dispatch_ticket_png(
            image_bytes,
            roi=capture.hmi_roi,
            frame_size=capture.frame_size,
        )
    except DispatchTicketCropError:
        _reply_messages_if_possible(settings, event, [build_text_message(DISPATCH_TICKET_ALIGNMENT_ERROR)])
        return
    storage.write(
        key=dispatch_ticket_storage_key(capture.frame.id),
        data=dispatch_crop,
        content_type="image/png",
        cache_control="private, max-age=600",
    )
    storage.write(
        key=hmi_screen_storage_key(capture.frame.id),
        data=hmi_crop,
        content_type="image/png",
        cache_control="private, max-age=600",
    )
    if not settings.line_public_base_url:
        _reply_messages_if_possible(settings, event, [build_text_message("LINE_PUBLIC_BASE_URL 尚未設定，無法傳送機台圖片。")])
        return
    token = create_floorplan_render_token(
        settings,
        site_slug=binding.site_slug,
        source_type=binding.source_type,
        source_id=binding.source_id,
        destination_id=binding.destination_id,
    )
    base_origin = settings.line_public_base_url.rstrip("/")
    messages = [
        build_text_message("當下派工單"),
        build_image_message(
            f"{base_origin}/v1/line/dispatch-ticket/{binding.site_slug}/{token}/{capture.frame.id}"
        ),
        build_text_message("當下 HMI 螢幕"),
        build_image_message(
            f"{base_origin}/v1/line/hmi-screen/{binding.site_slug}/{token}/{capture.frame.id}"
        ),
    ]
    if hmi_screen_is_overexposed(session, layout=layout, binding=binding, machine=machine):
        messages.append(build_text_message("螢幕現在過曝。"))
    _reply_messages_if_possible(settings, event, messages)


def _reply_hmi_screen(
    session: Session,
    settings,
    event: dict,
    binding: LineConversationScope,
) -> None:
    layout = load_floorplan_layout(binding.site_slug)
    machine = next((item for item in layout.machines if item.line_enabled), None)
    if machine is None:
        _reply_messages_if_possible(settings, event, [build_text_message("HC600-01 尚未開通。")])
        return
    view = build_hmi_screen_view(session, layout=layout, binding=binding, machine=machine)
    if view is None:
        if hmi_screen_is_overexposed(session, layout=layout, binding=binding, machine=machine):
            _reply_messages_if_possible(settings, event, [build_text_message("螢幕現在過曝。")])
            return
        _reply_messages_if_possible(
            settings,
            event,
            [build_text_message("HC600-01 目前沒有 3 分鐘內可確認的螢幕資訊。")],
        )
        return
    _reply_messages_if_possible(settings, event, [build_hmi_screen_message(view)])


def _reply_machine_people(
    session: Session,
    settings,
    event: dict,
    binding: LineConversationScope,
) -> None:
    layout = load_floorplan_layout(binding.site_slug)
    machine = next((item for item in layout.machines if item.person_camera_matches and item.line_enabled), None)
    if machine is None:
        _reply_messages_if_possible(
            settings,
            event,
            [build_text_message("HC600-01 機台附近目前沒有 60 秒內的新偵測資料。")],
        )
        return
    count = latest_machine_people_count(session, layout=layout, binding=binding, machine=machine)
    text = (
        f"{machine.label} 機台附近目前偵測到 {count} 人。"
        if count is not None
        else f"{machine.label} 機台附近目前沒有 60 秒內的新偵測資料。"
    )
    _reply_messages_if_possible(settings, event, [build_text_message(text)])


def _reply_daily_incidents(session: Session, settings, event: dict, binding: LineConversationScope) -> None:
    start, end, summary_date = today_bounds_taipei()
    incidents = list(
        session.exec(
            select(IncidentRecord)
            .where(
                IncidentRecord.organization_id == binding.organization_id,
                IncidentRecord.site_id == binding.site_id,
                IncidentRecord.created_at >= start,
                IncidentRecord.created_at < end,
            )
            .order_by(IncidentRecord.created_at.desc())
        ).all()
    )
    summary = build_daily_summary(session, incidents, summary_date)
    _reply_messages_if_possible(settings, event, [build_line_daily_summary_message(summary)])


def _report_machine_incident(
    session: Session,
    settings,
    event: dict,
    binding: LineConversationScope,
    machine_id: str,
    *,
    actor_user_id: str | None,
) -> None:
    layout = load_floorplan_layout(binding.site_slug)
    site = get_site_for_binding(session, layout, binding)
    machine = layout.machine(machine_id)
    if site is None or machine is None:
        _reply_messages_if_possible(settings, event, [build_text_message("找不到指定機台或場域。")])
        return
    point = machine_center(machine)
    incident = create_incident(
        session,
        settings,
        CreateIncidentRequestDto(
            organizationId=binding.organization_id,
            siteId=binding.site_id,
            title=f"{machine.label} LINE 回報異常",
            description="LINE 對話從手機廠區圖一鍵回報，待值班人員確認。",
            severity="medium",
            source="line",
            location=IncidentLocationDto(
                siteId=site.id,
                siteName=site.name,
                areaName="靚程工廠",
                equipmentId=machine.id,
                equipmentName=machine.label,
                description=f"LINE floorplan report: {machine.label}",
                floorplanX=point.x,
                floorplanY=point.y,
                modelObjectId=machine.id,
            ),
            reporterName=_line_actor_name(event),
        ),
        actor_user_id=actor_user_id,
        actor_name=_line_actor_name(event),
    )
    _reply_messages_if_possible(settings, event, [build_text_message(f"已建立待確認異常：{incident.title}")])


def _handle_incident_postback(
    session: Session,
    settings,
    rate_limiter: RateLimiter,
    event: dict,
    data: dict[str, str],
    destination_id: str,
    record: LineWebhookEventRecord,
) -> None:
    action = data.get("action")
    incident_id = data.get("incidentId")
    if not action or not incident_id:
        _reply_messages_if_possible(settings, event, [build_text_message("缺少 incidentId。")])
        return

    binding = _conversation_scope_or_reply(session, settings, rate_limiter, event, destination_id, record)
    if binding is None:
        return
    incident = session.get(IncidentRecord, incident_id)
    if (
        incident is None
        or incident.organization_id != binding.organization_id
        or incident.site_id != binding.site_id
    ):
        _reply_messages_if_possible(settings, event, [build_text_message("找不到此異常。")])
        return

    actor_name = _line_actor_name(event)
    actor_user_id = binding.actor_user_id
    if action in INCIDENT_POSTBACK_WRITE_ACTIONS:
        write_actor = _write_actor_or_reply(session, settings, event, destination_id, binding)
        if write_actor is False:
            return
        actor_user_id = write_actor
    if action == "confirm_incident":
        update_incident_status(session, settings, incident, "confirmed", actor_user_id=actor_user_id, actor_name=actor_name)
        _reply_messages_if_possible(settings, event, [build_text_message(f"已確認異常：{incident.title}")])
        return
    if action == "mark_false_positive":
        update_incident_status(session, settings, incident, "false_positive", actor_user_id=actor_user_id, actor_name=actor_name)
        _reply_messages_if_possible(settings, event, [build_text_message(f"已標記誤報：{incident.title}")])
        return
    if action == "start_progress":
        update_incident_status(session, settings, incident, "in_progress", actor_user_id=actor_user_id, actor_name=actor_name)
        _reply_messages_if_possible(settings, event, [build_text_message(f"已開始處理：{incident.title}")])
        return
    if action == "resolve_incident":
        update_incident_status(session, settings, incident, "resolved", actor_user_id=actor_user_id, actor_name=actor_name)
        _reply_messages_if_possible(settings, event, [build_text_message(f"已結案：{incident.title}")])
        return
    if action == "reopen_incident":
        reopen_incident(session, settings, incident, actor_user_id=actor_user_id, actor_name=actor_name)
        _reply_messages_if_possible(settings, event, [build_text_message(f"已重開異常：{incident.title}")])
        return
    if action == "view_incident":
        url = f"{settings.app_origin.rstrip('/')}/incidents/{incident.id}" if settings.app_origin else incident.id
        _reply_messages_if_possible(settings, event, [build_text_message(f"異常連結：{url}")])
        return
    _reply_messages_if_possible(settings, event, [build_text_message(f"不支援的異常動作：{action}")])


def _conversation_scope_or_reply(
    session: Session,
    settings,
    rate_limiter: RateLimiter,
    event: dict,
    destination_id: str,
    record: LineWebhookEventRecord,
) -> LineConversationScope | None:
    source = event.get("source") or {}
    source_type = source.get("type")
    if source_type == "group":
        group_id = str(source.get("groupId") or "").strip()
        binding = resolve_line_group_scope(session, destination_id, group_id) if group_id else None
        if binding is None:
            _reply_messages_if_possible(settings, event, [build_text_message("此群組尚未綁定場域")])
        return binding
    if source_type == "user":
        if not settings.line_account_linking_enabled:
            _reply_messages_if_possible(
                settings,
                event,
                [build_text_message("一對一帳號連結尚未開放，請先在已綁定的 LINE 值班群組使用。")],
            )
            return None
        line_user_id = str(source.get("userId") or "").strip()
        binding = resolve_line_user_scope(session, destination_id, line_user_id) if line_user_id else None
        if binding is None:
            _reply_account_link_start(
                session,
                settings,
                rate_limiter,
                event,
                destination_id,
                line_user_id,
                record,
            )
        return binding
    _reply_messages_if_possible(
        settings,
        event,
        [build_text_message("目前只支援一對一聊天或已綁定的 LINE 群組。")],
    )
    return None


def _reply_account_link_start(
    session: Session,
    settings,
    rate_limiter: RateLimiter,
    event: dict,
    destination_id: str,
    line_user_id: str,
    record: LineWebhookEventRecord,
) -> None:
    if not settings.line_account_linking_enabled:
        _reply_messages_if_possible(
            settings,
            event,
            [build_text_message("一對一帳號連結尚未開放，請先在已綁定的 LINE 值班群組使用。")],
        )
        return
    if not settings.app_origin or not destination_id or not line_user_id:
        _reply_messages_if_possible(settings, event, [build_text_message("帳號連結目前無法使用，請聯絡管理者。")])
        return
    try:
        rate_limiter.check(
            f"line-account-link:user:{destination_id}:{line_user_id}",
            LINE_ACCOUNT_LINK_USER_RATE_LIMIT,
        )
        rate_limiter.check(
            f"line-account-link:destination:{destination_id}",
            LINE_ACCOUNT_LINK_DESTINATION_RATE_LIMIT,
        )
    except HTTPException:
        _reply_messages_if_possible(
            settings,
            event,
            [build_text_message("帳號連結請求過多，請稍後再輸入「連結帳號」。")],
        )
        return
    try:
        attempt = create_line_account_link_attempt(
            session,
            settings,
            destination_id=destination_id,
            line_user_id=line_user_id,
        )
    except (LineIdentityConfigurationError, LineBotConfigurationError, LineBotDeliveryError):
        _reply_messages_if_possible(settings, event, [build_text_message("帳號連結目前無法使用，請稍後再試。")])
        return
    link_url = f"{settings.app_origin.rstrip('/')}/line/link#flow={quote(attempt.flow_token, safe='')}"
    _commit_and_reply_durable_line_messages(
        session,
        settings,
        event,
        record,
        [build_account_link_message(link_url)],
    )


def _write_actor_or_reply(
    session: Session,
    settings,
    event: dict,
    destination_id: str,
    binding: LineConversationScope,
) -> str | bool:
    if binding.source_type == "user":
        if binding.can_write and binding.actor_user_id:
            return binding.actor_user_id
    elif settings.line_account_linking_enabled:
        source = event.get("source") or {}
        line_user_id = str(source.get("userId") or "").strip()
        user_scope = resolve_line_user_scope(session, destination_id, line_user_id) if line_user_id else None
        if (
            user_scope is not None
            and user_scope.organization_id == binding.organization_id
            and user_scope.site_id == binding.site_id
            and user_scope.can_write
            and user_scope.actor_user_id
        ):
            return user_scope.actor_user_id
    _reply_messages_if_possible(
        settings,
        event,
        [build_text_message("你的 4WALL 帳號沒有此場域的寫入權限，未執行變更。")],
    )
    return False


def _line_actor_name(event: dict) -> str:
    source = event.get("source") or {}
    user_id = source.get("userId") or source.get("groupId") or source.get("roomId") or "unknown"
    return f"LINE:{user_id}"


def _commit_and_reply_durable_line_messages(
    session: Session,
    settings,
    event: dict,
    record: LineWebhookEventRecord,
    messages: list[dict],
) -> None:
    record.encrypted_reply_messages = encrypt_line_account_link_reply_messages(settings, messages)
    session.commit()
    _reply_messages_strict(settings, event, messages)


def _reply_messages_strict(settings, event: dict, messages: list[dict]) -> None:
    reply_token = str(event.get("replyToken") or "").strip()
    if not reply_token:
        raise LineBotDeliveryError("missing_line_reply_token", retryable=False)
    reply_line_messages(settings, reply_token, messages)


def _reply_messages_if_possible(settings, event: dict, messages: list[dict]) -> None:
    reply_token = event.get("replyToken")
    if not reply_token:
        return
    try:
        reply_line_messages(settings, reply_token, messages)
    except (LineBotConfigurationError, LineBotDeliveryError):
        return
