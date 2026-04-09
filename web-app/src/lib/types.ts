export type Role = 'platform_admin' | 'ops' | 'customer_admin' | 'customer_viewer'

export type InvoiceStatus = 'draft' | 'issued' | 'invoice_due' | 'paid' | 'overdue' | 'void'

export interface Membership {
  membershipId: string
  organizationId: string | null
  role: Role
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
  expiresAt: string
  acceptedAt: string | null
  revokedAt: string | null
}

export interface OrganizationDetail {
  organizationId: string
  name: string
  slug: string
  isActive: boolean
  members: Membership[]
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
  createdAt: string
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

export interface InviteCreateResponse {
  invite: Invite
  inviteToken: string
}
