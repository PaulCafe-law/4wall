from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import json
import math
import secrets
from typing import Any
from urllib.parse import urlencode

from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from sqlalchemy import or_, update
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.config import Settings
from app.line_bot import issue_line_link_token
from app.line_floorplan.layout import (
    FloorplanLayout,
    FloorplanLayoutError,
    load_floorplan_layout_for_site,
)
from app.models import (
    LineAccountLinkAttempt,
    LineGroupBinding,
    LineUserBinding,
    Organization,
    OrganizationMembership,
    Site,
    UserAccount,
)


LINE_ACCOUNT_LINK_URL = "https://access.line.me/dialog/bot/accountLink"
LINE_ACCOUNT_LINK_TTL = timedelta(minutes=10)
LINE_ACCOUNT_LINK_CREATE_RETRIES = 5
LINE_ACCOUNT_LINK_STATUS_PENDING_WEB = "pending_web_confirmation"
LINE_ACCOUNT_LINK_STATUS_PENDING_LINE = "pending_line_confirmation"
LINE_ACCOUNT_LINK_STATUS_CONSUMED = "consumed"
LINE_ACCOUNT_LINK_STATUS_FAILED = "failed"
LINE_ACCOUNT_LINK_STATUS_SUPERSEDED = "superseded"
LINE_ACCOUNT_LINK_STATUS_EXPIRED = "expired"


class LineIdentityError(RuntimeError):
    pass


class LineIdentityConfigurationError(LineIdentityError):
    pass


class LineAccountLinkError(LineIdentityError):
    pass


class LineIdentityAuthorizationError(LineAccountLinkError):
    pass


class LineAccountLinkConflictError(LineAccountLinkError):
    pass


@dataclass(frozen=True)
class LineConversationScope:
    destination_id: str
    source_type: str
    source_id: str
    organization_id: str
    site_id: str
    site_slug: str
    actor_user_id: str | None
    can_write: bool


@dataclass(frozen=True)
class LineAccountLinkStart:
    flow_token: str
    expires_at: datetime


@dataclass(frozen=True)
class LineAccountLinkConfirmation:
    redirect_token: str
    expires_at: datetime


def encrypt_line_account_link_reply_messages(
    settings: Settings,
    messages: list[dict[str, Any]],
) -> str:
    _validate_line_reply_messages(messages)
    try:
        serialized = json.dumps(
            messages,
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
    except (OverflowError, RecursionError, TypeError, ValueError) as exc:
        raise LineAccountLinkError("line_account_link_reply_payload_invalid") from exc
    return _multi_fernet(settings).encrypt(serialized).decode("ascii")


def decrypt_line_account_link_reply_messages(
    settings: Settings,
    encrypted_payload: str,
) -> list[dict[str, Any]]:
    if type(encrypted_payload) is not str or not encrypted_payload:
        raise LineAccountLinkError("line_account_link_reply_payload_invalid")
    try:
        plaintext = _multi_fernet(settings).decrypt(encrypted_payload.encode("ascii")).decode("utf-8")
        payload = json.loads(
            plaintext,
            object_pairs_hook=_decode_json_object_without_duplicates,
            parse_constant=_reject_json_constant,
        )
    except (InvalidToken, UnicodeError, json.JSONDecodeError, RecursionError, TypeError, ValueError) as exc:
        raise LineAccountLinkError("line_account_link_reply_payload_invalid") from exc
    _validate_line_reply_messages(payload)
    return payload


def create_line_account_link_attempt(
    session: Session,
    settings: Settings,
    *,
    destination_id: str,
    line_user_id: str,
    now: datetime | None = None,
) -> LineAccountLinkStart:
    _require_account_linking(settings)
    normalized_destination = _required_text(destination_id, "missing_line_destination_id")
    _require_destination(settings, normalized_destination)
    normalized_line_user = _required_text(line_user_id, "missing_line_user_id")
    issued_at = _as_utc(now or datetime.now(timezone.utc))
    link_token = issue_line_link_token(settings, normalized_line_user)
    flow_token = _new_unique_secret(session, LineAccountLinkAttempt.flow_token_hash)
    encrypted_link_token = _multi_fernet(settings).encrypt(link_token.encode("utf-8")).decode("ascii")

    _expire_stale_account_link_attempts(session, issued_at)
    for retry_index in range(LINE_ACCOUNT_LINK_CREATE_RETRIES):
        try:
            attempt = _create_current_account_link_attempt(
                session,
                destination_id=normalized_destination,
                line_user_id=normalized_line_user,
                flow_token_hash=_secret_hash(flow_token),
                encrypted_link_token=encrypted_link_token,
                issued_at=issued_at,
            )
            return LineAccountLinkStart(flow_token=flow_token, expires_at=attempt.expires_at)
        except IntegrityError:
            if retry_index + 1 == LINE_ACCOUNT_LINK_CREATE_RETRIES:
                raise LineAccountLinkConflictError("line_account_link_start_conflict") from None
    raise LineAccountLinkConflictError("line_account_link_start_conflict")


def _expire_stale_account_link_attempts(session: Session, expired_at: datetime) -> None:
    session.exec(
        update(LineAccountLinkAttempt)
        .where(
            LineAccountLinkAttempt.is_current == True,  # noqa: E712
            LineAccountLinkAttempt.expires_at <= expired_at,
            LineAccountLinkAttempt.status.in_(
                [LINE_ACCOUNT_LINK_STATUS_PENDING_WEB, LINE_ACCOUNT_LINK_STATUS_PENDING_LINE]
            ),
        )
        .values(
            status=LINE_ACCOUNT_LINK_STATUS_EXPIRED,
            is_current=None,
            encrypted_link_token=None,
            redirect_token_hash=None,
            updated_at=expired_at,
        )
    )
    session.flush()


def _create_current_account_link_attempt(
    session: Session,
    *,
    destination_id: str,
    line_user_id: str,
    flow_token_hash: str,
    encrypted_link_token: str,
    issued_at: datetime,
) -> LineAccountLinkAttempt:
    with session.begin_nested():
        previous = session.exec(
            select(LineAccountLinkAttempt).where(
                LineAccountLinkAttempt.destination_id == destination_id,
                LineAccountLinkAttempt.expected_line_user_id == line_user_id,
                LineAccountLinkAttempt.is_current == True,  # noqa: E712
            ).with_for_update()
        ).first()
        if previous is not None:
            _retire_attempt(
                previous,
                status=LINE_ACCOUNT_LINK_STATUS_SUPERSEDED,
                retired_at=issued_at,
                consumed=False,
            )
            session.add(previous)
            # Release the nullable-current unique slot before inserting its replacement.
            session.flush()

        attempt = LineAccountLinkAttempt(
            flow_token_hash=flow_token_hash,
            expected_line_user_id=line_user_id,
            destination_id=destination_id,
            is_current=True,
            encrypted_link_token=encrypted_link_token,
            status=LINE_ACCOUNT_LINK_STATUS_PENDING_WEB,
            expires_at=issued_at + LINE_ACCOUNT_LINK_TTL,
            created_at=issued_at,
            updated_at=issued_at,
        )
        session.add(attempt)
        session.flush()
    return attempt


def confirm_line_account_link_site(
    session: Session,
    settings: Settings,
    *,
    flow_token: str,
    user_id: str,
    site_id: str,
    now: datetime | None = None,
) -> LineAccountLinkConfirmation:
    _require_account_linking(settings)
    confirmed_at = _as_utc(now or datetime.now(timezone.utc))
    attempt = _get_attempt_by_flow(session, flow_token, for_update=True)
    _require_destination(settings, attempt.destination_id)
    _require_attempt_state(session, attempt, LINE_ACCOUNT_LINK_STATUS_PENDING_WEB, confirmed_at)
    _authorized_user_site(session, user_id=user_id, site_id=site_id)

    try:
        if not attempt.encrypted_link_token:
            raise LineIdentityConfigurationError("line_account_link_token_unreadable")
        link_token = _multi_fernet(settings).decrypt(attempt.encrypted_link_token.encode("ascii")).decode("utf-8")
    except (InvalidToken, UnicodeError) as exc:
        raise LineIdentityConfigurationError("line_account_link_token_unreadable") from exc

    nonce = _new_unique_secret(session, LineAccountLinkAttempt.nonce_hash)
    account_link_url = f"{LINE_ACCOUNT_LINK_URL}?{urlencode({'linkToken': link_token, 'nonce': nonce})}"
    redirect_token = _new_unique_secret(session, LineAccountLinkAttempt.redirect_token_hash)
    attempt.user_id = user_id
    attempt.site_id = site_id
    attempt.nonce_hash = _secret_hash(nonce)
    attempt.redirect_token_hash = _secret_hash(redirect_token)
    attempt.encrypted_link_token = _multi_fernet(settings).encrypt(account_link_url.encode("utf-8")).decode("ascii")
    attempt.status = LINE_ACCOUNT_LINK_STATUS_PENDING_LINE
    attempt.updated_at = confirmed_at
    session.add(attempt)
    session.flush()
    return LineAccountLinkConfirmation(redirect_token=redirect_token, expires_at=attempt.expires_at)


def consume_line_account_link_redirect(
    session: Session,
    settings: Settings,
    *,
    redirect_token: str,
    now: datetime | None = None,
) -> str:
    _require_account_linking(settings)
    redirected_at = _as_utc(now or datetime.now(timezone.utc))
    attempt = _get_attempt_by_redirect_token(session, redirect_token, for_update=True)
    _require_destination(settings, attempt.destination_id)
    _require_attempt_state(session, attempt, LINE_ACCOUNT_LINK_STATUS_PENDING_LINE, redirected_at)
    if attempt.redirected_at is not None or not attempt.encrypted_link_token:
        raise LineAccountLinkError("line_account_link_redirect_used")
    try:
        account_link_url = _multi_fernet(settings).decrypt(
            attempt.encrypted_link_token.encode("ascii")
        ).decode("utf-8")
    except (InvalidToken, UnicodeError) as exc:
        raise LineIdentityConfigurationError("line_account_link_redirect_unreadable") from exc
    if not account_link_url.startswith(f"{LINE_ACCOUNT_LINK_URL}?"):
        raise LineIdentityConfigurationError("line_account_link_redirect_invalid")

    attempt.encrypted_link_token = None
    attempt.redirect_token_hash = None
    attempt.redirected_at = redirected_at
    attempt.updated_at = redirected_at
    session.add(attempt)
    session.flush()
    return account_link_url


def consume_line_account_link(
    session: Session,
    settings: Settings,
    *,
    nonce: str,
    destination_id: str,
    line_user_id: str,
    result: str = "ok",
    now: datetime | None = None,
) -> LineUserBinding | None:
    _require_account_linking(settings)
    consumed_at = _as_utc(now or datetime.now(timezone.utc))
    normalized_destination = _required_text(destination_id, "missing_line_destination_id")
    _require_destination(settings, normalized_destination)
    attempt = _get_attempt_by_nonce(session, nonce, for_update=True)
    _require_attempt_state(session, attempt, LINE_ACCOUNT_LINK_STATUS_PENDING_LINE, consumed_at)
    if attempt.destination_id != normalized_destination:
        raise LineAccountLinkError("line_account_link_identity_mismatch")
    if result != "ok":
        _retire_attempt(
            attempt,
            status=LINE_ACCOUNT_LINK_STATUS_FAILED,
            retired_at=consumed_at,
            consumed=True,
        )
        session.add(attempt)
        session.flush()
        return None
    normalized_line_user = _required_text(line_user_id, "missing_line_user_id")
    if attempt.expected_line_user_id != normalized_line_user:
        raise LineAccountLinkError("line_account_link_identity_mismatch")
    if not attempt.user_id or not attempt.site_id:
        raise LineAccountLinkError("line_account_link_incomplete")

    _authorized_user_site(session, user_id=attempt.user_id, site_id=attempt.site_id)
    try:
        with session.begin_nested():
            binding = _upsert_line_user_binding(
                session,
                destination_id=normalized_destination,
                line_user_id=normalized_line_user,
                user_id=attempt.user_id,
                site_id=attempt.site_id,
                verified_at=consumed_at,
            )
    except (IntegrityError, LineAccountLinkConflictError) as exc:
        _retire_attempt(
            attempt,
            status=LINE_ACCOUNT_LINK_STATUS_FAILED,
            retired_at=consumed_at,
            consumed=True,
        )
        session.add(attempt)
        session.flush()
        if isinstance(exc, LineAccountLinkConflictError):
            raise
        raise LineAccountLinkConflictError("line_account_link_conflict") from None
    _retire_attempt(
        attempt,
        status=LINE_ACCOUNT_LINK_STATUS_CONSUMED,
        retired_at=consumed_at,
        consumed=True,
    )
    session.add(attempt)
    session.flush()
    return binding


def resolve_line_user_scope(
    session: Session,
    destination_id: str,
    line_user_id: str,
) -> LineConversationScope | None:
    normalized_destination = destination_id.strip()
    normalized_line_user = line_user_id.strip()
    if not normalized_destination or not normalized_line_user:
        return None
    binding = session.exec(
        select(LineUserBinding).where(
            LineUserBinding.destination_id == normalized_destination,
            LineUserBinding.line_user_id == normalized_line_user,
            LineUserBinding.is_active == True,  # noqa: E712
        )
    ).first()
    if binding is None:
        return None
    authorized = _authorized_user_site_or_none(session, user_id=binding.user_id, site_id=binding.site_id)
    if authorized is None:
        return None
    _, site, layout, memberships = authorized
    return LineConversationScope(
        destination_id=normalized_destination,
        source_type="user",
        source_id=normalized_line_user,
        organization_id=site.organization_id,
        site_id=site.id,
        site_slug=layout.site_slug,
        actor_user_id=binding.user_id,
        can_write=_can_write_org(memberships, site.organization_id),
    )


def resolve_line_group_scope(
    session: Session,
    destination_id: str,
    group_id: str,
) -> LineConversationScope | None:
    binding = session.exec(
        select(LineGroupBinding).where(
            LineGroupBinding.group_id == group_id,
            LineGroupBinding.source_type == "group",
            LineGroupBinding.is_active == True,  # noqa: E712
        )
    ).first()
    if binding is None:
        return None
    site = session.get(Site, binding.site_id)
    organization = session.get(Organization, binding.organization_id)
    if (
        site is None
        or organization is None
        or not organization.is_active
        or site.organization_id != binding.organization_id
    ):
        return None
    try:
        layout = load_floorplan_layout_for_site(site.id)
    except FloorplanLayoutError:
        return None
    if layout.site_slug != binding.site_slug:
        return None
    return line_group_scope_from_binding(destination_id, binding)


def line_group_scope_from_binding(
    destination_id: str,
    binding: LineGroupBinding,
) -> LineConversationScope:
    return LineConversationScope(
        destination_id=destination_id,
        source_type="group",
        source_id=binding.group_id,
        organization_id=binding.organization_id,
        site_id=binding.site_id,
        site_slug=binding.site_slug,
        actor_user_id=None,
        can_write=True,
    )


def unlink_line_user_binding(
    session: Session,
    *,
    destination_id: str,
    line_user_id: str,
    expected_user_id: str | None = None,
    now: datetime | None = None,
) -> bool:
    binding = session.exec(
        select(LineUserBinding).where(
            LineUserBinding.destination_id == destination_id,
            LineUserBinding.line_user_id == line_user_id,
            LineUserBinding.is_active == True,  # noqa: E712
        )
    ).first()
    if binding is None or (expected_user_id is not None and binding.user_id != expected_user_id):
        return False
    binding.is_active = False
    binding.updated_at = _as_utc(now or datetime.now(timezone.utc))
    session.add(binding)
    session.flush()
    return True


def _upsert_line_user_binding(
    session: Session,
    *,
    destination_id: str,
    line_user_id: str,
    user_id: str,
    site_id: str,
    verified_at: datetime,
) -> LineUserBinding:
    candidates = session.exec(
        select(LineUserBinding).where(
            LineUserBinding.destination_id == destination_id,
            or_(
                LineUserBinding.line_user_id == line_user_id,
                LineUserBinding.user_id == user_id,
            ),
        ).order_by(LineUserBinding.id).with_for_update()
    ).all()
    line_binding = next((item for item in candidates if item.line_user_id == line_user_id), None)
    user_binding = next((item for item in candidates if item.user_id == user_id), None)

    if line_binding is not None and line_binding.is_active and line_binding.user_id != user_id:
        raise LineAccountLinkConflictError("line_user_already_linked")
    if user_binding is not None and user_binding.is_active and user_binding.line_user_id != line_user_id:
        raise LineAccountLinkConflictError("web_user_already_linked")

    if line_binding is not None and user_binding is not None and line_binding.id != user_binding.id:
        if line_binding.is_active or user_binding.is_active:
            raise LineAccountLinkConflictError("line_account_link_conflict")
        session.delete(user_binding)
        session.flush()
        binding = line_binding
    else:
        binding = line_binding or user_binding

    if binding is None:
        binding = LineUserBinding(
            destination_id=destination_id,
            line_user_id=line_user_id,
            user_id=user_id,
            site_id=site_id,
            is_active=True,
            verified_at=verified_at,
            created_at=verified_at,
            updated_at=verified_at,
        )
    else:
        binding.destination_id = destination_id
        binding.line_user_id = line_user_id
        binding.user_id = user_id
        binding.site_id = site_id
        binding.is_active = True
        binding.verified_at = verified_at
        binding.updated_at = verified_at
    session.add(binding)
    session.flush()
    return binding


def _authorized_user_site(
    session: Session,
    *,
    user_id: str,
    site_id: str,
) -> tuple[UserAccount, Site, FloorplanLayout, list[OrganizationMembership]]:
    authorized = _authorized_user_site_or_none(session, user_id=user_id, site_id=site_id)
    if authorized is None:
        raise LineIdentityAuthorizationError("line_site_not_authorized")
    return authorized


def _authorized_user_site_or_none(
    session: Session,
    *,
    user_id: str,
    site_id: str,
) -> tuple[UserAccount, Site, FloorplanLayout, list[OrganizationMembership]] | None:
    user = session.get(UserAccount, user_id)
    site = session.get(Site, site_id)
    if user is None or not user.is_active or site is None:
        return None
    organization = session.get(Organization, site.organization_id)
    if organization is None or not organization.is_active:
        return None
    memberships = list(
        session.exec(
            select(OrganizationMembership).where(
                OrganizationMembership.user_id == user.id,
                OrganizationMembership.is_active == True,  # noqa: E712
            )
        ).all()
    )
    if not _can_read_org(memberships, site.organization_id):
        return None
    try:
        layout = load_floorplan_layout_for_site(site.id)
    except FloorplanLayoutError:
        return None
    return user, site, layout, memberships


def _can_read_org(memberships: list[OrganizationMembership], organization_id: str) -> bool:
    global_roles = {item.role for item in memberships if item.organization_id is None}
    if global_roles.intersection({"platform_admin", "ops"}):
        return True
    return any(item.organization_id == organization_id for item in memberships)


def _can_write_org(memberships: list[OrganizationMembership], organization_id: str) -> bool:
    global_roles = {item.role for item in memberships if item.organization_id is None}
    if global_roles.intersection({"platform_admin", "ops"}):
        return True
    return any(item.organization_id == organization_id and item.role == "customer_admin" for item in memberships)


def _get_attempt_by_flow(
    session: Session,
    flow_token: str,
    *,
    for_update: bool = False,
) -> LineAccountLinkAttempt:
    normalized_flow = _required_text(flow_token, "line_account_link_invalid")
    statement = select(LineAccountLinkAttempt).where(
        LineAccountLinkAttempt.flow_token_hash == _secret_hash(normalized_flow)
    )
    if for_update:
        statement = statement.with_for_update()
    attempt = session.exec(statement).first()
    if attempt is None:
        raise LineAccountLinkError("line_account_link_invalid")
    return attempt


def _get_attempt_by_nonce(
    session: Session,
    nonce: str,
    *,
    for_update: bool = False,
) -> LineAccountLinkAttempt:
    normalized_nonce = _required_text(nonce, "line_account_link_invalid")
    statement = select(LineAccountLinkAttempt).where(
        LineAccountLinkAttempt.nonce_hash == _secret_hash(normalized_nonce)
    )
    if for_update:
        statement = statement.with_for_update()
    attempt = session.exec(statement).first()
    if attempt is None:
        raise LineAccountLinkError("line_account_link_invalid")
    return attempt


def _get_attempt_by_redirect_token(
    session: Session,
    redirect_token: str,
    *,
    for_update: bool = False,
) -> LineAccountLinkAttempt:
    normalized_token = _required_text(redirect_token, "line_account_link_redirect_invalid")
    statement = select(LineAccountLinkAttempt).where(
        LineAccountLinkAttempt.redirect_token_hash == _secret_hash(normalized_token)
    )
    if for_update:
        statement = statement.with_for_update()
    attempt = session.exec(statement).first()
    if attempt is None:
        raise LineAccountLinkError("line_account_link_redirect_invalid")
    return attempt


def _require_attempt_state(
    session: Session,
    attempt: LineAccountLinkAttempt,
    expected_status: str,
    now: datetime,
) -> None:
    if attempt.consumed_at is not None or attempt.status != expected_status:
        raise LineAccountLinkError("line_account_link_used")
    if _as_utc(attempt.expires_at) <= now:
        _retire_attempt(
            attempt,
            status=LINE_ACCOUNT_LINK_STATUS_EXPIRED,
            retired_at=now,
            consumed=False,
        )
        session.add(attempt)
        session.flush()
        raise LineAccountLinkError("line_account_link_expired")


def _retire_attempt(
    attempt: LineAccountLinkAttempt,
    *,
    status: str,
    retired_at: datetime,
    consumed: bool,
) -> None:
    attempt.status = status
    attempt.is_current = None
    attempt.encrypted_link_token = None
    attempt.redirect_token_hash = None
    attempt.updated_at = retired_at
    if consumed:
        attempt.consumed_at = retired_at


def _new_unique_secret(session: Session, hash_column) -> str:
    for _ in range(5):
        value = secrets.token_urlsafe(32)
        if session.exec(select(LineAccountLinkAttempt.id).where(hash_column == _secret_hash(value))).first() is None:
            return value
    raise LineAccountLinkError("line_account_link_token_generation_failed")


def _secret_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _validate_line_reply_messages(messages: Any) -> None:
    if type(messages) is not list:
        raise LineAccountLinkError("line_account_link_reply_payload_invalid")
    for message in messages:
        if type(message) is not dict:
            raise LineAccountLinkError("line_account_link_reply_payload_invalid")
        _validate_json_value(message, seen=set(), depth=0)


def _validate_json_value(value: Any, *, seen: set[int], depth: int) -> None:
    if depth > 64:
        raise LineAccountLinkError("line_account_link_reply_payload_invalid")
    if value is None or type(value) in {str, bool, int}:
        return
    if type(value) is float:
        if not math.isfinite(value):
            raise LineAccountLinkError("line_account_link_reply_payload_invalid")
        return
    if type(value) not in {list, dict}:
        raise LineAccountLinkError("line_account_link_reply_payload_invalid")

    object_id = id(value)
    if object_id in seen:
        raise LineAccountLinkError("line_account_link_reply_payload_invalid")
    seen.add(object_id)
    try:
        if type(value) is list:
            for item in value:
                _validate_json_value(item, seen=seen, depth=depth + 1)
            return
        for key, item in value.items():
            if type(key) is not str:
                raise LineAccountLinkError("line_account_link_reply_payload_invalid")
            _validate_json_value(item, seen=seen, depth=depth + 1)
    finally:
        seen.remove(object_id)


def _decode_json_object_without_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate_json_key")
        result[key] = value
    return result


def _reject_json_constant(_value: str) -> None:
    raise ValueError("invalid_json_constant")


def _multi_fernet(settings: Settings) -> MultiFernet:
    if not settings.line_account_link_encryption_keys:
        raise LineIdentityConfigurationError("missing_line_account_link_encryption_keys")
    try:
        fernets = [Fernet(key.encode("ascii")) for key in settings.line_account_link_encryption_keys]
    except (TypeError, ValueError, UnicodeEncodeError) as exc:
        raise LineIdentityConfigurationError("invalid_line_account_link_encryption_key") from exc
    return MultiFernet(fernets)


def _require_account_linking(settings: Settings) -> None:
    if not settings.line_account_linking_enabled:
        raise LineIdentityConfigurationError("line_account_linking_disabled")
    if not settings.line_destination_id:
        raise LineIdentityConfigurationError("missing_line_destination_id")
    _multi_fernet(settings)


def _require_destination(settings: Settings, destination_id: str) -> None:
    expected_destination = settings.line_destination_id or ""
    if not secrets.compare_digest(destination_id, expected_destination):
        raise LineAccountLinkError("line_destination_mismatch")


def _required_text(value: str, error_code: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise LineAccountLinkError(error_code)
    return normalized


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
