export type Role = 'platform_admin' | 'ops' | 'customer_admin' | 'customer_viewer'
export type CustomerRole = 'customer_admin' | 'customer_viewer'

export type InvoiceStatus = 'draft' | 'issued' | 'invoice_due' | 'paid' | 'overdue' | 'void'

export type SupportSeverity = 'info' | 'warning' | 'critical'
export type SupportCategory = 'mission_failed' | 'battery_low' | 'telemetry_stale' | 'bridge_alert'

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
  createdAt: string
  updatedAt: string
}

export interface MissionSummary {
  missionId: string
  organizationId: string | null
  siteId: string | null
  missionName: string
  status: string
  bundleVersion: string
  deliveryStatus: 'planning' | 'ready' | 'failed' | 'published'
  publishedAt: string | null
  failureReason: string | null
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
  bundleVersion: string
  request: Record<string, unknown>
  response: Record<string, unknown>
  delivery: MissionDelivery
  artifacts: MissionArtifactDownload[]
  createdAt: string
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
  expiresAt: string
}

export interface OverviewSupportSummary {
  openCount: number
  criticalCount: number
  warningCount: number
}

export interface Overview {
  siteCount: number
  missionCount: number
  planningMissionCount: number
  failedMissionCount: number
  publishedMissionCount: number
  overdueInvoiceCount: number
  pendingInviteCount: number
  recentMissions: MissionSummary[]
  recentDeliveries: MissionSummary[]
  recentInvoices: BillingInvoice[]
  pendingInvites: OverviewInvite[]
  supportSummary: OverviewSupportSummary | null
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
  siteId: string | null
  siteName: string | null
  lastEventAt: string | null
  lastTelemetryAt: string | null
  latestTelemetry: LiveTelemetrySample | null
  video: VideoChannelDescriptor
  controlLease: ControlLease
  alerts: string[]
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
  title: string
  summary: string
  recommendedNextStep: string
  createdAt: string
}

export interface InviteCreateResponse {
  invite: Invite
  inviteToken: string
}
