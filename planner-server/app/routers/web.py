from __future__ import annotations

from datetime import datetime, timedelta, timezone
import re

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
from app.models import (
    BillingInvoice,
    Invite,
    Organization,
    OrganizationMembership,
    Site,
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
    OrganizationDetailDto,
    OrganizationSummaryDto,
    SiteDto,
    SitePatchRequestDto,
    SiteRequestDto,
    UpdateInvoiceRequestDto,
    UpdateMembershipRequestDto,
    UpdateOrganizationRequestDto,
    WebSessionDto,
    WebLoginRequestDto,
    WebSessionUserDto,
)
from app.web_scope import (
    apply_org_read_scope,
    ensure_customer_invite_role,
    ensure_org_read_access,
    ensure_org_write_access,
)


router = APIRouter(tags=["web"])


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
    memberships = list(
        session.exec(select(OrganizationMembership).where(OrganizationMembership.organization_id == organization_id)).all()
    )
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
        members=[
            MembershipDto(
                membershipId=membership.id,
                organizationId=membership.organization_id,
                role=membership.role,
                isActive=membership.is_active,
            )
            for membership in memberships
        ],
        pendingInvites=[_serialize_invite(invite) for invite in invites],
    )


@router.patch("/v1/organizations/{organization_id}", response_model=OrganizationSummaryDto)
def update_organization(
    organization_id: str,
    request: UpdateOrganizationRequestDto,
    current_user: CurrentWebUser = Depends(require_internal_user),
    session: Session = Depends(get_session),
) -> OrganizationSummaryDto:
    if "platform_admin" not in current_user.global_roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden_role")
    organization = session.get(Organization, organization_id)
    if organization is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="organization_not_found")
    if request.name is not None:
        organization.name = request.name
    if request.isActive is not None:
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


@router.get("/v1/organizations/{organization_id}/members", response_model=list[MembershipDto])
def list_members(
    organization_id: str,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> list[MembershipDto]:
    ensure_org_read_access(session, current_user, organization_id, action="organization.members.read_access")
    memberships = list(
        session.exec(select(OrganizationMembership).where(OrganizationMembership.organization_id == organization_id)).all()
    )
    return [
        MembershipDto(
            membershipId=membership.id,
            organizationId=membership.organization_id,
            role=membership.role,
            isActive=membership.is_active,
        )
        for membership in memberships
    ]


@router.patch("/v1/organizations/{organization_id}/members/{membership_id}", response_model=MembershipDto)
def update_membership(
    organization_id: str,
    membership_id: str,
    request: UpdateMembershipRequestDto,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> MembershipDto:
    membership = session.get(OrganizationMembership, membership_id)
    if membership is None or membership.organization_id != organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="membership_not_found")
    if "platform_admin" in current_user.global_roles:
        pass
    elif "customer_admin" in current_user.roles_for_org(organization_id):
        ensure_customer_invite_role(request.role)
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden_role")
    membership.role = request.role
    if request.isActive is not None:
        membership.is_active = request.isActive
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
    return MembershipDto(
        membershipId=membership.id,
        organizationId=membership.organization_id,
        role=membership.role,
        isActive=membership.is_active,
    )


@router.post("/v1/organizations/{organization_id}/invites", response_model=InviteCreateResponseDto)
def create_invite(
    organization_id: str,
    request: CreateInviteRequestDto,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> InviteCreateResponseDto:
    if "platform_admin" in current_user.global_roles or "ops" in current_user.global_roles:
        if request.role in {"platform_admin", "ops"} and "platform_admin" not in current_user.global_roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden_role")
    elif "customer_admin" in current_user.roles_for_org(organization_id):
        ensure_customer_invite_role(request.role)
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden_role")

    organization = session.get(Organization, organization_id)
    if organization is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="organization_not_found")
    raw_token = create_invite_token()
    invite = Invite(
        organization_id=organization_id,
        email=request.email.lower(),
        role=request.role,
        token_hash=hash_invite_token(raw_token),
        invited_by_user_id=current_user.user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    session.add(invite)
    session.flush()
    record_audit(
        session,
        action="invite.created",
        organization_id=organization_id,
        actor_user_id=current_user.user.id,
        target_type="invite",
        target_id=invite.id,
        metadata={"role": invite.role, "email": invite.email},
    )
    session.commit()
    return InviteCreateResponseDto(invite=_serialize_invite(invite), inviteToken=raw_token)


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
    if "platform_admin" in current_user.global_roles or "ops" in current_user.global_roles:
        pass
    elif "customer_admin" in current_user.roles_for_org(invite.organization_id):
        ensure_customer_invite_role(invite.role)
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden_role")
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
    return [_serialize_site(site) for site in session.exec(statement).all()]


@router.post("/v1/sites", response_model=SiteDto)
def create_site(
    request: SiteRequestDto,
    current_user: CurrentWebUser = Depends(get_current_web_user),
    session: Session = Depends(get_session),
) -> SiteDto:
    ensure_org_write_access(session, current_user, request.organizationId, action="site.create_access")
    site = Site(
        organization_id=request.organizationId,
        name=request.name,
        external_ref=request.externalRef,
        address=request.address,
        lat=request.location["lat"],
        lng=request.location["lng"],
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
    return _serialize_site(site)


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
    return _serialize_site(site)


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
    return _serialize_site(site)


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


def _serialize_invite(invite: Invite) -> InviteDto:
    return InviteDto(
        inviteId=invite.id,
        organizationId=invite.organization_id,
        email=invite.email,
        role=invite.role,
        expiresAt=invite.expires_at,
        acceptedAt=invite.accepted_at,
        revokedAt=invite.revoked_at,
    )


def _serialize_site(site: Site) -> SiteDto:
    return SiteDto(
        siteId=site.id,
        organizationId=site.organization_id,
        name=site.name,
        externalRef=site.external_ref,
        address=site.address,
        location={"lat": site.lat, "lng": site.lng},
        notes=site.notes,
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
