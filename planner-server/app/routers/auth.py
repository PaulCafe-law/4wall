from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlmodel import Session, select

from app.deps import get_current_operator, get_session, get_settings
from app.dto import AuthLogoutRequestDto, AuthRefreshRequestDto, LoginRequestDto, OperatorDto, TokenPairDto
from app.models import OperatorAccount
from app.security import (
    AuthError,
    create_access_token,
    create_refresh_token,
    revoke_refresh_token,
    validate_refresh_token,
    verify_password,
)


router = APIRouter(tags=["auth"])


@router.post("/v1/auth/login", response_model=TokenPairDto)
def login(
    request: LoginRequestDto,
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
) -> TokenPairDto:
    statement = select(OperatorAccount).where(OperatorAccount.username == request.username)
    operator = session.exec(statement).first()
    if operator is None or not operator.is_active or not verify_password(request.password, operator.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_credentials")
    return _issue_token_pair(session, settings, operator)


@router.post("/v1/auth/refresh", response_model=TokenPairDto)
def refresh(
    request: AuthRefreshRequestDto,
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
) -> TokenPairDto:
    try:
        payload = validate_refresh_token(request.refreshToken, settings, session)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    operator = session.get(OperatorAccount, payload["sub"])
    if operator is None or not operator.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="operator_inactive")

    revoke_refresh_token(session, payload["jti"])
    return _issue_token_pair(session, settings, operator)


@router.post("/v1/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: AuthLogoutRequestDto,
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
) -> Response:
    try:
        payload = validate_refresh_token(request.refreshToken, settings, session)
        revoke_refresh_token(session, payload["jti"])
    except AuthError:
        pass
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/v1/auth/me", response_model=OperatorDto)
def me(current_operator: OperatorAccount = Depends(get_current_operator)) -> OperatorDto:
    return OperatorDto(
        operatorId=current_operator.id,
        username=current_operator.username,
        displayName=current_operator.display_name,
    )


def _issue_token_pair(session: Session, settings, operator: OperatorAccount) -> TokenPairDto:
    access_token = create_access_token(settings, operator)
    refresh_token = create_refresh_token(session, settings, operator)
    session.commit()
    return TokenPairDto(
        accessToken=access_token,
        refreshToken=refresh_token,
        expiresInSeconds=settings.access_token_ttl_minutes * 60,
        operator=OperatorDto(
            operatorId=operator.id,
            username=operator.username,
            displayName=operator.display_name,
        ),
    )
