from __future__ import annotations

import base64
import hashlib
import hmac
from typing import Any
from urllib.parse import parse_qs, quote, urlencode

import httpx


LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push"
LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply"
LINE_LINK_TOKEN_URL = "https://api.line.me/v2/bot/user/{line_user_id}/linkToken"


class LineBotConfigurationError(RuntimeError):
    pass


class LineBotDeliveryError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        retryable: bool = True,
        status_code: int | None = None,
    ) -> None:
        super().__init__(message)
        self.retryable = retryable
        self.status_code = status_code


def line_is_configured(settings) -> bool:
    return bool(settings.line_channel_access_token and settings.line_channel_secret)


def issue_line_link_token(settings, line_user_id: str) -> str:
    if not settings.line_channel_access_token:
        raise LineBotConfigurationError("missing_line_channel_access_token")
    normalized_user_id = line_user_id.strip()
    if not normalized_user_id:
        raise LineBotDeliveryError("missing_line_user_id", retryable=False)
    response = _post_line(
        settings.line_channel_access_token,
        LINE_LINK_TOKEN_URL.format(line_user_id=quote(normalized_user_id, safe="")),
        None,
    )
    link_token = str(response.get("linkToken") or "").strip()
    if not link_token:
        raise LineBotDeliveryError("line_link_token_missing", retryable=False)
    return link_token


def verify_line_signature(raw_body: bytes, signature: str | None, channel_secret: str | None) -> bool:
    if not signature or not channel_secret:
        return False
    digest = hmac.new(channel_secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode("utf-8")
    return hmac.compare_digest(expected, signature)


def build_line_incident_message(incident, action: str) -> dict[str, Any]:
    text = build_line_incident_text(incident, action)
    return {
        "type": "text",
        "text": text,
        "quickReply": {
            "items": [
                _postback_item("確認異常", "confirm_incident", incident.id),
                _postback_item("標記誤判", "mark_false_positive", incident.id),
                _postback_item("開始處理", "start_progress", incident.id),
                _postback_item("標記完成", "resolve_incident", incident.id),
                _postback_item("重新開啟", "reopen_incident", incident.id),
                _postback_item("查看詳情", "view_incident", incident.id),
            ]
        },
    }


def build_line_incident_text(incident, action: str) -> str:
    location = incident.location_json or {}
    location_text = (
        location.get("description")
        or " / ".join(
            value
            for value in [
                location.get("siteName"),
                location.get("areaName"),
                location.get("floor"),
                location.get("equipmentName"),
            ]
            if value
        )
        or "未指定"
    )
    severity_label = _severity_label(incident.severity)
    status_label = _status_label(incident.status)
    return (
        f"【第四面牆｜{severity_label}異常】\n"
        f"位置：{location_text}\n"
        f"問題：{incident.title}\n"
        f"時間：{incident.created_at:%Y/%m/%d %H:%M}\n"
        f"狀態：{status_label}\n"
        f"嚴重程度：{severity_label}\n"
        f"負責人：{incident.assignee_name or '尚未指派'}\n\n"
        f"事件動作：{_action_label(action)}\n"
        "請選擇處理動作。"
    )


def build_line_daily_summary_message(summary) -> dict[str, str]:
    text = summary.lineSummaryMessage if hasattr(summary, "lineSummaryMessage") else str(summary)
    return {"type": "text", "text": text}


def push_line_message(settings, target_id: str, message: dict[str, Any]) -> dict[str, Any]:
    if not settings.line_channel_access_token:
        raise LineBotConfigurationError("missing_line_channel_access_token")
    payload = {"to": target_id, "messages": [message]}
    return _post_line(settings.line_channel_access_token, LINE_PUSH_URL, payload)


def reply_line_message(settings, reply_token: str, message: dict[str, Any]) -> dict[str, Any]:
    return reply_line_messages(settings, reply_token, [message])


def reply_line_messages(settings, reply_token: str, messages: list[dict[str, Any]]) -> dict[str, Any]:
    if not settings.line_channel_access_token:
        raise LineBotConfigurationError("missing_line_channel_access_token")
    payload = {"replyToken": reply_token, "messages": messages[:5]}
    return _post_line(settings.line_channel_access_token, LINE_REPLY_URL, payload)


def parse_postback_data(data: str) -> dict[str, str]:
    parsed = parse_qs(data, keep_blank_values=True)
    return {key: values[-1] for key, values in parsed.items() if values}


def line_event_key(event: dict[str, Any]) -> str:
    webhook_event_id = event.get("webhookEventId")
    if webhook_event_id:
        return str(webhook_event_id)
    source = event.get("source") or {}
    raw = "|".join(
        [
            str(event.get("timestamp") or ""),
            str(event.get("type") or ""),
            str(source.get("type") or ""),
            str(source.get("userId") or source.get("groupId") or source.get("roomId") or ""),
            str((event.get("postback") or {}).get("data") or ""),
            str((event.get("message") or {}).get("id") or ""),
            str((event.get("message") or {}).get("text") or ""),
        ]
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _post_line(access_token: str, url: str, payload: dict[str, Any] | None) -> dict[str, Any]:
    request_kwargs: dict[str, Any] = {
        "headers": {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        "timeout": 10,
    }
    if payload is not None:
        request_kwargs["json"] = payload
    try:
        response = httpx.post(url, **request_kwargs)
    except httpx.HTTPError as exc:
        raise LineBotDeliveryError(exc.__class__.__name__) from exc
    if response.status_code >= 400:
        raise LineBotDeliveryError(
            f"line_api_{response.status_code}",
            retryable=response.status_code == 429 or response.status_code >= 500,
            status_code=response.status_code,
        )
    if response.content:
        try:
            return response.json()
        except ValueError:
            return {"raw": response.text}
    return {"status": "ok"}


def _postback_item(label: str, action: str, incident_id: str) -> dict[str, Any]:
    return {
        "type": "action",
        "action": {
            "type": "postback",
            "label": label,
            "data": urlencode({"action": action, "incidentId": incident_id}),
        },
    }


def _severity_label(value: str) -> str:
    return {
        "low": "低",
        "medium": "中",
        "high": "高風險",
        "critical": "緊急",
    }.get(value, value)


def _status_label(value: str) -> str:
    return {
        "pending_review": "待確認",
        "confirmed": "已確認",
        "in_progress": "處理中",
        "resolved": "已結案",
        "false_positive": "誤判",
    }.get(value, value)


def _action_label(value: str) -> str:
    return {
        "incident_created": "建立事件",
        "incident_confirmed": "確認異常",
        "incident_false_positive": "標記誤判",
        "incident_assigned": "指派負責人",
        "incident_in_progress": "開始處理",
        "incident_resolved": "標記完成",
        "incident_reopened": "重新開啟",
        "daily_summary": "每日摘要",
    }.get(value, value)
