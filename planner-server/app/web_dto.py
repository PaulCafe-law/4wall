from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


RoleLiteral = Literal["platform_admin", "ops", "customer_admin", "customer_viewer"]
InvoiceStatusLiteral = Literal["draft", "issued", "invoice_due", "paid", "overdue", "void"]


class MembershipDto(BaseModel):
    membershipId: str
    organizationId: str | None = None
    role: RoleLiteral
    isActive: bool


class OrganizationSummaryDto(BaseModel):
    organizationId: str
    name: str
    slug: str
    memberCount: int = 0
    siteCount: int = 0


class WebSessionUserDto(BaseModel):
    userId: str
    email: str
    displayName: str
    globalRoles: list[RoleLiteral] = Field(default_factory=list)
    memberships: list[MembershipDto] = Field(default_factory=list)


class WebSessionDto(BaseModel):
    accessToken: str
    tokenType: Literal["bearer"] = "bearer"
    expiresInSeconds: int = Field(gt=0)
    user: WebSessionUserDto


class WebLoginRequestDto(BaseModel):
    email: str = Field(min_length=3)
    password: str = Field(min_length=8)


class CreateOrganizationRequestDto(BaseModel):
    name: str = Field(min_length=1)
    slug: str | None = None


class UpdateOrganizationRequestDto(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    isActive: bool | None = None


class OrganizationDetailDto(BaseModel):
    organizationId: str
    name: str
    slug: str
    isActive: bool
    members: list[MembershipDto]
    pendingInvites: list["InviteDto"]


class CreateInviteRequestDto(BaseModel):
    email: str = Field(min_length=3)
    role: RoleLiteral
    displayName: str | None = None


class InviteDto(BaseModel):
    inviteId: str
    organizationId: str
    email: str
    role: RoleLiteral
    expiresAt: datetime
    acceptedAt: datetime | None = None
    revokedAt: datetime | None = None


class InviteCreateResponseDto(BaseModel):
    invite: InviteDto
    inviteToken: str


class AcceptInviteRequestDto(BaseModel):
    inviteToken: str = Field(min_length=1)
    password: str = Field(min_length=8)
    displayName: str | None = Field(default=None, min_length=1)


class UpdateMembershipRequestDto(BaseModel):
    role: RoleLiteral
    isActive: bool | None = None


class SiteRequestDto(BaseModel):
    organizationId: str
    name: str = Field(min_length=1)
    externalRef: str | None = None
    address: str = Field(min_length=1)
    location: dict[str, float]
    notes: str = ""


class SitePatchRequestDto(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    externalRef: str | None = None
    address: str | None = Field(default=None, min_length=1)
    location: dict[str, float] | None = None
    notes: str | None = None


class SiteDto(BaseModel):
    siteId: str
    organizationId: str
    name: str
    externalRef: str | None = None
    address: str
    location: dict[str, float]
    notes: str
    createdAt: datetime
    updatedAt: datetime


class MissionSummaryDto(BaseModel):
    missionId: str
    organizationId: str | None = None
    siteId: str | None = None
    missionName: str
    status: str
    bundleVersion: str
    createdAt: datetime


class MissionDetailDto(BaseModel):
    missionId: str
    organizationId: str | None = None
    siteId: str | None = None
    requestedByUserId: str | None = None
    missionName: str
    status: str
    bundleVersion: str
    request: dict[str, Any]
    response: dict[str, Any]
    createdAt: datetime


class BillingInvoiceDto(BaseModel):
    invoiceId: str
    organizationId: str
    invoiceNumber: str
    currency: str
    subtotal: int
    tax: int
    total: int
    dueDate: datetime
    status: InvoiceStatusLiteral
    paymentInstructions: str
    attachmentRefs: list[str]
    notes: str
    paymentNote: str
    receiptRef: str
    voidReason: str
    createdAt: datetime
    updatedAt: datetime


class CreateInvoiceRequestDto(BaseModel):
    organizationId: str
    invoiceNumber: str = Field(min_length=1)
    currency: str = Field(min_length=3, max_length=3)
    subtotal: int = Field(ge=0)
    tax: int = Field(ge=0)
    total: int = Field(ge=0)
    dueDate: datetime
    paymentInstructions: str = ""
    attachmentRefs: list[str] = Field(default_factory=list)
    notes: str = ""


class UpdateInvoiceRequestDto(BaseModel):
    status: InvoiceStatusLiteral | None = None
    paymentNote: str | None = None
    receiptRef: str | None = None
    voidReason: str | None = None
    attachmentRefs: list[str] | None = None


class AuditEventDto(BaseModel):
    auditEventId: str
    organizationId: str | None = None
    actorUserId: str | None = None
    actorOperatorId: str | None = None
    action: str
    targetType: str | None = None
    targetId: str | None = None
    metadata: dict[str, Any]
    createdAt: datetime


class FlightEventRecordDto(BaseModel):
    eventId: str
    eventType: str
    eventTimestamp: datetime
    payload: dict[str, Any]


class TelemetryBatchRecordDto(BaseModel):
    telemetryBatchId: str
    sampleCount: int
    firstTimestamp: datetime
    lastTimestamp: datetime
    payload: list[dict[str, Any]]
