import type {
  AuditEvent,
  BillingInvoice,
  ControlIntent,
  ControlIntentAction,
  DispatchRecord,
  FlightEventRecord,
  InspectionAlertRule,
  InspectionEvent,
  InspectionReportSummary,
  InspectionRoute,
  InspectionSchedule,
  InspectionTemplate,
  InspectionWaypoint,
  Invite,
  InviteCreateResponse,
  LiveFlightDetail,
  LiveFlightSummary,
  MissionDetail,
  MissionPlanResponse,
  MissionSummary,
  Overview,
  OrganizationDetail,
  OrganizationSummary,
  Site,
  SupportQueueItem,
  SupportQueueAction,
  TelemetryBatchRecord,
  WebSession,
} from './types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export class ApiError extends Error {
  status: number
  detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.status = status
    this.detail = detail
  }
}

type ApiOptions = RequestInit & {
  token?: string
}

async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`)
  }
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  })

  if (!response.ok) {
    let detail = response.statusText
    try {
      const payload = (await response.json()) as { detail?: string }
      detail = payload.detail ?? detail
    } catch {
      // fall back to the response status text
    }
    throw new ApiError(response.status, detail)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

async function artifactFetch(path: string, token: string): Promise<Response> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    credentials: 'include',
  })

  if (!response.ok) {
    let detail = response.statusText
    try {
      const payload = (await response.json()) as { detail?: string }
      detail = payload.detail ?? detail
    } catch {
      // fall back to the response status text
    }
    throw new ApiError(response.status, detail)
  }

  return response
}

export interface LoginPayload {
  email: string
  password: string
}

export interface InviteAcceptPayload {
  inviteToken: string
  password: string
  displayName?: string
}

export interface SignupPayload {
  email: string
  password: string
  displayName?: string
  organizationName: string
  organizationSlug?: string
}

export interface SitePayload {
  organizationId: string
  name: string
  externalRef?: string
  address: string
  location: {
    lat: number
    lng: number
  }
  notes?: string
  siteMap?: SiteMapPayload
}

export interface SiteZonePayload {
  zoneId?: string
  label: string
  kind: 'inspection_boundary' | 'priority_facade' | 'restricted_area' | 'staging_area'
  polygon: Array<{ lat: number; lng: number }>
  note?: string | null
  isActive?: boolean
}

export interface LaunchPointPayload {
  launchPointId?: string
  label: string
  kind: 'primary' | 'backup'
  lat: number
  lng: number
  headingDeg?: number | null
  altitudeM?: number | null
  isActive?: boolean
}

export interface InspectionViewpointPayload {
  viewpointId?: string
  label: string
  purpose: 'overview' | 'facade' | 'detail'
  lat: number
  lng: number
  headingDeg?: number | null
  altitudeM?: number | null
  distanceToFacadeM?: number | null
  isActive?: boolean
}

export interface SiteMapPayload {
  baseMapType: 'satellite' | 'roadmap' | 'hybrid'
  center: {
    lat: number
    lng: number
  }
  zoom: number
  version: number
  zones: SiteZonePayload[]
  launchPoints: LaunchPointPayload[]
  viewpoints: InspectionViewpointPayload[]
}

export interface SitePatchPayload {
  name?: string
  externalRef?: string
  address?: string
  location?: {
    lat: number
    lng: number
  }
  notes?: string
  siteMap?: SiteMapPayload
}

export interface MissionPlanPayload {
  organizationId: string
  siteId: string
  missionName: string
  origin: {
    lat: number
    lng: number
  }
  targetBuilding: {
    buildingId: string
    label: string
  }
  routingMode: string
  corridorPolicy: {
    defaultHalfWidthM: number
    maxHalfWidthM: number
    branchConfirmRadiusM: number
  }
  flightProfile: {
    defaultAltitudeM: number
    defaultSpeedMps: number
    maxApproachSpeedMps: number
  }
  inspectionIntent: {
    viewpoints: Array<{
      viewpointId: string
      label: string
      lat: number
      lng: number
      yawDeg: number
      distanceToFacadeM: number
    }>
  }
  demoMode: boolean
}

export interface InvoicePayload {
  organizationId: string
  invoiceNumber: string
  currency: string
  subtotal: number
  tax: number
  total: number
  dueDate: string
  paymentInstructions: string
  attachmentRefs: string[]
  notes: string
}

export interface InvitePayload {
  email: string
  role: 'customer_admin' | 'customer_viewer'
}

export interface OrganizationUpdatePayload {
  name?: string
  isActive?: boolean
}

export interface MembershipUpdatePayload {
  role: 'customer_admin' | 'customer_viewer'
  isActive?: boolean
}

export interface ControlIntentPayload {
  action: ControlIntentAction
  reason?: string
}

export interface SupportQueueActionPayload {
  action: SupportQueueAction
  note?: string
}

export interface InspectionRoutePayload {
  organizationId: string
  siteId: string
  name: string
  description?: string
  waypoints: InspectionWaypoint[]
  planningParameters?: Record<string, unknown>
}

export interface InspectionTemplatePayload {
  organizationId: string
  siteId: string
  routeId?: string
  name: string
  description?: string
  inspectionProfile?: Record<string, unknown>
  alertRules?: Array<Partial<InspectionAlertRule> & Pick<InspectionAlertRule, 'kind'>>
}

export interface InspectionSchedulePayload {
  organizationId: string
  siteId: string
  routeId?: string
  templateId?: string
  plannedAt?: string
  recurrence?: string
  status?: InspectionSchedule['status']
  alertRules?: Array<Partial<InspectionAlertRule> & Pick<InspectionAlertRule, 'kind'>>
}

export interface DispatchPayload {
  routeId?: string
  templateId?: string
  scheduleId?: string
  assignee?: string
  executionTarget?: string
  status?: DispatchRecord['status']
  note?: string
}

export interface ReprocessMissionAnalysisPayload {
  mode?: 'normal' | 'no_findings' | 'analysis_failed'
  note?: string
}

function buildQuery(params: Record<string, string | undefined>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value)
    }
  }
  const serialized = search.toString()
  return serialized ? `?${serialized}` : ''
}

export const api = {
  login: (payload: LoginPayload) =>
    apiFetch<WebSession>('/v1/web/session/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  signup: (payload: SignupPayload) =>
    apiFetch<WebSession>('/v1/web/session/signup', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  refreshSession: () =>
    apiFetch<WebSession>('/v1/web/session/refresh', {
      method: 'POST',
    }),
  logout: () =>
    apiFetch<void>('/v1/web/session/logout', {
      method: 'POST',
    }),
  acceptInvite: (payload: InviteAcceptPayload) =>
    apiFetch<WebSession>('/v1/invites/accept', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getOverview: (token: string) => apiFetch<Overview>('/v1/web/overview', { token }),
  listSites: (token: string) => apiFetch<Site[]>('/v1/sites', { token }),
  getSite: (token: string, siteId: string) => apiFetch<Site>(`/v1/sites/${siteId}`, { token }),
  createSite: (token: string, payload: SitePayload) =>
    apiFetch<Site>('/v1/sites', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    }),
  patchSite: (token: string, siteId: string, payload: SitePatchPayload) =>
    apiFetch<Site>(`/v1/sites/${siteId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    }),
  listMissions: (token: string) => apiFetch<MissionSummary[]>('/v1/missions', { token }),
  getMission: (token: string, missionId: string) =>
    apiFetch<MissionDetail>(`/v1/missions/${missionId}`, { token }),
  getMissionEvents: (token: string, missionId: string) =>
    apiFetch<InspectionEvent[]>(`/v1/missions/${missionId}/events`, { token }),
  getMissionReport: (token: string, missionId: string) =>
    apiFetch<InspectionReportSummary | null>(`/v1/missions/${missionId}/report`, { token }),
  reprocessMissionAnalysis: (token: string, missionId: string, payload: ReprocessMissionAnalysisPayload) =>
    apiFetch<InspectionReportSummary>(`/v1/missions/${missionId}/analysis/reprocess`, {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    }),
  planMission: (token: string, payload: MissionPlanPayload) =>
    apiFetch<MissionPlanResponse>('/v1/missions/plan', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    }),
  listInvoices: (token: string) => apiFetch<BillingInvoice[]>('/v1/billing/invoices', { token }),
  createInvoice: (token: string, payload: InvoicePayload) =>
    apiFetch<BillingInvoice>('/v1/billing/invoices', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    }),
  listOrganizations: (token: string) => apiFetch<OrganizationSummary[]>('/v1/organizations', { token }),
  getOrganization: (token: string, organizationId: string) =>
    apiFetch<OrganizationDetail>(`/v1/organizations/${organizationId}`, { token }),
  updateOrganization: (token: string, organizationId: string, payload: OrganizationUpdatePayload) =>
    apiFetch<OrganizationSummary>(`/v1/organizations/${organizationId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    }),
  updateMembership: (token: string, organizationId: string, membershipId: string, payload: MembershipUpdatePayload) =>
    apiFetch<OrganizationDetail['members'][number]>(
      `/v1/organizations/${organizationId}/members/${membershipId}`,
      {
        method: 'PATCH',
        token,
        body: JSON.stringify(payload),
      },
    ),
  createInvite: (token: string, organizationId: string, payload: InvitePayload) =>
    apiFetch<InviteCreateResponse>(`/v1/organizations/${organizationId}/invites`, {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    }),
  revokeInvite: (token: string, inviteId: string) =>
    apiFetch<Invite>(`/v1/invites/${inviteId}/revoke`, {
      method: 'POST',
      token,
    }),
  resendInvite: (token: string, inviteId: string) =>
    apiFetch<InviteCreateResponse>(`/v1/invites/${inviteId}/resend`, {
      method: 'POST',
      token,
    }),
  listAuditLog: (token: string, organizationId?: string) =>
    apiFetch<AuditEvent[]>(
      organizationId ? `/v1/audit-log?organizationId=${organizationId}` : '/v1/audit-log',
      { token },
    ),
  listFlightEvents: (token: string, flightId: string) =>
    apiFetch<FlightEventRecord[]>(`/v1/flights/${flightId}/events`, { token }),
  listTelemetry: (token: string, flightId: string) =>
    apiFetch<TelemetryBatchRecord[]>(`/v1/flights/${flightId}/telemetry`, { token }),
  listLiveFlights: (token: string) => apiFetch<LiveFlightSummary[]>('/v1/live-ops/flights', { token }),
  getLiveFlight: (token: string, flightId: string) =>
    apiFetch<LiveFlightDetail>(`/v1/live-ops/flights/${flightId}`, { token }),
  listControlIntents: (token: string, flightId: string) =>
    apiFetch<ControlIntent[]>(`/v1/live-ops/flights/${flightId}/control-intents`, { token }),
  requestControlIntent: (token: string, flightId: string, payload: ControlIntentPayload) =>
    apiFetch<ControlIntent>(`/v1/live-ops/flights/${flightId}/control-intents`, {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    }),
  listSupportQueue: (token: string) => apiFetch<SupportQueueItem[]>('/v1/support/queue', { token }),
  requestSupportQueueAction: (token: string, itemId: string, payload: SupportQueueActionPayload) =>
    apiFetch<SupportQueueItem['workflow']>(`/v1/support/queue/${itemId}/actions`, {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    }),
  listInspectionRoutes: (token: string, filters?: { organizationId?: string; siteId?: string }) =>
    apiFetch<InspectionRoute[]>(`/v1/inspection/routes${buildQuery(filters ?? {})}`, { token }),
  createInspectionRoute: (token: string, payload: InspectionRoutePayload) =>
    apiFetch<InspectionRoute>('/v1/inspection/routes', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    }),
  patchInspectionRoute: (token: string, routeId: string, payload: Partial<InspectionRoutePayload>) =>
    apiFetch<InspectionRoute>(`/v1/inspection/routes/${routeId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    }),
  listInspectionTemplates: (
    token: string,
    filters?: { organizationId?: string; siteId?: string; routeId?: string },
  ) => apiFetch<InspectionTemplate[]>(`/v1/inspection/templates${buildQuery(filters ?? {})}`, { token }),
  createInspectionTemplate: (token: string, payload: InspectionTemplatePayload) =>
    apiFetch<InspectionTemplate>('/v1/inspection/templates', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    }),
  patchInspectionTemplate: (token: string, templateId: string, payload: Partial<InspectionTemplatePayload>) =>
    apiFetch<InspectionTemplate>(`/v1/inspection/templates/${templateId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    }),
  listInspectionSchedules: (
    token: string,
    filters?: {
      organizationId?: string
      siteId?: string
      routeId?: string
      templateId?: string
      status?: string
    },
  ) => apiFetch<InspectionSchedule[]>(`/v1/inspection/schedules${buildQuery(filters ?? {})}`, { token }),
  createInspectionSchedule: (token: string, payload: InspectionSchedulePayload) =>
    apiFetch<InspectionSchedule>('/v1/inspection/schedules', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    }),
  patchInspectionSchedule: (token: string, scheduleId: string, payload: Partial<InspectionSchedulePayload>) =>
    apiFetch<InspectionSchedule>(`/v1/inspection/schedules/${scheduleId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    }),
  dispatchMission: (token: string, missionId: string, payload: DispatchPayload) =>
    apiFetch<DispatchRecord>(`/v1/missions/${missionId}/dispatch`, {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    }),
  fetchArtifactBlob: async (token: string, path: string) => {
    const response = await artifactFetch(path, token)
    return response.blob()
  },
}

export function absoluteArtifactUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }
  return `${API_BASE_URL}${path}`
}
