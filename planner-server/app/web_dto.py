from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


RoleLiteral = Literal["platform_admin", "ops", "customer_admin", "customer_viewer"]
InvoiceStatusLiteral = Literal["draft", "issued", "invoice_due", "paid", "overdue", "void"]
SupportSeverityLiteral = Literal["info", "warning", "critical"]
MissionDeliveryStateLiteral = Literal["planning", "ready", "failed", "published"]
SupportCategoryLiteral = Literal["mission_failed", "battery_low", "telemetry_stale", "bridge_alert"]
SupportWorkflowStateLiteral = Literal["open", "claimed", "acknowledged", "resolved"]
SupportQueueActionLiteral = Literal["claim", "acknowledge", "resolve", "release"]
TelemetryFreshnessLiteral = Literal["fresh", "stale", "missing"]
VideoAvailabilityLiteral = Literal["live", "stale", "unavailable"]
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


class OrganizationMemberDto(BaseModel):
    membershipId: str
    organizationId: str
    userId: str
    email: str
    displayName: str
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


class WebSignupRequestDto(BaseModel):
    email: str = Field(min_length=3)
    password: str = Field(min_length=8)
    displayName: str | None = Field(default=None, min_length=1)
    organizationName: str = Field(min_length=1)
    organizationSlug: str | None = Field(default=None, min_length=1)


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
    members: list[OrganizationMemberDto]
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
    createdAt: datetime
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
    deliveryStatus: MissionDeliveryStateLiteral
    publishedAt: datetime | None = None
    failureReason: str | None = None
    createdAt: datetime


class MissionArtifactDownloadDto(BaseModel):
    artifactName: str
    downloadUrl: str
    version: int
    checksumSha256: str
    contentType: str
    sizeBytes: int
    cacheControl: str
    publishedAt: datetime


class MissionDeliveryDto(BaseModel):
    state: MissionDeliveryStateLiteral
    publishedAt: datetime | None = None
    failureReason: str | None = None


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
    delivery: MissionDeliveryDto
    artifacts: list[MissionArtifactDownloadDto] = Field(default_factory=list)
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


class OverviewInviteDto(BaseModel):
    inviteId: str
    organizationId: str
    organizationName: str | None = None
    email: str
    role: RoleLiteral
    expiresAt: datetime


class OverviewSupportSummaryDto(BaseModel):
    openCount: int = 0
    criticalCount: int = 0
    warningCount: int = 0


class OverviewDto(BaseModel):
    siteCount: int = 0
    missionCount: int = 0
    planningMissionCount: int = 0
    failedMissionCount: int = 0
    publishedMissionCount: int = 0
    overdueInvoiceCount: int = 0
    pendingInviteCount: int = 0
    recentMissions: list[MissionSummaryDto] = Field(default_factory=list)
    recentDeliveries: list[MissionSummaryDto] = Field(default_factory=list)
    recentInvoices: list[BillingInvoiceDto] = Field(default_factory=list)
    pendingInvites: list[OverviewInviteDto] = Field(default_factory=list)
    supportSummary: OverviewSupportSummaryDto | None = None


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
    status: VideoAvailabilityLiteral = "unavailable"
    ageSeconds: int | None = None


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
    siteId: str | None = None
    siteName: str | None = None
    lastEventAt: datetime | None = None
    lastTelemetryAt: datetime | None = None
    latestTelemetry: LiveTelemetrySampleDto | None = None
    telemetryFreshness: TelemetryFreshnessLiteral = "missing"
    telemetryAgeSeconds: int | None = None
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


class SupportWorkflowDto(BaseModel):
    state: SupportWorkflowStateLiteral = "open"
    assignedToUserId: str | None = None
    assignedToDisplayName: str | None = None
    updatedAt: datetime | None = None
    note: str | None = None


class SupportQueueActionRequestDto(BaseModel):
    action: SupportQueueActionLiteral
    note: str | None = Field(default=None, max_length=500)


class SupportQueueItemDto(BaseModel):
    itemId: str
    category: SupportCategoryLiteral
    severity: SupportSeverityLiteral
    organizationId: str
    organizationName: str | None = None
    flightId: str | None = None
    missionId: str | None = None
    missionName: str | None = None
    siteName: str | None = None
    title: str
    summary: str
    recommendedNextStep: str
    createdAt: datetime
    lastObservedAt: datetime | None = None
    workflow: SupportWorkflowDto = Field(default_factory=SupportWorkflowDto)
