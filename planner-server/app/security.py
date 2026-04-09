from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import secrets
from uuid import uuid4

import jwt
from sqlmodel import Session

from app.config import Settings
from app.models import OperatorAccount, RefreshToken, UserAccount, WebRefreshToken


PBKDF2_ITERATIONS = 390_000
WEB_REFRESH_COOKIE_NAME = "fw_refresh"


class AuthError(RuntimeError):
    pass


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    algorithm, iterations, salt_hex, digest_hex = password_hash.split("$", 3)
    if algorithm != "pbkdf2_sha256":
        raise AuthError("unsupported_password_hash")
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        bytes.fromhex(salt_hex),
        int(iterations),
    )
    return hmac.compare_digest(digest.hex(), digest_hex)


def create_access_token(settings: Settings, operator: OperatorAccount) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_ttl_minutes)
    return jwt.encode(
        {
            "sub": operator.id,
            "username": operator.username,
            "type": "access",
            "exp": expires_at,
        },
        settings.auth_secret_key,
        algorithm="HS256",
    )


def create_refresh_token(session: Session, settings: Settings, operator: OperatorAccount) -> str:
    token_id = uuid4().hex
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_ttl_days)
    session.add(
        RefreshToken(
            id=token_id,
            operator_id=operator.id,
            expires_at=expires_at,
        )
    )
    return jwt.encode(
        {
            "sub": operator.id,
            "username": operator.username,
            "type": "refresh",
            "jti": token_id,
            "exp": expires_at,
        },
        settings.auth_secret_key,
        algorithm="HS256",
    )


def verify_access_token(token: str, settings: Settings) -> dict:
    try:
        payload = jwt.decode(token, settings.auth_secret_key, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise AuthError("invalid_access_token") from exc
    if payload.get("type") != "access":
        raise AuthError("invalid_access_token")
    return payload


def create_web_access_token(settings: Settings, user: UserAccount) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_ttl_minutes)
    return jwt.encode(
        {
            "sub": user.id,
            "email": user.email,
            "type": "web_access",
            "exp": expires_at,
        },
        settings.auth_secret_key,
        algorithm="HS256",
    )


def create_web_refresh_token(session: Session, settings: Settings, user: UserAccount) -> str:
    token_id = uuid4().hex
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_ttl_days)
    session.add(
        WebRefreshToken(
            id=token_id,
            user_id=user.id,
            expires_at=expires_at,
        )
    )
    return jwt.encode(
        {
            "sub": user.id,
            "email": user.email,
            "type": "web_refresh",
            "jti": token_id,
            "exp": expires_at,
        },
        settings.auth_secret_key,
        algorithm="HS256",
    )


def verify_web_access_token(token: str, settings: Settings) -> dict:
    try:
        payload = jwt.decode(token, settings.auth_secret_key, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise AuthError("invalid_web_access_token") from exc
    if payload.get("type") != "web_access":
        raise AuthError("invalid_web_access_token")
    return payload


def validate_refresh_token(token: str, settings: Settings, session: Session) -> dict:
    try:
        payload = jwt.decode(token, settings.auth_secret_key, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise AuthError("invalid_refresh_token") from exc
    if payload.get("type") != "refresh":
        raise AuthError("invalid_refresh_token")
    token_id = payload.get("jti")
    record = session.get(RefreshToken, token_id)
    expires_at = _as_utc(record.expires_at) if record is not None else None
    if record is None or record.revoked_at is not None or expires_at <= datetime.now(timezone.utc):
        raise AuthError("refresh_token_revoked")
    return payload


def validate_web_refresh_token(token: str, settings: Settings, session: Session) -> dict:
    try:
        payload = jwt.decode(token, settings.auth_secret_key, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise AuthError("invalid_web_refresh_token") from exc
    if payload.get("type") != "web_refresh":
        raise AuthError("invalid_web_refresh_token")
    token_id = payload.get("jti")
    record = session.get(WebRefreshToken, token_id)
    expires_at = _as_utc(record.expires_at) if record is not None else None
    if record is None or record.revoked_at is not None or expires_at <= datetime.now(timezone.utc):
        raise AuthError("web_refresh_token_revoked")
    return payload


def revoke_refresh_token(session: Session, token_id: str) -> None:
    record = session.get(RefreshToken, token_id)
    if record is None:
        return
    record.revoked_at = datetime.now(timezone.utc)
    session.add(record)


def revoke_web_refresh_token(session: Session, token_id: str) -> None:
    record = session.get(WebRefreshToken, token_id)
    if record is None:
        return
    record.revoked_at = datetime.now(timezone.utc)
    session.add(record)


def create_invite_token() -> str:
    return secrets.token_urlsafe(32)


def hash_invite_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
