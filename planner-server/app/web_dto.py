from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


RoleLiteral = Literal["platform_admin", "ops", "customer_admin", "customer_viewer"]
InvoiceStatusLiteral = Literal["draft", "issued", "invoice_due", "paid", "overdue", "void"]
SupportSeverityLiteral = Literal["info", "warning", "critical"]
ControlIntentActionLiteral = Literal[
    "request_remote_control",
    "release_remote_control",
    "pause_mission",
    "resume_mission",
    "hold",
    "return_to_home",
]
ControlIntentStatusLiteral = Literal["requested", "accepted", "rejected", "superseded"]
ControlModeLiteral = Literal["monitor_only", "remote_control_requested", "remote_control_active", "released"]


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
    operatingProfile: str
    launchPoint: dict[str, Any] | None = None
    waypointCount: int = 0
    implicitReturnToLaunch: bool = True
    createdAt: datetime


class ExecutionSummaryDto(BaseModel):
    flightId: str | None = None
    lastEventType: str | None = None
    lastEventAt: datetime | None = None
    executionState: str | None = None
    uploadState: str | None = None
    waypointProgress: str | None = None
    plannedOperatingProfile: str | None = None
    executedOperatingProfile: str | None = None
    executionMode: str | None = None
    cameraStreamState: str | None = None
    recordingState: str | None = None
    landingPhase: str | None = None
    fallbackReason: str | None = None
    statusNote: str | None = None


class MissionDetailDto(BaseModel):
    missionId: str
    organizationId: str | None = None
    siteId: str | None = None
    requestedByUserId: str | None = None
    missionName: str
    status: str
    routeMode: str
    bundleVersion: str
    operatingProfile: str
    launchPoint: dict[str, Any] | None = None
    waypointCount: int = 0
    implicitReturnToLaunch: bool = True
    executionSummary: ExecutionSummaryDto | None = None
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


class LiveTelemetrySampleDto(BaseModel):
    timestamp: datetime
    lat: float
    lng: float
    altitudeM: float
    groundSpeedMps: float
    batteryPct: int
    flightState: str
    corridorDeviationM: float


class VideoChannelDescriptorDto(BaseModel):
    available: bool = False
    streaming: bool = False
    viewerUrl: str | None = None
    codec: str | None = None
    latencyMs: int | None = None
    lastFrameAt: datetime | None = None


class ControlLeaseDto(BaseModel):
    holder: str = "released"
    mode: ControlModeLiteral = "monitor_only"
    remoteControlEnabled: bool = False
    observerReady: bool = False
    heartbeatHealthy: bool = False
    expiresAt: datetime | None = None


class LiveFlightSummaryDto(BaseModel):
    flightId: str
    organizationId: str
    missionId: str
    missionName: str
    operatingProfile: str
    siteId: str | None = None
    siteName: str | None = None
    lastEventAt: datetime | None = None
    lastTelemetryAt: datetime | None = None
    latestTelemetry: LiveTelemetrySampleDto | None = None
    executionSummary: ExecutionSummaryDto | None = None
    video: VideoChannelDescriptorDto = Field(default_factory=VideoChannelDescriptorDto)
    controlLease: ControlLeaseDto = Field(default_factory=ControlLeaseDto)
    alerts: list[str] = Field(default_factory=list)


class LiveFlightDetailDto(LiveFlightSummaryDto):
    recentEvents: list[FlightEventRecordDto] = Field(default_factory=list)


class ControlIntentRequestDto(BaseModel):
    action: ControlIntentActionLiteral
    reason: str | None = Field(default=None, max_length=500)


class ControlIntentDto(BaseModel):
    requestId: str
    flightId: str
    action: ControlIntentActionLiteral
    status: ControlIntentStatusLiteral
    reason: str | None = None
    requestedByUserId: str | None = None
    createdAt: datetime
    acknowledgedAt: datetime | None = None
    resolutionNote: str | None = None


class SupportQueueItemDto(BaseModel):
    itemId: str
    severity: SupportSeverityLiteral
    organizationId: str
    flightId: str | None = None
    missionId: str | None = None
    operatingProfile: str | None = None
    title: str
    summary: str
    createdAt: datetime
