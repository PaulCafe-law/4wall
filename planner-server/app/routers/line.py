from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlmodel import Session, select

from app.deps import get_session, get_settings
from app.incident_dto import LineWebhookResponseDto
from app.incidents import reopen_incident, update_incident_status
from app.line_bot import (
    LineBotConfigurationError,
    LineBotDeliveryError,
    line_event_key,
    line_is_configured,
    parse_postback_data,
    reply_line_message,
    verify_line_signature,
)
from app.models import IncidentRecord, LineWebhookEventRecord, utc_now


router = APIRouter(tags=["line"])


@router.post("/v1/line/webhook", response_model=LineWebhookResponseDto)
async def line_webhook(
    request: Request,
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
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
            _handle_line_event(session, settings, event)
            record.processed_status = "processed"
            record.processed_at = utc_now()
            processed += 1
        except Exception as exc:
            record.processed_status = "failed"
            record.error_message = str(exc)[:500]
            record.processed_at = utc_now()
            _reply_if_possible(settings, event, f"處理失敗：{record.error_message}")
            processed += 1
    session.commit()
    return LineWebhookResponseDto(processed=processed, skipped=skipped)


def _handle_line_event(session: Session, settings, event: dict) -> None:
    if event.get("type") != "postback":
        return
    postback = event.get("postback") or {}
    data = parse_postback_data(str(postback.get("data") or ""))
    action = data.get("action")
    incident_id = data.get("incidentId")
    if not action or not incident_id:
        _reply_if_possible(settings, event, "缺少事件動作或 incidentId。")
        return

    incident = session.get(IncidentRecord, incident_id)
    if incident is None:
        _reply_if_possible(settings, event, "找不到這筆異常事件。")
        return

    actor_name = _line_actor_name(event)
    if action == "confirm_incident":
        update_incident_status(session, settings, incident, "confirmed", actor_user_id=None, actor_name=actor_name)
        _reply_if_possible(settings, event, f"已確認異常：{incident.title}")
        return
    if action == "mark_false_positive":
        update_incident_status(session, settings, incident, "false_positive", actor_user_id=None, actor_name=actor_name)
        _reply_if_possible(settings, event, f"已標記誤判：{incident.title}")
        return
    if action == "start_progress":
        update_incident_status(session, settings, incident, "in_progress", actor_user_id=None, actor_name=actor_name)
        _reply_if_possible(settings, event, f"已開始處理：{incident.title}")
        return
    if action == "resolve_incident":
        update_incident_status(session, settings, incident, "resolved", actor_user_id=None, actor_name=actor_name)
        _reply_if_possible(settings, event, f"已結案：{incident.title}")
        return
    if action == "reopen_incident":
        reopen_incident(session, settings, incident, actor_user_id=None, actor_name=actor_name)
        _reply_if_possible(settings, event, f"已重新開啟：{incident.title}")
        return
    if action == "view_incident":
        url = f"{settings.app_origin.rstrip('/')}/incidents/{incident.id}" if settings.app_origin else incident.id
        _reply_if_possible(settings, event, f"事件詳情：{url}")
        return
    _reply_if_possible(settings, event, f"尚未支援的動作：{action}")


def _line_actor_name(event: dict) -> str:
    source = event.get("source") or {}
    user_id = source.get("userId") or source.get("groupId") or source.get("roomId") or "unknown"
    return f"LINE:{user_id}"


def _reply_if_possible(settings, event: dict, text: str) -> None:
    reply_token = event.get("replyToken")
    if not reply_token:
        return
    try:
        reply_line_message(settings, reply_token, {"type": "text", "text": text[:5000]})
    except (LineBotConfigurationError, LineBotDeliveryError):
        return
