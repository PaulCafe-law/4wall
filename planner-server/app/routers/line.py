from __future__ import annotations

import json
import logging
import time
from threading import Lock

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlmodel import Session, select

from app.deps import get_artifact_storage, get_rate_limiter, get_session, get_settings
from app.incident_dto import CreateIncidentRequestDto, IncidentLocationDto, LineWebhookResponseDto
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
from app.line_floorplan.layout import (
    FloorplanLayoutError,
    load_floorplan_layout,
    validate_imagemap_width,
)
from app.line_floorplan.messages import (
    build_floorplan_imagemap_message,
    build_gauges_message,
    build_help_message,
    build_liveview_button_message,
    build_machine_detail_message,
    build_machine_list_message,
    build_text_message,
)
from app.line_floorplan.render import render_floorplan_png
from app.line_floorplan.service import (
    build_floorplan_state_payload,
    build_machine_detail_payload,
    build_machine_detail_view,
    build_site_gauge_views,
    get_active_group_binding,
    get_site_for_binding,
    machine_center,
    today_bounds_taipei,
)
from app.line_floorplan.tokens import (
    FloorplanTokenError,
    create_floorplan_render_token,
    verify_floorplan_liveview_token,
    verify_floorplan_render_token,
)
from app.line_floorplan.links import liveview_url_for_binding
from app.models import IncidentRecord, LineGroupBinding, LineWebhookEventRecord, utc_now
from app.rate_limit import RateLimitRule, RateLimiter, client_identity
from app.storage import ArtifactStorage
from app.twin_agent import count_pending_line_jobs, enqueue_twin_agent_job, sweep_twin_agent_jobs


router = APIRouter(tags=["line"])
logger = logging.getLogger(__name__)

FLOORPLAN_RENDER_RATE_LIMIT = RateLimitRule(max_attempts=120, window_seconds=60)
FLOORPLAN_LIVEVIEW_RATE_LIMIT = RateLimitRule(max_attempts=120, window_seconds=60)
FLOORPLAN_STATE_CACHE_SECONDS = 5
TWIN_AGENT_LINE_RATE_LIMIT = RateLimitRule(max_attempts=6, window_seconds=60)
TWIN_AGENT_LINE_PENDING_MAX = 3
TWIN_AGENT_LINE_BUSY_TEXT = "訊息較多，AI 助理稍後回覆，請稍等再問一次。"
RICH_MENU_ACTIONS = {"floorplan", "machines", "gauges", "daily_incidents"}
INCIDENT_POSTBACK_ACTIONS = {
    "confirm_incident",
    "mark_false_positive",
    "start_progress",
    "resolve_incident",
    "reopen_incident",
    "view_incident",
}
_floorplan_state_cache: dict[tuple[str, str], tuple[float, dict]] = {}
_floorplan_state_cache_lock = Lock()


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
    cache_key = (layout.site_slug, binding.group_id)
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
    detail = build_machine_detail_view(session, storage, layout=layout, binding=binding, machine=machine)
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
    binding = get_active_group_binding(session, group_id=token_payload.group_id)
    if binding is None or get_site_for_binding(session, layout, binding) is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="floorplan_binding_not_found")

    rendered = render_floorplan_png(session, layout=layout, binding=binding, width=width)
    return Response(
        content=rendered.content,
        media_type="image/png",
        headers={
            "Cache-Control": "public, max-age=60",
            "X-Line-Floorplan-Cache": rendered.cache_status,
            "X-Line-Floorplan-Width": str(rendered.width),
            "X-Line-Floorplan-Height": str(rendered.height),
        },
    )


def _liveview_scope_or_403(session: Session, settings, site_slug: str, token: str):
    try:
        token_payload = verify_floorplan_liveview_token(settings, site_slug=site_slug, token=token)
        layout = load_floorplan_layout(site_slug)
    except (FloorplanTokenError, FloorplanLayoutError) as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="invalid_floorplan_token") from exc
    binding = get_active_group_binding(session, group_id=token_payload.group_id)
    if binding is None or get_site_for_binding(session, layout, binding) is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="invalid_floorplan_token")
    return layout, binding


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

    raw_body = await request.body()
    signature = request.headers.get("x-line-signature")
    if not verify_line_signature(raw_body, signature, settings.line_channel_secret):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="invalid_line_signature")

    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_line_payload") from exc

    processed = 0
    skipped = 0
    for event in payload.get("events", []):
        event_key = line_event_key(event)
        existing = session.exec(select(LineWebhookEventRecord).where(LineWebhookEventRecord.event_key == event_key)).first()
        if existing is not None:
            skipped += 1
            continue
        source = event.get("source") or {}
        record = LineWebhookEventRecord(
            event_key=event_key,
            source_type=source.get("type"),
            source_id=source.get("userId") or source.get("groupId") or source.get("roomId"),
            event_type=event.get("type"),
            payload_json=event,
            processed_status="received",
        )
        session.add(record)
        session.flush()
        try:
            _handle_line_event(session, storage, settings, rate_limiter, event)
            record.processed_status = "processed"
            record.processed_at = utc_now()
            processed += 1
        except Exception as exc:
            record.processed_status = "failed"
            record.error_message = str(exc)[:500]
            record.processed_at = utc_now()
            _reply_messages_if_possible(settings, event, [build_text_message("處理 LINE 訊息時發生錯誤，請稍後再試。")])
            processed += 1
    session.commit()
    return LineWebhookResponseDto(processed=processed, skipped=skipped)


def _handle_line_event(session: Session, storage: ArtifactStorage, settings, rate_limiter: RateLimiter, event: dict) -> None:
    event_type = event.get("type")
    if event_type == "postback":
        _handle_postback_event(session, settings, event)
        return
    if event_type == "message":
        _handle_message_event(session, storage, settings, rate_limiter, event)


def _handle_postback_event(session: Session, settings, event: dict) -> None:
    postback = event.get("postback") or {}
    data = parse_postback_data(str(postback.get("data") or ""))
    action = data.get("action")
    if action in INCIDENT_POSTBACK_ACTIONS:
        _handle_incident_postback(session, settings, event, data)
        return
    if action in RICH_MENU_ACTIONS:
        binding = _bound_group_or_reply(session, settings, event)
        if binding is None:
            return
        _reply_rich_menu_action(session, settings, event, binding, action)
        return
    if action == "report_machine_incident":
        binding = _bound_group_or_reply(session, settings, event)
        if binding is None:
            return
        _report_machine_incident(session, settings, event, binding, data.get("machineId") or "")
        return
    _reply_messages_if_possible(settings, event, [build_text_message(f"不支援的 LINE 動作：{action or 'unknown'}")])


def _handle_message_event(session: Session, storage: ArtifactStorage, settings, rate_limiter: RateLimiter, event: dict) -> None:
    message = event.get("message") or {}
    if message.get("type") != "text":
        _reply_messages_if_possible(settings, event, [build_help_message()])
        return
    text = str(message.get("text") or "").strip()
    source = event.get("source") or {}
    if text == "綁定 靚程":
        if source.get("type") == "group" and source.get("groupId"):
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
    if source.get("type") != "group":
        _reply_messages_if_possible(settings, event, [build_text_message("請在已綁定的 LINE 值班群組使用廠區圖功能。")])
        return
    binding = _bound_group_or_reply(session, settings, event)
    if binding is None:
        return
    action = _text_action(text)
    if action == "machine_detail":
        _reply_machine_detail(session, storage, settings, event, binding, _machine_id_from_text(text))
        return
    if action is not None:
        _reply_rich_menu_action(session, settings, event, binding, action)
        return
    if settings.twin_agent_enabled:
        _handle_twin_agent_message(settings, rate_limiter, event, binding, text)
        return
    _reply_messages_if_possible(settings, event, [build_help_message()])


def _handle_twin_agent_message(
    settings,
    rate_limiter: RateLimiter,
    event: dict,
    binding: LineGroupBinding,
    text: str,
) -> None:
    sweep_twin_agent_jobs(settings)
    if count_pending_line_jobs(binding.group_id) >= TWIN_AGENT_LINE_PENDING_MAX:
        _reply_messages_if_possible(settings, event, [build_text_message(TWIN_AGENT_LINE_BUSY_TEXT)])
        return
    try:
        rate_limiter.check(f"twin-agent-line:{binding.group_id}", TWIN_AGENT_LINE_RATE_LIMIT)
    except HTTPException:
        _reply_messages_if_possible(settings, event, [build_text_message(TWIN_AGENT_LINE_BUSY_TEXT)])
        return
    enqueue_twin_agent_job(
        source="line",
        text=text,
        group_id=binding.group_id,
        reply_token=event.get("replyToken"),
        site_slug=binding.site_slug,
    )


def _reply_rich_menu_action(
    session: Session,
    settings,
    event: dict,
    binding: LineGroupBinding,
    action: str,
) -> None:
    if action == "floorplan":
        _reply_floorplan(session, settings, event, binding)
        return
    if action == "machines":
        layout = load_floorplan_layout(binding.site_slug)
        _reply_messages_if_possible(settings, event, [build_machine_list_message(layout)])
        return
    if action == "gauges":
        layout = load_floorplan_layout(binding.site_slug)
        gauges_by_machine = build_site_gauge_views(session, layout=layout, binding=binding)
        _reply_messages_if_possible(settings, event, [build_gauges_message(gauges_by_machine, layout)])
        return
    if action == "daily_incidents":
        _reply_daily_incidents(session, settings, event, binding)
        return
    _reply_messages_if_possible(settings, event, [build_help_message()])


def _reply_floorplan(session: Session, settings, event: dict, binding: LineGroupBinding) -> None:
    layout = load_floorplan_layout(binding.site_slug)
    if get_site_for_binding(session, layout, binding) is None:
        _reply_messages_if_possible(settings, event, [build_text_message("此群組綁定的場域不存在或與廠區圖不一致。")])
        return
    token = create_floorplan_render_token(settings, site_slug=layout.site_slug, group_id=binding.group_id)
    try:
        message = build_floorplan_imagemap_message(settings, layout=layout, group_id=binding.group_id, render_token=token)
    except ValueError:
        message = build_text_message("LINE_PUBLIC_BASE_URL 尚未設定，無法產生廠區圖。")
    messages = [message]
    liveview_url = liveview_url_for_binding(settings, site_slug=layout.site_slug, group_id=binding.group_id)
    if liveview_url:
        messages.append(build_liveview_button_message(liveview_url=liveview_url))
    _reply_messages_if_possible(settings, event, messages)


def _reply_machine_detail(
    session: Session,
    storage: ArtifactStorage,
    settings,
    event: dict,
    binding: LineGroupBinding,
    machine_id: str,
) -> None:
    layout = load_floorplan_layout(binding.site_slug)
    machine = layout.machine(machine_id)
    if machine is None:
        _reply_messages_if_possible(settings, event, [build_text_message("找不到指定機台。")])
        return
    detail = build_machine_detail_view(session, storage, layout=layout, binding=binding, machine=machine)
    if detail is None:
        _reply_messages_if_possible(settings, event, [build_text_message("此群組綁定的場域不存在或與廠區圖不一致。")])
        return
    liveview_url = liveview_url_for_binding(
        settings,
        site_slug=layout.site_slug,
        group_id=binding.group_id,
        focus=f"machine:{machine.id}",
    )
    _reply_messages_if_possible(settings, event, [build_machine_detail_message(detail, liveview_url=liveview_url)])


def _reply_daily_incidents(session: Session, settings, event: dict, binding: LineGroupBinding) -> None:
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
    binding: LineGroupBinding,
    machine_id: str,
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
            description="LINE 群組從手機廠區圖一鍵回報，待值班人員確認。",
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
        actor_user_id=None,
        actor_name=_line_actor_name(event),
    )
    _reply_messages_if_possible(settings, event, [build_text_message(f"已建立待確認異常：{incident.title}")])


def _handle_incident_postback(session: Session, settings, event: dict, data: dict[str, str]) -> None:
    action = data.get("action")
    incident_id = data.get("incidentId")
    if not action or not incident_id:
        _reply_messages_if_possible(settings, event, [build_text_message("缺少 incidentId。")])
        return

    incident = session.get(IncidentRecord, incident_id)
    if incident is None:
        _reply_messages_if_possible(settings, event, [build_text_message("找不到此異常。")])
        return

    actor_name = _line_actor_name(event)
    if action == "confirm_incident":
        update_incident_status(session, settings, incident, "confirmed", actor_user_id=None, actor_name=actor_name)
        _reply_messages_if_possible(settings, event, [build_text_message(f"已確認異常：{incident.title}")])
        return
    if action == "mark_false_positive":
        update_incident_status(session, settings, incident, "false_positive", actor_user_id=None, actor_name=actor_name)
        _reply_messages_if_possible(settings, event, [build_text_message(f"已標記誤報：{incident.title}")])
        return
    if action == "start_progress":
        update_incident_status(session, settings, incident, "in_progress", actor_user_id=None, actor_name=actor_name)
        _reply_messages_if_possible(settings, event, [build_text_message(f"已開始處理：{incident.title}")])
        return
    if action == "resolve_incident":
        update_incident_status(session, settings, incident, "resolved", actor_user_id=None, actor_name=actor_name)
        _reply_messages_if_possible(settings, event, [build_text_message(f"已結案：{incident.title}")])
        return
    if action == "reopen_incident":
        reopen_incident(session, settings, incident, actor_user_id=None, actor_name=actor_name)
        _reply_messages_if_possible(settings, event, [build_text_message(f"已重開異常：{incident.title}")])
        return
    if action == "view_incident":
        url = f"{settings.app_origin.rstrip('/')}/incidents/{incident.id}" if settings.app_origin else incident.id
        _reply_messages_if_possible(settings, event, [build_text_message(f"異常連結：{url}")])
        return
    _reply_messages_if_possible(settings, event, [build_text_message(f"不支援的異常動作：{action}")])


def _bound_group_or_reply(session: Session, settings, event: dict) -> LineGroupBinding | None:
    source = event.get("source") or {}
    if source.get("type") != "group":
        _reply_messages_if_possible(settings, event, [build_text_message("請在已綁定的 LINE 值班群組使用廠區圖功能。")])
        return None
    group_id = source.get("groupId")
    if not group_id:
        _reply_messages_if_possible(settings, event, [build_text_message("此群組尚未綁定場域")])
        return None
    binding = get_active_group_binding(session, group_id=group_id)
    if binding is None:
        _reply_messages_if_possible(settings, event, [build_text_message("此群組尚未綁定場域")])
        return None
    return binding


def _text_action(text: str) -> str | None:
    if text in {"廠區圖", "floorplan"}:
        return "floorplan"
    if text in {"機台", "machines"}:
        return "machines"
    if text in {"儀表", "gauges"}:
        return "gauges"
    if text in {"異常", "今日異常", "daily_incidents"}:
        return "daily_incidents"
    if text.startswith("機台 "):
        return "machine_detail"
    return None


def _machine_id_from_text(text: str) -> str:
    return text.split(None, 1)[1].strip() if len(text.split(None, 1)) == 2 else ""


def _line_actor_name(event: dict) -> str:
    source = event.get("source") or {}
    user_id = source.get("userId") or source.get("groupId") or source.get("roomId") or "unknown"
    return f"LINE:{user_id}"


def _reply_messages_if_possible(settings, event: dict, messages: list[dict]) -> None:
    reply_token = event.get("replyToken")
    if not reply_token:
        return
    try:
        reply_line_messages(settings, reply_token, messages)
    except (LineBotConfigurationError, LineBotDeliveryError):
        return
