from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session, select

from app.models import OrganizationMembership, OperatorAccount, UserAccount
from app.rate_limit import RateLimiter
from app.security import AuthError, verify_access_token, verify_web_access_token


auth_scheme = HTTPBearer(auto_error=False)


@dataclass
class CurrentWebUser:
    user: UserAccount
    memberships: list[OrganizationMembership]

    @property
    def global_roles(self) -> set[str]:
        return {membership.role for membership in self.memberships if membership.organization_id is None and membership.is_active}

    def roles_for_org(self, organization_id: str) -> set[str]:
        return {
            membership.role
            for membership in self.memberships
            if membership.organization_id == organization_id and membership.is_active
        }

    def can_read_org(self, organization_id: str) -> bool:
        if self.global_roles.intersection({"platform_admin", "ops"}):
            return True
        return bool(self.roles_for_org(organization_id))

    def can_write_org(self, organization_id: str) -> bool:
        if self.global_roles.intersection({"platform_admin", "ops"}):
            return True
        return "customer_admin" in self.roles_for_org(organization_id)


@dataclass
class CurrentActor:
    operator: OperatorAccount | None = None
    web_user: CurrentWebUser | None = None


def get_settings(request: Request):
    return request.app.state.settings


def get_artifact_service(request: Request):
    return request.app.state.artifact_service


def get_route_provider(request: Request):
    return request.app.state.route_provider


def get_corridor_generator(request: Request):
    return request.app.state.corridor_generator


def get_session(request: Request):
    with request.app.state.session_factory() as session:
        yield session


def get_rate_limiter(request: Request) -> RateLimiter:
    return request.app.state.rate_limiter


def get_current_operator(
    credentials: HTTPAuthorizationCredentials | None = Depends(auth_scheme),
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
) -> OperatorAccount:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing_bearer_token")
    try:
        payload = verify_access_token(credentials.credentials, settings)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    operator = session.get(OperatorAccount, payload["sub"])
    if operator is None or not operator.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="operator_inactive")
    return operator


def get_current_web_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(auth_scheme),
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
) -> CurrentWebUser:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing_bearer_token")
    try:
        payload = verify_web_access_token(credentials.credentials, settings)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    user = session.get(UserAccount, payload["sub"])
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="user_inactive")
    memberships = list(
        session.exec(select(OrganizationMembership).where(OrganizationMembership.user_id == user.id)).all()
    )
    return CurrentWebUser(user=user, memberships=memberships)


def get_current_actor(
    credentials: HTTPAuthorizationCredentials | None = Depends(auth_scheme),
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
) -> CurrentActor:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing_bearer_token")
    try:
        payload = verify_access_token(credentials.credentials, settings)
        operator = session.get(OperatorAccount, payload["sub"])
        if operator is None or not operator.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="operator_inactive")
        return CurrentActor(operator=operator)
    except AuthError:
        pass

    try:
        payload = verify_web_access_token(credentials.credentials, settings)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    user = session.get(UserAccount, payload["sub"])
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="user_inactive")
    memberships = list(
        session.exec(select(OrganizationMembership).where(OrganizationMembership.user_id == user.id)).all()
    )
    return CurrentActor(web_user=CurrentWebUser(user=user, memberships=memberships))


def require_internal_user(current_user: CurrentWebUser = Depends(get_current_web_user)) -> CurrentWebUser:
    if not current_user.global_roles.intersection({"platform_admin", "ops"}):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden_role")
    return current_user
