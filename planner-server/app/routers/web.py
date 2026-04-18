from __future__ import annotations

from datetime import datetime, timedelta, timezone
import re
from uuid import uuid4

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import func, or_
from sqlmodel import Session, select

from app.audit import record_audit
from app.deps import (
    CurrentWebUser,
    get_current_web_user,
    get_rate_limiter,
    get_session,
    get_settings,
    require_internal_user,
)
from app.inspection_reporting import latest_reporting_summaries, load_reporting_state
from app.inspection_control import serialize_route_summary, serialize_template_summary
from app.mission_delivery import build_artifact_map, summarize_mission_delivery
from app.models import (
    BillingInvoice,
    Flight,
    FlightEvent,
    Invite,
    InspectionRoute,
    InspectionTemplate,
    Mission,
    MissionArtifact,
    Organization,
    OrganizationMembership,
    Site,
    TelemetryBatch,
    UserAccount,
)
from app.rate_limit import RateLimiter, RateLimitRule, client_identity
from app.security import (
    AuthError,
    WEB_REFRESH_COOKIE_NAME,
    create_invite_token,
    create_web_access_token,
    create_web_refresh_token,
    hash_invite_token,
    hash_password,
    revoke_web_refresh_token,
    validate_web_refresh_token,
    verify_password,
)
from app.web_dto import (
    AcceptInviteRequestDto,
    AuditEventDto,
    BillingInvoiceDto,
    CreateInviteRequestDto,
    CreateInvoiceRequestDto,
    CreateOrganizationRequestDto,
    InviteCreateResponseDto,
    InviteDto,
    MembershipDto,
    MissionSummaryDto,
    OverviewDto,
    OverviewInviteDto,
    OverviewSupportSummaryDto,
    OrganizationDetailDto,
    OrganizationMemberDto,
    OrganizationSummaryDto,
    SiteDto,
    SitePatchRequestDto,
    SiteRequestDto,
    SiteMapDto,
    SiteZoneDto,
    LaunchPointDto,
    InspectionViewpointDto,
    UpdateInvoiceRequestDto,
    UpdateMembershipRequestDto,
    UpdateOrganizationRequestDto,
    WebSessionDto,
    WebLoginRequestDto,
    WebSignupRequestDto,
    WebSessionUserDto,
)
from app.web_scope import (
    apply_org_read_scope,
    ensure_customer_invite_role,
    ensure_org_read_access,
    ensure_org_write_access,
)


router = APIRouter(tags=["web"])

STALE_TELEMETRY_SECONDS = 90
LOW_BATTERY_THRESHOLD = 25
BRIDGE_ALERT_LOOKBACK_MINUTES = 10
BRIDGE_ALERT_EVENT = "BRIDGE_ALERT"
SITE_MAP_DEFAULT_OFFSET = 0.00012
DEFAULT_ZONE_NOTE = "Demo-ready inspection boundary around the site centroid."


@router.post("/v1/web/session/login", response_model=WebSessionDto)
def web_login(
    request: WebLoginRequestDto,
    http_request: Request,
    response: Response,
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
    rate_limiter: RateLimiter = Depends(get_rate_limiter),
) -> WebSessionDto:
    _enforce_session_origin(http_request, settings)
    email = request.email.strip().lower()
    _check_rate_limit(
        rate_limiter,
        http_request,
        scope="web_login",
        subject=email,
        rule=RateLimitRule(
            max_attempts=settings.web_login_rate_limit_attempts,
            window_seconds=settings.web_login_rate_limit_window_seconds,
        ),
    )
    statement = select(UserAccount).where(UserAccount.email == email)
    user = session.exec(statement).first()
    if user is None or not user.is_active or not verify_password(request.password, user.password_hash):
        record_audit(
            session,
            action="web.login_failed",
            target_type="user",
            metadata={"email": email},
        )
        session.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_credentials")
    record_audit(session, action="web.login_succeeded", actor_user_id=user.id, target_type="user", target_id=user.id)
    session_dto = _issue_web_session(session, settings, user, response)
    session.commit()
    return session_dto


@router.post("/v1/web/session/signup", response_model=WebSessionDto)
def web_signup(
    request: WebSignupRequestDto,
    http_request: Request,
    response: Response,
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
    rate_limiter: RateLimiter = Depends(get_rate_limiter),
) -> WebSessionDto:
    _enforce_session_origin(http_request, settings)
    email = request.email.strip().lower()
    org_name = request.organizationName.strip()
    slug_source = request.organizationSlug or org_name
    slug = _slugify(slug_source)
    _check_rate_limit(
        rate_limiter,
        http_request,
        scope="web_signup",
        subject=f"{email}:{slug}",
        rule=RateLimitRule(
            max_attempts=settings.web_signup_rate_limit_attempts,
            window_seconds=settings.web_signup_rate_limit_window_seconds,
        ),
    )
    existing_user = session.exec(select(UserAccount).where(UserAccount.email == email)).first()
    if existing_user is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="user_email_exists")
    existing_org = session.exec(select(Organization).where(Organization.slug == slug)).first()
    if existing_org is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="organization_slug_exists")

    user = UserAccount(
        email=email,
        display_name=request.displayName or email.split("@")[0],
        password_hash=hash_password(request.password),
    )
    session.add(user)
    session.flush()

    organization = Organization(name=org_name, slug=slug)
    session.add(organization)
    session.flush()

    membership = OrganizationMembership(
        user_id=user.id,
        organization_id=organization.id,
        role="customer_admin",
    )
    session.add(membership)
    session.flush()

    record_audit(
        session,
        action="web.signup_succeeded",
        organization_id=organization.id,
        actor_user_id=user.id,
        target_type="user",
        target_id=user.id,
        metadata={"email": user.email},
    )
    record_audit(
        session,
        action="organization.created",
        organization_id=organization.id,
        actor_user_id=user.id,
        target_type="organization",
        target_id=organization.id,
        metadata={"selfServe": True},
    )
    session_dto = _issue_web_session(session, settings, user, response)
    session.commit()
    return session_dto


@router.post("/v1/web/session/refresh", response_model=WebSessionDto)
def web_refresh(
    http_request: Request,
    response: Response,
    refresh_token: str | None = Cookie(default=None, alias=WEB_REFRESH_COOKIE_NAME),
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
) -> WebSessionDto:
    _enforce_session_origin(http_request, settings)
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing_refresh_cookie")
    try:
        payload = validate_web_refresh_token(refresh_token, settings, session)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    user = session.get(UserAccount, payload["sub"])
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="user_inactive")
    revoke_web_refresh_token(session, payload["jti"])
    record_audit(session, action="web.session_refreshed", actor_user_id=user.id, target_type="user", target_id=user.id)
    session_dto = _issue_web_session(session, settings, user, response)
    session.commit()
    return session_dto


@router.post("/v1/web/session/logout", status_code=204)
def web_logout(
    http_request: Request,
    response: Response,
    refresh_token: str | None = Cookie(default=None, alias=WEB_REFRESH_COOKIE_NAME),
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
) -> Response:
    _enforce_session_origin(http_request, settings)
    if refresh_token:
        try:
            payload = validate_web_refresh_token(refresh_token, settings, session)
            revoke_web_refresh_token(session, payload["jti"])
            record_audit(session, action="web.logout", actor_user_id=payload["sub"], target_type="user", target_id=payload["sub"])
        except AuthError:
            pass
    _clear_refresh_cookie(response)
    session.commit()
    return response


@router.get("/v1/web/session/me", response_model=WebSessionUserDto)
def web_me(current_user: CurrentWebUser = Depends(get_current_web_user)) -> WebSessionUserDto:
    return _serialize_user(current_user)


@router.get("/v1/web/overview", response_model=OverviewDto)
def web_overview(
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> OverviewDto:
    sites = session.exec(
        apply_org_read_scope(select(Site), Site.organization_id, current_user).order_by(Site.created_at.desc())
    ).all()
    missions = session.exec(
        apply_org_read_scope(
            select(Mission).where(Mission.organization_id.is_not(None)),
            Mission.organization_id,
            current_user,
        ).order_by(Mission.created_at.desc())
    ).all()
    mission_artifacts = build_artifact_map(session, [mission.id for mission in missions])
    report_map, event_map, _ = load_reporting_state(session, [mission.id for mission in missions])
    mission_summaries = [
        _serialize_mission_summary(
            mission,
            mission_artifacts.get(mission.id, []),
            report=report_map.get(mission.id),
            events=event_map.get(mission.id, []),
        )
        for mission in missions
    ]

    invoices = session.exec(
        apply_org_read_scope(select(BillingInvoice), BillingInvoice.organization_id, current_user).order_by(
            BillingInvoice.created_at.desc()
        )
    ).all()
    pending_invites = session.exec(
        apply_org_read_scope(
            select(Invite, Organization)
            .join(Organization, Organization.id == Invite.organization_id)
            .where(Invite.accepted_at.is_(None), Invite.revoked_at.is_(None)),
            Invite.organization_id,
            current_user,
        ).order_by(Invite.created_at.desc())
    ).all()

    planning_count = sum(1 for mission in mission_summaries if mission.deliveryStatus == "planning")
    ready_count = sum(1 for mission in mission_summaries if mission.deliveryStatus == "ready")
    failed_count = sum(1 for mission in mission_summaries if mission.deliveryStatus == "failed")
    published_count = sum(1 for mission in mission_summaries if mission.deliveryStatus == "published")
    scheduled_count = sum(1 for mission in missions if mission.status in {"scheduled", "dispatched"})
    running_count = sum(1 for mission in missions if mission.status in {"running", "in_progress"})
    invoice_due_count = sum(1 for invoice in invoices if invoice.status == "invoice_due")
    overdue_count = sum(1 for invoice in invoices if invoice.status == "overdue")
    support_summary = _build_overview_support_summary(session, current_user, failed_count, overdue_count)
    latest_report_summary, latest_event_summary = latest_reporting_summaries(session, [mission.id for mission in missions])

    return OverviewDto(
        siteCount=len(sites),
        missionCount=len(mission_summaries),
        planningMissionCount=planning_count,
        scheduledMissionCount=scheduled_count,
        runningMissionCount=running_count,
        readyMissionCount=ready_count,
        failedMissionCount=failed_count,
        publishedMissionCount=published_count,
        invoiceDueCount=invoice_due_count,
        overdueInvoiceCount=overdue_count,
        pendingInviteCount=len(pending_invites),
        recentMissions=mission_summaries[:4],
        recentDeliveries=[
            mission
            for mission in sorted(
                (mission for mission in mission_summaries if mission.deliveryStatus == "published"),
                key=lambda item: item.publishedAt or item.createdAt,
                reverse=True,
            )[:3]
        ],
        recentInvoices=[_serialize_invoice(invoice) for invoice in invoices[:3]],
        pendingInvites=[
            _serialize_overview_invite(invite=invite, organization=organization)
            for invite, organization in pending_invites[:5]
        ],
        latestReportSummary=latest_report_summary,
        latestEventSummary=latest_event_summary,
        supportSummary=support_summary,
    )


@router.get("/v1/organizations", response_model=list[OrganizationSummaryDto])
def list_organizations(
    current_user: CurrentWebUser = Depends(require_internal_user),
    session: Session = Depends(get_session),
) -> list[OrganizationSummaryDto]:
    member_counts = (
        select(
            OrganizationMembership.organization_id.label("organization_id"),
            func.count(OrganizationMembership.id).label("member_count"),
        )
        .where(
            OrganizationMembership.organization_id.is_not(None),
            OrganizationMembership.is_active.is_(True),
        )
        .group_by(OrganizationMembership.organization_id)
        .subquery()
    )
    site_counts = (
        select(
            Site.organization_id.label("organization_id"),
            func.count(Site.id).label("site_count"),
        )
        .group_by(Site.organization_id)
        .subquery()
    )
    statement = (
        select(
            Organization,
            func.coalesce(member_counts.c.member_count, 0).label("member_count"),
            func.coalesce(site_counts.c.site_count, 0).label("site_count"),
        )
        .outerjoin(member_counts, member_counts.c.organization_id == Organization.id)
        .outerjoin(site_counts, site_counts.c.organization_id == Organization.id)
    )
    if "platform_admin" not in current_user.global_roles:
        statement = statement.where(Organization.is_active.is_(True))
    return [
        OrganizationSummaryDto(
            organizationId=organization.id,
            name=organization.name,
            slug=organization.slug,
            memberCount=member_count,
            siteCount=site_count,
        )
        for organization, member_count, site_count in session.exec(statement).all()
    ]


@router.post("/v1/organizations", response_model=OrganizationSummaryDto)
def create_organization(
    request: CreateOrganizationRequestDto,
    current_user: CurrentWebUser = Depends(require_internal_user),
    session: Session = Depends(get_session),
) -> OrganizationSummaryDto:
    if "platform_admin" not in current_user.global_roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden_role")
    slug = _slugify(request.slug or request.name)
    existing = session.exec(select(Organization).where(Organization.slug == slug)).first()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="organization_slug_exists")
    organization = Organization(name=request.name, slug=slug)
    session.add(organization)
    session.flush()
    record_audit(
        session,
        action="organization.created",
        organization_id=organization.id,
        actor_user_id=current_user.user.id,
        target_type="organization",
        target_id=organization.id,
    )
    session.commit()
    return OrganizationSummaryDto(organizationId=organization.id, name=organization.name, slug=organization.slug)


@router.get("/v1/organizations/{organization_id}", response_model=OrganizationDetailDto)
def get_organization(
    organization_id: str,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> OrganizationDetailDto:
    organization = session.get(Organization, organization_id)
    if organization is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="organization_not_found")
    ensure_org_read_access(session, current_user, organization_id, action="organization.detail.read_access")
    invites = list(
        session.exec(
            select(Invite).where(
                Invite.organization_id == organization_id,
                Invite.accepted_at.is_(None),
                Invite.revoked_at.is_(None),
            )
        ).all()
    )
    return OrganizationDetailDto(
        organizationId=organization.id,
        name=organization.name,
        slug=organization.slug,
        isActive=organization.is_active,
        members=_load_organization_members(session, organization_id),
        pendingInvites=[_serialize_invite(invite) for invite in invites],
    )


@router.patch("/v1/organizations/{organization_id}", response_model=OrganizationSummaryDto)
def update_organization(
    organization_id: str,
    request: UpdateOrganizationRequestDto,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> OrganizationSummaryDto:
    organization = session.get(Organization, organization_id)
    if organization is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="organization_not_found")
    ensure_org_write_access(session, current_user, organization_id, action="organization.update_access")
    if request.name is not None:
        organization.name = request.name
    if request.isActive is not None:
        if "platform_admin" not in current_user.global_roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden_role")
        organization.is_active = request.isActive
    organization.updated_at = datetime.now(timezone.utc)
    session.add(organization)
    record_audit(
        session,
        action="organization.updated",
        organization_id=organization.id,
        actor_user_id=current_user.user.id,
        target_type="organization",
        target_id=organization.id,
    )
    session.commit()
    return OrganizationSummaryDto(organizationId=organization.id, name=organization.name, slug=organization.slug)


@router.get("/v1/organizations/{organization_id}/members", response_model=list[OrganizationMemberDto])
def list_members(
    organization_id: str,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> list[OrganizationMemberDto]:
    ensure_org_read_access(session, current_user, organization_id, action="organization.members.read_access")
    return _load_organization_members(session, organization_id)


@router.patch("/v1/organizations/{organization_id}/members/{membership_id}", response_model=OrganizationMemberDto)
def update_membership(
    organization_id: str,
    membership_id: str,
    request: UpdateMembershipRequestDto,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> OrganizationMemberDto:
    membership = session.get(OrganizationMembership, membership_id)
    if membership is None or membership.organization_id != organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="membership_not_found")
    ensure_org_write_access(session, current_user, organization_id, action="organization.members.write_access")
    ensure_customer_invite_role(request.role)

    next_role = request.role
    next_is_active = request.isActive if request.isActive is not None else membership.is_active
    if membership.role == "customer_admin" and membership.is_active and (
        next_role != "customer_admin" or not next_is_active
    ):
        remaining_admin_count = session.exec(
            select(func.count(OrganizationMembership.id)).where(
                OrganizationMembership.organization_id == organization_id,
                OrganizationMembership.id != membership.id,
                OrganizationMembership.role == "customer_admin",
                OrganizationMembership.is_active.is_(True),
            )
        ).one()
        if remaining_admin_count == 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="organization_requires_customer_admin",
            )

    membership.role = next_role
    membership.is_active = next_is_active
    membership.updated_at = datetime.now(timezone.utc)
    session.add(membership)
    record_audit(
        session,
        action="membership.updated",
        organization_id=organization_id,
        actor_user_id=current_user.user.id,
        target_type="membership",
        target_id=membership.id,
        metadata={"role": membership.role, "isActive": membership.is_active},
    )
    session.commit()
    member = _load_member_record(session, membership.id)
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="membership_not_found")
    return member


@router.post("/v1/organizations/{organization_id}/invites", response_model=InviteCreateResponseDto)
def create_invite(
    organization_id: str,
    request: CreateInviteRequestDto,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> InviteCreateResponseDto:
    _ensure_invite_write_access(current_user, organization_id, request.role)
    organization = session.get(Organization, organization_id)
    if organization is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="organization_not_found")
    invite, raw_token = _issue_invite(
        session,
        organization_id=organization_id,
        email=request.email,
        role=request.role,
        actor_user_id=current_user.user.id,
        audit_action="invite.created",
        metadata={"role": request.role, "email": request.email.lower()},
    )
    session.commit()
    return InviteCreateResponseDto(invite=_serialize_invite(invite), inviteToken=raw_token)


@router.post("/v1/invites/{invite_id}/resend", response_model=InviteCreateResponseDto)
def resend_invite(
    invite_id: str,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> InviteCreateResponseDto:
    invite = session.get(Invite, invite_id)
    if invite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="invite_not_found")
    if invite.accepted_at is not None or invite.revoked_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="invite_not_resendable")

    _ensure_invite_write_access(current_user, invite.organization_id, invite.role)

    invite.revoked_at = datetime.now(timezone.utc)
    session.add(invite)
    replacement_invite, raw_token = _issue_invite(
        session,
        organization_id=invite.organization_id,
        email=invite.email,
        role=invite.role,
        actor_user_id=current_user.user.id,
        audit_action="invite.resent",
        metadata={
            "email": invite.email,
            "role": invite.role,
            "replacedInviteId": invite.id,
        },
    )
    session.commit()
    return InviteCreateResponseDto(invite=_serialize_invite(replacement_invite), inviteToken=raw_token)


@router.post("/v1/invites/accept", response_model=WebSessionDto)
def accept_invite(
    request: AcceptInviteRequestDto,
    http_request: Request,
    response: Response,
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
    rate_limiter: RateLimiter = Depends(get_rate_limiter),
) -> WebSessionDto:
    _check_rate_limit(
        rate_limiter,
        http_request,
        scope="invite_accept",
        subject=hash_invite_token(request.inviteToken),
        rule=RateLimitRule(
            max_attempts=settings.invite_accept_rate_limit_attempts,
            window_seconds=settings.invite_accept_rate_limit_window_seconds,
        ),
    )
    token_hash = hash_invite_token(request.inviteToken)
    invite = session.exec(select(Invite).where(Invite.token_hash == token_hash)).first()
    if invite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="invite_not_found")
    if invite.revoked_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="invite_revoked")
    if invite.accepted_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="invite_used")
    if _as_utc(invite.expires_at) <= datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="invite_expired")

    user = session.exec(select(UserAccount).where(UserAccount.email == invite.email)).first()
    if user is None:
        user = UserAccount(
            email=invite.email,
            display_name=request.displayName or invite.email.split("@")[0],
            password_hash=hash_password(request.password),
        )
        session.add(user)
        session.flush()
    else:
        user.display_name = request.displayName or user.display_name
        user.password_hash = hash_password(request.password)
        user.updated_at = datetime.now(timezone.utc)
        session.add(user)

    existing_membership = session.exec(
        select(OrganizationMembership).where(
            OrganizationMembership.user_id == user.id,
            OrganizationMembership.organization_id == invite.organization_id,
        )
    ).first()
    if existing_membership is None:
        session.add(
            OrganizationMembership(
                user_id=user.id,
                organization_id=invite.organization_id,
                role=invite.role,
            )
        )
    else:
        existing_membership.role = invite.role
        existing_membership.is_active = True
        existing_membership.updated_at = datetime.now(timezone.utc)
        session.add(existing_membership)
    invite.accepted_at = datetime.now(timezone.utc)
    session.add(invite)
    record_audit(
        session,
        action="invite.accepted",
        organization_id=invite.organization_id,
        actor_user_id=user.id,
        target_type="invite",
        target_id=invite.id,
    )
    session_dto = _issue_web_session(session, settings, user, response)
    session.commit()
    return session_dto


@router.post("/v1/invites/{invite_id}/revoke", response_model=InviteDto)
def revoke_invite(
    invite_id: str,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> InviteDto:
    invite = session.get(Invite, invite_id)
    if invite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="invite_not_found")
    _ensure_invite_write_access(current_user, invite.organization_id, invite.role)
    invite.revoked_at = datetime.now(timezone.utc)
    session.add(invite)
    record_audit(
        session,
        action="invite.revoked",
        organization_id=invite.organization_id,
        actor_user_id=current_user.user.id,
        target_type="invite",
        target_id=invite.id,
    )
    session.commit()
    return _serialize_invite(invite)


@router.get("/v1/sites", response_model=list[SiteDto])
def list_sites(
    organizationId: str | None = None,
    search: str | None = None,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> list[SiteDto]:
    statement = apply_org_read_scope(select(Site), Site.organization_id, current_user)
    if organizationId is not None:
        statement = statement.where(Site.organization_id == organizationId)
    if search:
        pattern = f"%{search.lower()}%"
        statement = statement.where(
            or_(
                func.lower(Site.name).like(pattern),
                func.lower(Site.address).like(pattern),
            )
        )
    return [_serialize_site(session, site) for site in session.exec(statement).all()]


@router.post("/v1/sites", response_model=SiteDto)
def create_site(
    request: SiteRequestDto,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> SiteDto:
    ensure_org_write_access(session, current_user, request.organizationId, action="site.create_access")
    site_map = _build_site_map_payload(
        lat=request.location["lat"],
        lng=request.location["lng"],
        site_name=request.name,
        payload=request.siteMap.model_dump(mode="json") if request.siteMap is not None else None,
    )
    site = Site(
        organization_id=request.organizationId,
        name=request.name,
        external_ref=request.externalRef,
        address=request.address,
        lat=request.location["lat"],
        lng=request.location["lng"],
        map_config_json=site_map["mapConfig"],
        zones_json=site_map["zones"],
        launch_points_json=site_map["launchPoints"],
        viewpoints_json=site_map["viewpoints"],
        notes=request.notes,
        created_by_user_id=current_user.user.id,
        updated_by_user_id=current_user.user.id,
    )
    session.add(site)
    session.flush()
    record_audit(
        session,
        action="site.created",
        organization_id=site.organization_id,
        actor_user_id=current_user.user.id,
        target_type="site",
        target_id=site.id,
    )
    session.commit()
    return _serialize_site(session, site)


@router.get("/v1/sites/{site_id}", response_model=SiteDto)
def get_site(
    site_id: str,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> SiteDto:
    site = session.get(Site, site_id)
    if site is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="site_not_found")
    ensure_org_read_access(session, current_user, site.organization_id, action="site.read_access")
    return _serialize_site(session, site)


@router.patch("/v1/sites/{site_id}", response_model=SiteDto)
def patch_site(
    site_id: str,
    request: SitePatchRequestDto,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> SiteDto:
    site = session.get(Site, site_id)
    if site is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="site_not_found")
    ensure_org_write_access(session, current_user, site.organization_id, action="site.update_access")
    if request.name is not None:
        site.name = request.name
    if request.externalRef is not None:
        site.external_ref = request.externalRef
    if request.address is not None:
        site.address = request.address
    if request.location is not None:
        site.lat = request.location["lat"]
        site.lng = request.location["lng"]
    if request.siteMap is not None:
        site_map = _build_site_map_payload(
            lat=request.location["lat"] if request.location is not None else site.lat,
            lng=request.location["lng"] if request.location is not None else site.lng,
            site_name=request.name or site.name,
            payload=request.siteMap.model_dump(mode="json"),
        )
        site.map_config_json = site_map["mapConfig"]
        site.zones_json = site_map["zones"]
        site.launch_points_json = site_map["launchPoints"]
        site.viewpoints_json = site_map["viewpoints"]
    elif request.location is not None and not site.map_config_json:
        site_map = _build_site_map_payload(
            lat=site.lat,
            lng=site.lng,
            site_name=request.name or site.name,
        )
        site.map_config_json = site_map["mapConfig"]
        site.zones_json = site_map["zones"]
        site.launch_points_json = site_map["launchPoints"]
        site.viewpoints_json = site_map["viewpoints"]
    if request.notes is not None:
        site.notes = request.notes
    site.updated_by_user_id = current_user.user.id
    site.updated_at = datetime.now(timezone.utc)
    session.add(site)
    record_audit(
        session,
        action="site.updated",
        organization_id=site.organization_id,
        actor_user_id=current_user.user.id,
        target_type="site",
        target_id=site.id,
    )
    session.commit()
    return _serialize_site(session, site)


@router.get("/v1/billing/invoices", response_model=list[BillingInvoiceDto])
def list_invoices(
    organizationId: str | None = None,
    statusFilter: str | None = Query(default=None, alias="status"),
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> list[BillingInvoiceDto]:
    statement = apply_org_read_scope(select(BillingInvoice), BillingInvoice.organization_id, current_user)
    if organizationId is not None:
        statement = statement.where(BillingInvoice.organization_id == organizationId)
    if statusFilter is not None:
        statement = statement.where(BillingInvoice.status == statusFilter)
    return [_serialize_invoice(invoice) for invoice in session.exec(statement).all()]


@router.post("/v1/billing/invoices", response_model=BillingInvoiceDto)
def create_invoice(
    request: CreateInvoiceRequestDto,
    current_user: CurrentWebUser = Depends(require_internal_user),
    session: Session = Depends(get_session),
) -> BillingInvoiceDto:
    invoice = BillingInvoice(
        organization_id=request.organizationId,
        invoice_number=request.invoiceNumber,
        currency=request.currency.upper(),
        subtotal=request.subtotal,
        tax=request.tax,
        total=request.total,
        due_date=request.dueDate,
        payment_instructions=request.paymentInstructions,
        attachment_refs=request.attachmentRefs,
        notes=request.notes,
        created_by_user_id=current_user.user.id,
        updated_by_user_id=current_user.user.id,
    )
    session.add(invoice)
    session.flush()
    record_audit(
        session,
        action="invoice.created",
        organization_id=invoice.organization_id,
        actor_user_id=current_user.user.id,
        target_type="invoice",
        target_id=invoice.id,
    )
    session.commit()
    return _serialize_invoice(invoice)


@router.patch("/v1/billing/invoices/{invoice_id}", response_model=BillingInvoiceDto)
def update_invoice(
    invoice_id: str,
    request: UpdateInvoiceRequestDto,
    current_user: CurrentWebUser = Depends(require_internal_user),
    session: Session = Depends(get_session),
) -> BillingInvoiceDto:
    invoice = session.get(BillingInvoice, invoice_id)
    if invoice is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="invoice_not_found")
    if request.status is not None:
        invoice.status = request.status
    if request.paymentNote is not None:
        invoice.payment_note = request.paymentNote
    if request.receiptRef is not None:
        invoice.receipt_ref = request.receiptRef
    if request.voidReason is not None:
        invoice.void_reason = request.voidReason
    if request.attachmentRefs is not None:
        invoice.attachment_refs = request.attachmentRefs
    invoice.updated_by_user_id = current_user.user.id
    invoice.updated_at = datetime.now(timezone.utc)
    session.add(invoice)
    record_audit(
        session,
        action="invoice.updated",
        organization_id=invoice.organization_id,
        actor_user_id=current_user.user.id,
        target_type="invoice",
        target_id=invoice.id,
        metadata={"status": invoice.status},
    )
    session.commit()
    return _serialize_invoice(invoice)


@router.get("/v1/audit-log", response_model=list[AuditEventDto])
def get_audit_log(
    organizationId: str | None = None,
    action: str | None = None,
    current_user: CurrentWebUser = Depends(require_internal_user),
    session: Session = Depends(get_session),
) -> list[AuditEventDto]:
    from app.models import AuditEvent

    statement = apply_org_read_scope(select(AuditEvent), AuditEvent.organization_id, current_user)
    if organizationId is not None:
        statement = statement.where(AuditEvent.organization_id == organizationId)
    if action is not None:
        statement = statement.where(AuditEvent.action == action)
    statement = statement.order_by(AuditEvent.created_at.desc())
    return [
        AuditEventDto(
            auditEventId=event.id,
            organizationId=event.organization_id,
            actorUserId=event.actor_user_id,
            actorOperatorId=event.actor_operator_id,
            action=event.action,
            targetType=event.target_type,
            targetId=event.target_id,
            metadata=event.metadata_json,
            createdAt=event.created_at,
        )
        for event in session.exec(statement).all()
    ]


def _issue_web_session(session: Session, settings, user: UserAccount, response: Response) -> WebSessionDto:
    access_token = create_web_access_token(settings, user)
    refresh_token = create_web_refresh_token(session, settings, user)
    _set_refresh_cookie(response, refresh_token, secure=settings.environment.lower() not in {"development", "dev", "test"})
    return WebSessionDto(
        accessToken=access_token,
        expiresInSeconds=settings.access_token_ttl_minutes * 60,
        user=_serialize_user(
            CurrentWebUser(
                user=user,
                memberships=list(session.exec(select(OrganizationMembership).where(OrganizationMembership.user_id == user.id)).all()),
            )
        ),
    )


def _serialize_user(current_user: CurrentWebUser) -> WebSessionUserDto:
    return WebSessionUserDto(
        userId=current_user.user.id,
        email=current_user.user.email,
        displayName=current_user.user.display_name,
        globalRoles=sorted(current_user.global_roles),
        memberships=[
            MembershipDto(
                membershipId=membership.id,
                organizationId=membership.organization_id,
                role=membership.role,
                isActive=membership.is_active,
            )
            for membership in current_user.memberships
            if membership.organization_id is not None
        ],
    )


def _load_organization_members(session: Session, organization_id: str) -> list[OrganizationMemberDto]:
    rows = session.exec(
        select(OrganizationMembership, UserAccount)
        .join(UserAccount, UserAccount.id == OrganizationMembership.user_id)
        .where(OrganizationMembership.organization_id == organization_id)
        .order_by(
            OrganizationMembership.is_active.desc(),
            OrganizationMembership.role.asc(),
            UserAccount.display_name.asc(),
            UserAccount.email.asc(),
        )
    ).all()
    return [
        _serialize_organization_member(membership, user)
        for membership, user in rows
    ]


def _load_member_record(session: Session, membership_id: str) -> OrganizationMemberDto | None:
    row = session.exec(
        select(OrganizationMembership, UserAccount)
        .join(UserAccount, UserAccount.id == OrganizationMembership.user_id)
        .where(OrganizationMembership.id == membership_id)
    ).first()
    if row is None:
        return None
    membership, user = row
    return _serialize_organization_member(membership, user)


def _serialize_organization_member(membership: OrganizationMembership, user: UserAccount) -> OrganizationMemberDto:
    return OrganizationMemberDto(
        membershipId=membership.id,
        organizationId=membership.organization_id or "",
        userId=user.id,
        email=user.email,
        displayName=user.display_name,
        role=membership.role,
        isActive=membership.is_active,
    )


def _serialize_invite(invite: Invite) -> InviteDto:
    return InviteDto(
        inviteId=invite.id,
        organizationId=invite.organization_id,
        email=invite.email,
        role=invite.role,
        createdAt=invite.created_at,
        expiresAt=invite.expires_at,
        acceptedAt=invite.accepted_at,
        revokedAt=invite.revoked_at,
    )


def _ensure_invite_write_access(current_user: CurrentWebUser, organization_id: str, invite_role: str) -> None:
    if "platform_admin" in current_user.global_roles or "ops" in current_user.global_roles:
        if invite_role in {"platform_admin", "ops"} and "platform_admin" not in current_user.global_roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden_role")
        return
    if "customer_admin" in current_user.roles_for_org(organization_id):
        ensure_customer_invite_role(invite_role)
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden_role")


def _issue_invite(
    session: Session,
    *,
    organization_id: str,
    email: str,
    role: str,
    actor_user_id: str,
    audit_action: str,
    metadata: dict[str, str],
) -> tuple[Invite, str]:
    raw_token = create_invite_token()
    invite = Invite(
        organization_id=organization_id,
        email=email.lower(),
        role=role,
        token_hash=hash_invite_token(raw_token),
        invited_by_user_id=actor_user_id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    session.add(invite)
    session.flush()
    record_audit(
        session,
        action=audit_action,
        organization_id=organization_id,
        actor_user_id=actor_user_id,
        target_type="invite",
        target_id=invite.id,
        metadata=metadata,
    )
    return invite, raw_token


def _serialize_overview_invite(*, invite: Invite, organization: Organization | None) -> OverviewInviteDto:
    return OverviewInviteDto(
        inviteId=invite.id,
        organizationId=invite.organization_id,
        organizationName=organization.name if organization is not None else None,
        email=invite.email,
        role=invite.role,
        createdAt=invite.created_at,
        expiresAt=invite.expires_at,
    )


def _serialize_mission_summary(
    mission: Mission,
    artifacts: list[MissionArtifact],
    *,
    report=None,
    events: list | None = None,
) -> MissionSummaryDto:
    delivery_status, published_at, failure_reason = summarize_mission_delivery(mission, artifacts)
    return MissionSummaryDto(
        missionId=mission.id,
        organizationId=mission.organization_id,
        siteId=mission.site_id,
        missionName=mission.mission_name,
        status=mission.status,
        bundleVersion=mission.bundle_version,
        deliveryStatus=delivery_status,
        publishedAt=published_at,
        failureReason=failure_reason,
        reportStatus=report.status if report is not None else "not_started",
        reportGeneratedAt=report.generated_at if report is not None else None,
        eventCount=len(events or []),
        createdAt=mission.created_at,
    )


def _default_site_map(lat: float, lng: float, site_name: str) -> dict[str, object]:
    return {
        "mapConfig": {
            "baseMapType": "satellite",
            "center": {"lat": lat, "lng": lng},
            "zoom": 18,
            "version": 1,
        },
        "zones": [],
        "launchPoints": [],
        "viewpoints": [],
    }


def _build_site_map_payload(
    *,
    lat: float,
    lng: float,
    site_name: str,
    payload: dict | None = None,
) -> dict[str, object]:
    default_map = _default_site_map(lat, lng, site_name)
    payload = payload or {}
    map_config = payload.get("baseMapType")
    center = payload.get("center")
    zoom = payload.get("zoom")
    version = payload.get("version")
    zones = payload.get("zones")
    launch_points = payload.get("launchPoints")
    viewpoints = payload.get("viewpoints")
    return {
        "mapConfig": {
            "baseMapType": str(map_config or default_map["mapConfig"]["baseMapType"]),
            "center": center or {"lat": lat, "lng": lng},
            "zoom": int(zoom or default_map["mapConfig"]["zoom"]),
            "version": int(version or default_map["mapConfig"]["version"]),
        },
        "zones": zones or default_map["zones"],
        "launchPoints": launch_points or [],
        "viewpoints": viewpoints or [],
    }


def _is_site_zone_placeholder(zone: dict, *, lat: float, lng: float) -> bool:
    if zone.get("kind") != "inspection_boundary":
        return False

    polygon = zone.get("polygon")
    if not isinstance(polygon, list) or len(polygon) != 4:
        return False

    expected_polygon = [
        {"lat": lat - SITE_MAP_DEFAULT_OFFSET, "lng": lng - SITE_MAP_DEFAULT_OFFSET},
        {"lat": lat - SITE_MAP_DEFAULT_OFFSET, "lng": lng + SITE_MAP_DEFAULT_OFFSET},
        {"lat": lat + SITE_MAP_DEFAULT_OFFSET, "lng": lng + SITE_MAP_DEFAULT_OFFSET},
        {"lat": lat + SITE_MAP_DEFAULT_OFFSET, "lng": lng - SITE_MAP_DEFAULT_OFFSET},
    ]

    for current, expected in zip(polygon, expected_polygon):
        if not isinstance(current, dict):
            return False
        if abs(float(current.get("lat", 0.0)) - expected["lat"]) > 1e-9:
            return False
        if abs(float(current.get("lng", 0.0)) - expected["lng"]) > 1e-9:
            return False

    note = zone.get("note")
    return note in (None, "", DEFAULT_ZONE_NOTE)


def _filter_site_zones(zones: list[dict], *, lat: float, lng: float) -> list[dict]:
    return [zone for zone in zones if not _is_site_zone_placeholder(zone, lat=lat, lng=lng)]


def _serialize_site_map(site: Site) -> SiteMapDto:
    site_map = _build_site_map_payload(lat=site.lat, lng=site.lng, site_name=site.name)
    map_config = site.map_config_json or site_map["mapConfig"]
    zones = _filter_site_zones(site.zones_json or site_map["zones"], lat=site.lat, lng=site.lng)
    return SiteMapDto(
        baseMapType=map_config.get("baseMapType", "satellite"),
        center=map_config.get("center", {"lat": site.lat, "lng": site.lng}),
        zoom=int(map_config.get("zoom", 18)),
        version=int(map_config.get("version", 1)),
        zones=[SiteZoneDto.model_validate(zone) for zone in zones],
        launchPoints=[],
        viewpoints=[],
    )


def _serialize_site(session: Session, site: Site) -> SiteDto:
    routes = session.exec(
        select(InspectionRoute)
        .where(InspectionRoute.site_id == site.id)
        .order_by(InspectionRoute.updated_at.desc(), InspectionRoute.created_at.desc())
    ).all()
    templates = session.exec(
        select(InspectionTemplate)
        .where(InspectionTemplate.site_id == site.id)
        .order_by(InspectionTemplate.updated_at.desc(), InspectionTemplate.created_at.desc())
    ).all()
    return SiteDto(
        siteId=site.id,
        organizationId=site.organization_id,
        name=site.name,
        externalRef=site.external_ref,
        address=site.address,
        location={"lat": site.lat, "lng": site.lng},
        notes=site.notes,
        siteMap=_serialize_site_map(site),
        activeRouteCount=len(routes),
        activeTemplateCount=len(templates),
        activeRoutes=[serialize_route_summary(route) for route in routes[:4]],
        activeTemplates=[serialize_template_summary(template) for template in templates[:4]],
        createdAt=site.created_at,
        updatedAt=site.updated_at,
    )


def _serialize_invoice(invoice: BillingInvoice) -> BillingInvoiceDto:
    return BillingInvoiceDto(
        invoiceId=invoice.id,
        organizationId=invoice.organization_id,
        invoiceNumber=invoice.invoice_number,
        currency=invoice.currency,
        subtotal=invoice.subtotal,
        tax=invoice.tax,
        total=invoice.total,
        dueDate=invoice.due_date,
        status=invoice.status,
        paymentInstructions=invoice.payment_instructions,
        attachmentRefs=invoice.attachment_refs,
        notes=invoice.notes,
        paymentNote=invoice.payment_note,
        receiptRef=invoice.receipt_ref,
        voidReason=invoice.void_reason,
        createdAt=invoice.created_at,
        updatedAt=invoice.updated_at,
    )


def _build_overview_support_summary(
    session: Session,
    current_user: CurrentWebUser,
    failed_mission_count: int,
    overdue_invoice_count: int,
) -> OverviewSupportSummaryDto | None:
    if not current_user.global_roles.intersection({"platform_admin", "ops"}):
        return None

    flights = session.exec(
        apply_org_read_scope(
            select(Flight).where(Flight.organization_id.is_not(None)),
            Flight.organization_id,
            current_user,
        ).order_by(Flight.updated_at.desc())
    ).all()
    now = datetime.now(timezone.utc)
    battery_low_count = 0
    telemetry_stale_count = 0
    bridge_alert_count = 0

    for flight in flights:
        latest_batch = session.exec(
            select(TelemetryBatch)
            .where(TelemetryBatch.flight_id == flight.id)
            .order_by(TelemetryBatch.last_timestamp.desc())
        ).first()
        if latest_batch is not None and latest_batch.payload_json:
            latest_sample = latest_batch.payload_json[-1]
            battery_pct = int(latest_sample.get("batteryPct", 0))
            if battery_pct < LOW_BATTERY_THRESHOLD:
                battery_low_count += 1

        last_telemetry_at = _ensure_utc(flight.last_telemetry_at)
        if last_telemetry_at is not None and now - last_telemetry_at > timedelta(seconds=STALE_TELEMETRY_SECONDS):
            telemetry_stale_count += 1

        latest_bridge_alert = session.exec(
            select(FlightEvent)
            .where(FlightEvent.flight_id == flight.id, FlightEvent.event_type == BRIDGE_ALERT_EVENT)
            .order_by(FlightEvent.event_timestamp.desc())
        ).first()
        if latest_bridge_alert is None:
            continue
        event_timestamp = _ensure_utc(latest_bridge_alert.event_timestamp)
        if event_timestamp is not None and event_timestamp >= now - timedelta(minutes=BRIDGE_ALERT_LOOKBACK_MINUTES):
            bridge_alert_count += 1

    critical_count = failed_mission_count + telemetry_stale_count + bridge_alert_count
    warning_count = overdue_invoice_count + battery_low_count
    return OverviewSupportSummaryDto(
        openCount=critical_count + warning_count,
        criticalCount=critical_count,
        warningCount=warning_count,
    )


def _set_refresh_cookie(response: Response, token: str, *, secure: bool) -> None:
    response.set_cookie(
        key=WEB_REFRESH_COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="strict",
        secure=secure,
        max_age=7 * 24 * 60 * 60,
        path="/",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=WEB_REFRESH_COOKIE_NAME, path="/")


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    if not slug:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="invalid_slug")
    return slug


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _check_rate_limit(
    rate_limiter: RateLimiter,
    request: Request,
    *,
    scope: str,
    subject: str,
    rule: RateLimitRule,
) -> None:
    normalized_subject = subject.strip().lower() or "anonymous"
    bucket = f"{scope}:{client_identity(request)}:{normalized_subject}"
    rate_limiter.check(bucket, rule)


def _enforce_session_origin(request: Request, settings) -> None:
    expected_origin = (settings.app_origin or "").rstrip("/")
    if not expected_origin:
        return
    origin = (request.headers.get("origin") or "").rstrip("/")
    if origin:
        if origin != expected_origin:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="origin_not_allowed")
        return
    referer = request.headers.get("referer") or ""
    if referer == expected_origin or referer.startswith(f"{expected_origin}/"):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="origin_not_allowed")
