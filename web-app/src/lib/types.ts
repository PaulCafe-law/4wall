export type Role = 'platform_admin' | 'ops' | 'customer_admin' | 'customer_viewer'
export type CustomerRole = 'customer_admin' | 'customer_viewer'

export type InvoiceStatus = 'draft' | 'issued' | 'invoice_due' | 'paid' | 'overdue' | 'void'

export type SupportSeverity = 'info' | 'warning' | 'critical'
export type SupportCategory =
  | 'mission_failed'
  | 'battery_low'
  | 'telemetry_stale'
  | 'bridge_alert'
  | 'report_generation_failed'
  | 'dispatch_blocked'
export type SupportWorkflowState = 'open' | 'claimed' | 'acknowledged' | 'resolved'
export type SupportQueueAction = 'claim' | 'acknowledge' | 'resolve' | 'release'
export type IncidentStatus = 'pending_review' | 'confirmed' | 'in_progress' | 'resolved' | 'false_positive'
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical'
export type IncidentSource = 'ai_detection' | 'manual' | 'pocket_lens' | 'camera' | 'drone' | 'vehicle'
export type IncidentEvidenceType = 'image' | 'video' | 'text' | 'link'
export type TelemetryFreshness = 'fresh' | 'stale' | 'missing'
export type VideoAvailability = 'live' | 'stale' | 'unavailable'
export type InspectionReportStatus = 'not_started' | 'queued' | 'generating' | 'ready' | 'failed'
export type InspectionEventStatus = 'open' | 'reviewed' | 'dismissed' | 'confirmed'
export type InspectionWaypointKind = 'transit' | 'hold'
export type InspectionAlertRuleKind =
  | 'mission_failure'
  | 'telemetry_stale'
  | 'low_battery'
  | 'analysis_failure'
  | 'report_generation_failure'
export type InspectionScheduleStatus = 'scheduled' | 'paused' | 'cancelled' | 'completed'
export type DispatchStatus = 'queued' | 'assigned' | 'sent' | 'accepted' | 'completed' | 'failed'
export type ExecutionPhase = 'draft' | 'scheduled' | 'dispatched' | 'running' | 'completed' | 'failed' | 'report_ready'
export type OperatingProfile = 'outdoor_gps_patrol' | 'indoor_no_gps'
export type ExecutionMode = 'patrol_route' | 'manual_pilot'

export type ControlIntentAction =
  | 'request_remote_control'
  | 'release_remote_control'
  | 'pause_mission'
  | 'resume_mission'
  | 'hold'
  | 'return_to_home'

export type ControlIntentStatus = 'requested' | 'accepted' | 'rejected' | 'superseded'

export type ControlMode =
  | 'monitor_only'
  | 'remote_control_requested'
  | 'remote_control_active'
  | 'released'

export interface Membership {
  membershipId: string
  organizationId: string | null
  role: Role
  isActive: boolean
}

export interface OrganizationMember {
  membershipId: string
  organizationId: string
  userId: string
  email: string
  displayName: string
  role: CustomerRole
  isActive: boolean
}

export interface SessionUser {
  userId: string
  email: string
  displayName: string
  globalRoles: Role[]
  memberships: Membership[]
}

export interface WebSession {
  accessToken: string
  tokenType: 'bearer'
  expiresInSeconds: number
  user: SessionUser
}

export interface OrganizationSummary {
  organizationId: string
  name: string
  slug: string
  memberCount: number
  siteCount: number
}

export interface Invite {
  inviteId: string
  organizationId: string
  email: string
  role: Role
  createdAt: string
  expiresAt: string
  acceptedAt: string | null
  revokedAt: string | null
}

export interface OrganizationDetail {
  organizationId: string
  name: string
  slug: string
  isActive: boolean
  members: OrganizationMember[]
  pendingInvites: Invite[]
}

export type SiteMapBaseMap = 'satellite' | 'roadmap' | 'hybrid'
export type SiteZoneKind = 'inspection_boundary' | 'priority_facade' | 'restricted_area' | 'staging_area'
export type LaunchPointKind = 'primary' | 'backup'
export type InspectionViewpointPurpose = 'overview' | 'facade' | 'detail'

export interface SiteZone {
  zoneId: string
  label: string
  kind: SiteZoneKind
  polygon: Array<{ lat: number; lng: number }>
  note: string | null
  isActive: boolean
}

export interface LaunchPoint {
  launchPointId: string
  label: string
  kind: LaunchPointKind
  lat: number
  lng: number
  headingDeg: number | null
  altitudeM: number | null
  isActive: boolean
}

export interface InspectionViewpoint {
  viewpointId: string
  label: string
  purpose: InspectionViewpointPurpose
  lat: number
  lng: number
  headingDeg: number | null
  altitudeM: number | null
  distanceToFacadeM: number | null
  isActive: boolean
}

export interface SiteMap {
  baseMapType: SiteMapBaseMap
  center: {
    lat: number
    lng: number
  }
  zoom: number
  version: number
  zones: SiteZone[]
  launchPoints: LaunchPoint[]
  viewpoints: InspectionViewpoint[]
}

export interface SiteRouteSummary {
  routeId: string
  name: string
  version: number
  pointCount: number
  estimatedDurationSec: number
  updatedAt: string
}

export interface SiteTemplateSummary {
  templateId: string
  routeId: string | null
  name: string
  evidencePolicy: string
  reportMode: string
  reviewMode: string
  updatedAt: string
}

export interface Site {
  siteId: string
  organizationId: string
  name: string
  externalRef: string | null
  address: string
  location: {
    lat: number
    lng: number
  }
  notes: string
  siteMap: SiteMap
  activeRouteCount: number
  activeTemplateCount: number
  activeRoutes: SiteRouteSummary[]
  activeTemplates: SiteTemplateSummary[]
  createdAt: string
  updatedAt: string
}

export interface SiteMapAssetManifest {
  assetKey: string
  label: string
  assetType: 'sog'
  assetUrl: string
  expiresAt: string
}

export interface LaunchPointSummary {
  launchPointId?: string
  label?: string
  location?: {
    lat: number
    lng: number
  }
  lat?: number
  lng?: number
}

export interface EvidenceArtifact {
  artifactName: string
  downloadUrl: string
  contentType: string | null
  checksumSha256: string | null
  publishedAt: string | null
}

export interface InspectionWaypoint {
  kind: InspectionWaypointKind
  lat: number
  lng: number
  altitudeM: number
  label: string | null
  headingDeg: number | null
  dwellSeconds: number | null
}

export interface InspectionAlertRule {
  ruleId: string
  kind: InspectionAlertRuleKind
  enabled: boolean
  threshold: number | null
  note: string | null
}

export interface InspectionRoute {
  routeId: string
  organizationId: string
  siteId: string
  name: string
  description: string
  version: number
  launchPoint: LaunchPoint | null
  implicitReturnToLaunch: boolean
  pointCount: number
  previewPolyline: Array<{ lat: number; lng: number }>
  estimatedDurationSec: number
  waypoints: InspectionWaypoint[]
  planningParameters: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface InspectionTemplate {
  templateId: string
  organizationId: string
  siteId: string
  routeId: string | null
  name: string
  description: string
  inspectionProfile: Record<string, unknown>
  alertRules: InspectionAlertRule[]
  evidencePolicy: string
  reportMode: string
  reviewMode: string
  createdAt: string
  updatedAt: string
}

export interface InspectionSchedule {
  scheduleId: string
  organizationId: string
  siteId: string
  routeId: string | null
  templateId: string | null
  plannedAt: string | null
  recurrence: string | null
  status: InspectionScheduleStatus
  alertRules: InspectionAlertRule[]
  nextRunAt: string | null
  lastRunAt: string | null
  lastDispatchedAt: string | null
  pauseReason: string | null
  lastOutcome: string | null
  createdAt: string
  updatedAt: string
}

export interface DispatchRecord {
  dispatchId: string
  missionId: string
  routeId: string | null
  templateId: string | null
  scheduleId: string | null
  dispatchedAt: string
  acceptedAt: string | null
  closedAt: string | null
  lastUpdatedAt: string
  dispatchedByUserId: string | null
  assignee: string | null
  executionTarget: string | null
  status: DispatchStatus
  note: string | null
}

export interface InspectionEvent {
  eventId: string
  missionId: string
  siteId: string | null
  category: string
  severity: SupportSeverity
  summary: string
  detectedAt: string
  status: InspectionEventStatus
  evidenceArtifacts: EvidenceArtifact[]
}

export interface InspectionReportSummary {
  reportId: string
  missionId: string
  status: InspectionReportStatus
  generatedAt: string | null
  summary: string | null
  eventCount: number
  downloadArtifact: EvidenceArtifact | null
}

export interface MissionSummary {
  missionId: string
  organizationId: string | null
  siteId: string | null
  missionName: string
  status: string
  bundleVersion: string
  operatingProfile: OperatingProfile
  launchPoint: LaunchPointSummary | null
  waypointCount: number
  implicitReturnToLaunch: boolean
  deliveryStatus: 'planning' | 'ready' | 'failed' | 'published'
  publishedAt: string | null
  failureReason: string | null
  reportStatus: InspectionReportStatus
  reportGeneratedAt: string | null
  eventCount: number
  createdAt: string
}

export interface MissionDelivery {
  state: 'planning' | 'ready' | 'failed' | 'published'
  publishedAt: string | null
  failureReason: string | null
}

export interface MissionArtifactDownload {
  artifactName: string
  downloadUrl: string
  version: number
  checksumSha256: string
  contentType: string
  sizeBytes: number
  cacheControl: string
  publishedAt: string
}

export interface MissionDetail {
  missionId: string
  organizationId: string | null
  siteId: string | null
  requestedByUserId: string | null
  missionName: string
  status: string
  routeMode: string
  bundleVersion: string
  operatingProfile: OperatingProfile
  launchPoint: LaunchPointSummary | null
  waypointCount: number
  implicitReturnToLaunch: boolean
  request: Record<string, unknown>
  response: Record<string, unknown>
  delivery: MissionDelivery
  artifacts: MissionArtifactDownload[]
  reportStatus: InspectionReportStatus
  reportGeneratedAt: string | null
  eventCount: number
  latestReport: InspectionReportSummary | null
  events: InspectionEvent[]
  route: InspectionRoute | null
  template: InspectionTemplate | null
  schedule: InspectionSchedule | null
  dispatch: DispatchRecord | null
  executionSummary: MissionExecutionSummary | null
  createdAt: string
}

export interface MissionExecutionSummary {
  missionId: string
  flightId: string | null
  lastEventType: string | null
  lastEventAt: string | null
  phase: ExecutionPhase
  executionState: string | null
  uploadState: string | null
  waypointProgress: string | null
  plannedOperatingProfile: OperatingProfile | null
  executedOperatingProfile: OperatingProfile | null
  executionMode: ExecutionMode | null
  cameraStreamState: string | null
  recordingState: string | null
  landingPhase: string | null
  fallbackReason: string | null
  statusNote: string | null
  telemetryFreshness: TelemetryFreshness
  lastTelemetryAt: string | null
  lastImageryAt: string | null
  reportStatus: InspectionReportStatus
  eventCount: number
  failureReason: string | null
}

export interface MissionPlanResponse {
  missionId: string
  organizationId: string | null
  siteId: string | null
  requestedByUserId: string | null
  status: string
  bundleVersion: string
  missionBundle: Record<string, unknown>
  artifacts: {
    missionKmz: ArtifactDescriptor
    missionMeta: ArtifactDescriptor
  }
}

export interface ArtifactDescriptor {
  downloadUrl: string
  version: number
  checksumSha256: string
  contentType: string
  sizeBytes: number
  cacheControl: string
}

export interface BillingInvoice {
  invoiceId: string
  organizationId: string
  invoiceNumber: string
  currency: string
  subtotal: number
  tax: number
  total: number
  dueDate: string
  status: InvoiceStatus
  paymentInstructions: string
  attachmentRefs: string[]
  notes: string
  paymentNote: string
  receiptRef: string
  voidReason: string
  createdAt: string
  updatedAt: string
}

export interface OverviewInvite {
  inviteId: string
  organizationId: string
  organizationName: string | null
  email: string
  role: Role
  createdAt: string
  expiresAt: string
}

export interface OverviewSupportSummary {
  openCount: number
  criticalCount: number
  warningCount: number
}

export interface OverviewEventSummary {
  eventId: string
  missionId: string
  category: string
  severity: SupportSeverity
  summary: string
  detectedAt: string
}

export interface Overview {
  siteCount: number
  missionCount: number
  planningMissionCount: number
  scheduledMissionCount: number
  runningMissionCount: number
  readyMissionCount: number
  failedMissionCount: number
  publishedMissionCount: number
  invoiceDueCount: number
  overdueInvoiceCount: number
  pendingInviteCount: number
  recentMissions: MissionSummary[]
  recentDeliveries: MissionSummary[]
  recentInvoices: BillingInvoice[]
  pendingInvites: OverviewInvite[]
  latestReportSummary: InspectionReportSummary | null
  latestEventSummary: OverviewEventSummary | null
  supportSummary: OverviewSupportSummary | null
}

export interface CameraFrame {
  frameId: string
  cameraId: string
  capturedAt: string
  storageKey: string
  contentType: string
  checksumSha256: string | null
  sizeBytes: number | null
  width: number | null
  height: number | null
  uploadStatus: string
  analysisStatus: string
  errorMessage: string | null
  uploadExpiresAt: string
  completedAt: string | null
}

export interface CameraGaugeReading {
  readingId: string
  cameraId: string
  frameId: string | null
  gaugeId: string
  label: string
  value: number | null
  unit: string
  confidence: number
  rawPosition: number | null
  status: string
  source: string
  capturedAt: string
  receivedAt: string
  metadata: Record<string, unknown>
}

export interface CameraOcrLine {
  text: string
  confidence: number
  box: number[][] | null
  region: string | null
}

export type CameraOcrMode = 'temperature_monitor' | 'machine_monitor' | 'unknown'
export type CameraOcrSummaryStatus = 'ok' | 'unknown' | 'failed' | 'auth_required'

export interface CameraOcrObservation {
  observationId: string
  cameraId: string
  frameId: string | null
  mode: CameraOcrMode
  modeConfidence: number
  source: string
  capturedAt: string
  receivedAt: string
  rawOcrLines: CameraOcrLine[]
  structuredFields: Record<string, unknown>
  workOrderRawText: string | null
  gptSummary: Record<string, unknown>
  summaryStatus: CameraOcrSummaryStatus
  summaryError: string | null
}

export interface CameraPersonFloorPosition {
  x: number
  z: number
}

export interface CameraPersonDetection {
  bbox: [number, number, number, number]
  confidence: number
  footPoint: [number, number]
  floorPosition: CameraPersonFloorPosition | null
}

export interface CameraPersonObservation {
  observationId: string
  cameraId: string
  frameId: string | null
  source: 'live'
  capturedAt: string
  receivedAt: string
  imageWidth: number
  imageHeight: number
  calibrationId: string | null
  detectorName: string | null
  personCount: number
  detections: CameraPersonDetection[]
}

export interface CameraDevice {
  cameraId: string
  organizationId: string
  siteId: string | null
  name: string
  status: string
  rtspConfigured: boolean
  samplingIntervalSeconds: number
  retentionDays: number
  localSpoolHours: number
  lastHeartbeatAt: string | null
  lastFrameAt: string | null
  lastError: string | null
  uploadedFrameCount: number
  queuedFrameCount: number
  failedFrameCount: number
  latestFrame: CameraFrame | null
  latestGaugeReadings: CameraGaugeReading[]
  latestOcrObservation: CameraOcrObservation | null
  latestPersonObservation: CameraPersonObservation | null
}

export interface CameraDeviceList {
  cameras: CameraDevice[]
}

export interface AlertCenterItem {
  alertId: string
  category: SupportCategory
  severity: SupportSeverity
  organizationId: string
  organizationName: string | null
  missionId: string | null
  missionName: string | null
  siteId: string | null
  siteName: string | null
  title: string
  summary: string
  recommendedNextStep: string
  status: SupportWorkflowState
  lastObservedAt: string | null
}

export interface ControlPlaneAlertSummary {
  openCount: number
  criticalCount: number
  warningCount: number
}

export interface ControlPlaneDashboard {
  siteCount: number
  activeRouteCount: number
  activeTemplateCount: number
  scheduledMissionCount: number
  dispatchPendingCount: number
  runningMissionCount: number
  failedMissionCount: number
  latestReportSummary: InspectionReportSummary | null
  latestEventSummary: OverviewEventSummary | null
  alertSummary: ControlPlaneAlertSummary
  recentAlerts: AlertCenterItem[]
  recentExecutionSummaries: MissionExecutionSummary[]
}

export interface AuditEvent {
  auditEventId: string
  organizationId: string | null
  actorUserId: string | null
  actorOperatorId: string | null
  action: string
  targetType: string | null
  targetId: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

export interface FlightEventRecord {
  eventId: string
  eventType: string
  eventTimestamp: string
  payload: Record<string, unknown>
}

export interface TelemetryBatchRecord {
  telemetryBatchId: string
  sampleCount: number
  firstTimestamp: string
  lastTimestamp: string
  payload: Array<Record<string, unknown>>
}

export interface LiveTelemetrySample {
  timestamp: string
  lat: number
  lng: number
  altitudeM: number
  groundSpeedMps: number
  batteryPct: number
  flightState: string
  corridorDeviationM: number
}

export interface VideoChannelDescriptor {
  available: boolean
  streaming: boolean
  viewerUrl: string | null
  codec: string | null
  latencyMs: number | null
  lastFrameAt: string | null
  status: VideoAvailability
  ageSeconds: number | null
}

export interface ControlLease {
  holder: string
  mode: ControlMode
  remoteControlEnabled: boolean
  observerReady: boolean
  heartbeatHealthy: boolean
  expiresAt: string | null
}

export interface LiveFlightSummary {
  flightId: string
  organizationId: string
  missionId: string
  missionName: string
  operatingProfile: OperatingProfile
  siteId: string | null
  siteName: string | null
  lastEventAt: string | null
  lastTelemetryAt: string | null
  lastImageryAt: string | null
  latestTelemetry: LiveTelemetrySample | null
  telemetryFreshness: TelemetryFreshness
  telemetryAgeSeconds: number | null
  video: VideoChannelDescriptor
  controlLease: ControlLease
  alerts: string[]
  reportStatus: InspectionReportStatus
  reportGeneratedAt: string | null
  eventCount: number
  reportSummary: string | null
  executionSummary: MissionExecutionSummary | null
}

export interface LiveFlightDetail extends LiveFlightSummary {
  recentEvents: FlightEventRecord[]
}

export interface ControlIntent {
  requestId: string
  flightId: string
  action: ControlIntentAction
  status: ControlIntentStatus
  reason: string | null
  requestedByUserId: string | null
  createdAt: string
  acknowledgedAt: string | null
  resolutionNote: string | null
}

export interface SupportQueueItem {
  itemId: string
  category: SupportCategory
  severity: SupportSeverity
  organizationId: string
  organizationName: string | null
  flightId: string | null
  missionId: string | null
  missionName: string | null
  siteName: string | null
  operatingProfile: OperatingProfile | null
  title: string
  summary: string
  recommendedNextStep: string
  createdAt: string
  lastObservedAt: string | null
  workflow: {
    state: SupportWorkflowState
    assignedToUserId: string | null
    assignedToDisplayName: string | null
    updatedAt: string | null
    note: string | null
  }
}

export interface InviteCreateResponse {
  invite: Invite
  inviteToken: string
}

export interface IncidentLocation {
  siteId: string | null
  siteName: string | null
  areaName: string | null
  floor: string | null
  equipmentId: string | null
  equipmentName: string | null
  description: string | null
  anchorId?: string | null
  floorplanX?: number | null
  floorplanY?: number | null
  ifcGuid?: string | null
  revitElementId?: string | null
  worldX: number | null
  worldY: number | null
  worldZ: number | null
  cameraId: string | null
  modelObjectId: string | null
}

export interface IncidentEvidence {
  evidenceId: string
  type: IncidentEvidenceType
  url: string | null
  text: string | null
  createdAt: string
}

export interface IncidentComment {
  commentId: string
  authorName: string
  content: string
  createdAt: string
}

export interface IncidentHistory {
  historyId: string
  action: string
  fromValue: string | null
  toValue: string | null
  actorName: string
  createdAt: string
}

export interface IncidentLineNotification {
  notificationId: string
  incidentId: string | null
  action: string
  targetId: string | null
  message: string
  status: string
  errorMessage: string | null
  createdAt: string
  sentAt: string | null
}

export interface Incident {
  incidentId: string
  organizationId: string
  siteId: string | null
  title: string
  description: string
  status: IncidentStatus
  severity: IncidentSeverity
  source: IncidentSource
  location: IncidentLocation
  evidence: IncidentEvidence[]
  comments: IncidentComment[]
  history: IncidentHistory[]
  lineNotifications: IncidentLineNotification[]
  assigneeName: string | null
  reporterName: string | null
  aiSummary: string | null
  aiConfidence: number | null
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
}

export interface IncidentDailySummary {
  date: string
  newIncidentCount: number
  statusCounts: Record<string, number>
  severityCounts: Record<string, number>
  criticalHighIncidents: Incident[]
  resolvedIncidents: Incident[]
  unhandledIncidents: Incident[]
  lineSummaryMessage: string
}

export type IndustrialEngineMode = 'text_to_world' | 'real_factory_photos_to_world'
export type IndustrialEngineJobStatus = 'queued' | 'running' | 'succeeded' | 'failed'

export interface IndustrialEngineStage {
  sequence: number
  name: string
  status: string
  reason: string | null
  output: Record<string, unknown>
  startedAt: string | null
  completedAt: string | null
}

export interface IndustrialEngineInputAsset {
  inputAssetId: string
  fileName: string
  contentType: string
  sizeBytes: number
  createdAt: string
}

export interface IndustrialEngineExport {
  artifactName: string
  downloadUrl: string
  contentType: string
  sizeBytes: number
}

export interface IndustrialEngineJob {
  jobId: string
  organizationId: string
  siteId: string | null
  status: IndustrialEngineJobStatus
  mode: IndustrialEngineMode
  currentStage: string | null
  failureReason: string | null
  request: Record<string, unknown>
  result: Record<string, unknown>
  stages: IndustrialEngineStage[]
  inputs: IndustrialEngineInputAsset[]
  exports: IndustrialEngineExport[]
  createdAt: string
  updatedAt: string
  startedAt: string | null
  completedAt: string | null
}

export interface TwinAgentToolCall {
  name: string
  arguments: Record<string, unknown>
}

export interface TwinAgentFeedEvent {
  seq: number
  kind: 'reply' | 'commands'
  jobId: string
  source: 'web' | 'line'
  text?: string
  toolCalls?: TwinAgentToolCall[]
}

export interface TwinAgentUpdates {
  workerOnline: boolean
  events: TwinAgentFeedEvent[]
  cursor: number
}

export interface TwinAgentSnapshotPayload {
  sessionId: string
  capturedAt: string
  world: Record<string, unknown>
}

export interface TwinAgentMessagePayload {
  sessionId: string
  text: string
}

export interface TwinAgentMessageResponse {
  jobId: string
}
