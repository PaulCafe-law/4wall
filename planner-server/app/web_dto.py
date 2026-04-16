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
InspectionReportStatusLiteral = Literal["not_started", "queued", "generating", "ready", "failed"]
InspectionEventStatusLiteral = Literal["open", "reviewed", "dismissed", "confirmed"]
InspectionWaypointKindLiteral = Literal["transit", "inspection_viewpoint", "hold"]
InspectionAlertRuleKindLiteral = Literal[
    "mission_failure",
    "telemetry_stale",
    "low_battery",
    "analysis_failure",
    "report_generation_failure",
]
InspectionScheduleStatusLiteral = Literal["scheduled", "paused", "cancelled", "completed"]
DispatchStatusLiteral = Literal["queued", "assigned", "sent", "accepted", "failed"]
AnalysisReprocessModeLiteral = Literal["normal", "no_findings", "analysis_failed"]


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


class EvidenceArtifactDto(BaseModel):
    artifactName: str
    downloadUrl: str
    contentType: str | None = None
    checksumSha256: str | None = None
    publishedAt: datetime | None = None


class InspectionWaypointDto(BaseModel):
    kind: InspectionWaypointKindLiteral
    lat: float
    lng: float
    altitudeM: float
    label: str | None = None
    headingDeg: float | None = None
    dwellSeconds: int | None = None


class InspectionAlertRuleDto(BaseModel):
    ruleId: str
    kind: InspectionAlertRuleKindLiteral
    enabled: bool = True
    threshold: float | None = None
    note: str | None = None


class InspectionWaypointInputDto(BaseModel):
    kind: InspectionWaypointKindLiteral
    lat: float
    lng: float
    altitudeM: float
    label: str | None = None
    headingDeg: float | None = None
    dwellSeconds: int | None = None


class InspectionAlertRuleInputDto(BaseModel):
    ruleId: str | None = None
    kind: InspectionAlertRuleKindLiteral
    enabled: bool = True
    threshold: float | None = None
    note: str | None = None


class CreateInspectionRouteRequestDto(BaseModel):
    organizationId: str
    siteId: str
    name: str = Field(min_length=1)
    description: str = ""
    waypoints: list[InspectionWaypointInputDto] = Field(min_length=1)
    planningParameters: dict[str, Any] = Field(default_factory=dict)


class UpdateInspectionRouteRequestDto(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    description: str | None = None
    waypoints: list[InspectionWaypointInputDto] | None = None
    planningParameters: dict[str, Any] | None = None


class InspectionRouteDto(BaseModel):
    routeId: str
    organizationId: str
    siteId: str
    name: str
    description: str = ""
    pointCount: int = 0
    waypoints: list[InspectionWaypointDto] = Field(default_factory=list)
    planningParameters: dict[str, Any] = Field(default_factory=dict)
    createdAt: datetime
    updatedAt: datetime


class InspectionTemplateDto(BaseModel):
    templateId: str
    organizationId: str
    siteId: str
    routeId: str | None = None
    name: str
    description: str = ""
    inspectionProfile: dict[str, Any] = Field(default_factory=dict)
    alertRules: list[InspectionAlertRuleDto] = Field(default_factory=list)
    createdAt: datetime
    updatedAt: datetime


class CreateInspectionTemplateRequestDto(BaseModel):
    organizationId: str
    siteId: str
    routeId: str | None = None
    name: str = Field(min_length=1)
    description: str = ""
    inspectionProfile: dict[str, Any] = Field(default_factory=dict)
    alertRules: list[InspectionAlertRuleInputDto] = Field(default_factory=list)


class UpdateInspectionTemplateRequestDto(BaseModel):
    routeId: str | None = None
    name: str | None = Field(default=None, min_length=1)
    description: str | None = None
    inspectionProfile: dict[str, Any] | None = None
    alertRules: list[InspectionAlertRuleInputDto] | None = None


class InspectionScheduleDto(BaseModel):
    scheduleId: str
    organizationId: str
    siteId: str
    routeId: str | None = None
    templateId: str | None = None
    plannedAt: datetime | None = None
    recurrence: str | None = None
    status: InspectionScheduleStatusLiteral = "scheduled"
    alertRules: list[InspectionAlertRuleDto] = Field(default_factory=list)
    createdAt: datetime
    updatedAt: datetime


class CreateInspectionScheduleRequestDto(BaseModel):
    organizationId: str
    siteId: str
    routeId: str | None = None
    templateId: str | None = None
    plannedAt: datetime | None = None
    recurrence: str | None = None
    status: InspectionScheduleStatusLiteral = "scheduled"
    alertRules: list[InspectionAlertRuleInputDto] = Field(default_factory=list)


class UpdateInspectionScheduleRequestDto(BaseModel):
    routeId: str | None = None
    templateId: str | None = None
    plannedAt: datetime | None = None
    recurrence: str | None = None
    status: InspectionScheduleStatusLiteral | None = None
    alertRules: list[InspectionAlertRuleInputDto] | None = None


class DispatchRecordDto(BaseModel):
    dispatchId: str
    missionId: str
    routeId: str | None = None
    templateId: str | None = None
    scheduleId: str | None = None
    dispatchedAt: datetime
    dispatchedByUserId: str | None = None
    assignee: str | None = None
    executionTarget: str | None = None
    status: DispatchStatusLiteral = "queued"
    note: str | None = None


class CreateDispatchRequestDto(BaseModel):
    routeId: str | None = None
    templateId: str | None = None
    scheduleId: str | None = None
    assignee: str | None = None
    executionTarget: str | None = None
    status: DispatchStatusLiteral = "queued"
    note: str | None = None


class ReprocessMissionAnalysisRequestDto(BaseModel):
    mode: AnalysisReprocessModeLiteral = "normal"
    note: str | None = Field(default=None, max_length=500)


class InspectionEventDto(BaseModel):
    eventId: str
    missionId: str
    siteId: str | None = None
    category: str
    severity: SupportSeverityLiteral
    summary: str
    detectedAt: datetime
    status: InspectionEventStatusLiteral = "open"
    evidenceArtifacts: list[EvidenceArtifactDto] = Field(default_factory=list)


class InspectionReportSummaryDto(BaseModel):
    reportId: str
    missionId: str
    status: InspectionReportStatusLiteral = "not_started"
    generatedAt: datetime | None = None
    summary: str | None = None
    eventCount: int = 0
    downloadArtifact: EvidenceArtifactDto | None = None


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
    reportStatus: InspectionReportStatusLiteral = "not_started"
    reportGeneratedAt: datetime | None = None
    eventCount: int = 0
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
    reportStatus: InspectionReportStatusLiteral = "not_started"
    reportGeneratedAt: datetime | None = None
    eventCount: int = 0
    latestReport: InspectionReportSummaryDto | None = None
    events: list[InspectionEventDto] = Field(default_factory=list)
    route: InspectionRouteDto | None = None
    template: InspectionTemplateDto | None = None
    schedule: InspectionScheduleDto | None = None
    dispatch: DispatchRecordDto | None = None
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
    createdAt: datetime
    expiresAt: datetime


class OverviewSupportSummaryDto(BaseModel):
    openCount: int = 0
    criticalCount: int = 0
    warningCount: int = 0


class OverviewEventSummaryDto(BaseModel):
    eventId: str
    missionId: str
    category: str
    severity: SupportSeverityLiteral
    summary: str
    detectedAt: datetime


class OverviewDto(BaseModel):
    siteCount: int = 0
    missionCount: int = 0
    planningMissionCount: int = 0
    scheduledMissionCount: int = 0
    runningMissionCount: int = 0
    readyMissionCount: int = 0
    failedMissionCount: int = 0
    publishedMissionCount: int = 0
    invoiceDueCount: int = 0
    overdueInvoiceCount: int = 0
    pendingInviteCount: int = 0
    recentMissions: list[MissionSummaryDto] = Field(default_factory=list)
    recentDeliveries: list[MissionSummaryDto] = Field(default_factory=list)
    recentInvoices: list[BillingInvoiceDto] = Field(default_factory=list)
    pendingInvites: list[OverviewInviteDto] = Field(default_factory=list)
    latestReportSummary: InspectionReportSummaryDto | None = None
    latestEventSummary: OverviewEventSummaryDto | None = None
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
