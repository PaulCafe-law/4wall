from __future__ import annotations

import base64
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import hmac
import json
from typing import Any


RENDER_TOKEN_TTL_SECONDS = 10 * 60
LIVEVIEW_TOKEN_TTL_SECONDS = 60 * 60
MAX_CLOCK_SKEW_SECONDS = 60


class FloorplanTokenError(RuntimeError):
    pass


@dataclass(frozen=True)
class FloorplanTokenPayload:
    site_slug: str
    group_id: str
    issued_at: datetime
    purpose: str


def create_floorplan_render_token(settings, *, site_slug: str, group_id: str, now: datetime | None = None) -> str:
    return _create_floorplan_token(settings, site_slug=site_slug, group_id=group_id, purpose="render", now=now)


def create_floorplan_liveview_token(settings, *, site_slug: str, group_id: str, now: datetime | None = None) -> str:
    return _create_floorplan_token(settings, site_slug=site_slug, group_id=group_id, purpose="liveview", now=now)


def verify_floorplan_render_token(
    settings,
    *,
    site_slug: str,
    token: str,
    now: datetime | None = None,
    ttl_seconds: int = RENDER_TOKEN_TTL_SECONDS,
) -> FloorplanTokenPayload:
    return _verify_floorplan_token(
        settings,
        site_slug=site_slug,
        token=token,
        now=now,
        ttl_seconds=ttl_seconds,
        expected_purpose="render",
        allow_legacy_purpose=True,
    )


def verify_floorplan_liveview_token(
    settings,
    *,
    site_slug: str,
    token: str,
    now: datetime | None = None,
    ttl_seconds: int = LIVEVIEW_TOKEN_TTL_SECONDS,
) -> FloorplanTokenPayload:
    return _verify_floorplan_token(
        settings,
        site_slug=site_slug,
        token=token,
        now=now,
        ttl_seconds=ttl_seconds,
        expected_purpose="liveview",
        allow_legacy_purpose=False,
    )


def _create_floorplan_token(
    settings,
    *,
    site_slug: str,
    group_id: str,
    purpose: str,
    now: datetime | None = None,
) -> str:
    issued_at = _as_utc(now or datetime.now(timezone.utc))
    payload = {
        "siteSlug": site_slug,
        "groupId": group_id,
        "issuedAt": int(issued_at.timestamp()),
        "purpose": purpose,
    }
    body = _b64encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    signature = _sign(settings.auth_secret_key, body)
    return f"{body}.{signature}"


def _verify_floorplan_token(
    settings,
    *,
    site_slug: str,
    token: str,
    now: datetime | None,
    ttl_seconds: int,
    expected_purpose: str,
    allow_legacy_purpose: bool,
) -> FloorplanTokenPayload:
    try:
        body, supplied_signature = token.split(".", 1)
    except ValueError as exc:
        raise FloorplanTokenError("invalid_floorplan_token") from exc
    expected_signature = _sign(settings.auth_secret_key, body)
    if not hmac.compare_digest(expected_signature, supplied_signature):
        raise FloorplanTokenError("invalid_floorplan_token_signature")
    try:
        payload = json.loads(_b64decode(body).decode("utf-8"))
    except (ValueError, UnicodeDecodeError) as exc:
        raise FloorplanTokenError("invalid_floorplan_token_payload") from exc
    return _validate_payload(
        payload,
        expected_site_slug=site_slug,
        now=now,
        ttl_seconds=ttl_seconds,
        expected_purpose=expected_purpose,
        allow_legacy_purpose=allow_legacy_purpose,
    )


def _validate_payload(
    payload: dict[str, Any],
    *,
    expected_site_slug: str,
    now: datetime | None,
    ttl_seconds: int,
    expected_purpose: str,
    allow_legacy_purpose: bool,
) -> FloorplanTokenPayload:
    site_slug = str(payload.get("siteSlug") or "")
    group_id = str(payload.get("groupId") or "")
    if site_slug != expected_site_slug or not group_id:
        raise FloorplanTokenError("floorplan_token_scope_mismatch")
    purpose = str(payload.get("purpose") or "")
    if purpose != expected_purpose:
        if not (allow_legacy_purpose and not purpose and expected_purpose == "render"):
            raise FloorplanTokenError("floorplan_token_purpose_mismatch")
        purpose = expected_purpose
    try:
        issued_at_seconds = int(payload.get("issuedAt"))
    except (TypeError, ValueError) as exc:
        raise FloorplanTokenError("invalid_floorplan_token_issued_at") from exc
    issued_at = datetime.fromtimestamp(issued_at_seconds, tz=timezone.utc)
    current = _as_utc(now or datetime.now(timezone.utc))
    age_seconds = (current - issued_at).total_seconds()
    if age_seconds > ttl_seconds:
        raise FloorplanTokenError("floorplan_token_expired")
    if age_seconds < -MAX_CLOCK_SKEW_SECONDS:
        raise FloorplanTokenError("floorplan_token_from_future")
    return FloorplanTokenPayload(site_slug=site_slug, group_id=group_id, issued_at=issued_at, purpose=purpose)


def _sign(secret: str, body: str) -> str:
    digest = hmac.new(secret.encode("utf-8"), body.encode("ascii"), hashlib.sha256).digest()
    return _b64encode(digest)


def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _b64decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode((data + padding).encode("ascii"))


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
