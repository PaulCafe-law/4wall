import type {
  AuditEvent,
  BillingInvoice,
  ControlIntent,
  ControlIntentAction,
  FlightEventRecord,
  InviteCreateResponse,
  LiveFlightDetail,
  LiveFlightSummary,
  MissionDetail,
  MissionPlanResponse,
  MissionSummary,
  OrganizationDetail,
  OrganizationSummary,
  Site,
  SupportQueueItem,
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

export interface LoginPayload {
  email: string
  password: string
}

export interface InviteAcceptPayload {
  inviteToken: string
  password: string
  displayName?: string
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
}

export interface MissionPlanPayload {
  organizationId: string
  siteId: string
  missionName: string
  launchPoint: {
    launchPointId: string
    label: string
    location: {
      lat: number
      lng: number
    }
  }
  orderedWaypoints: Array<{
    waypointId: string
    sequence: number
    holdSeconds: number
    location: {
      lat: number
      lng: number
    }
  }>
  routingMode: string
  flightProfile: {
    defaultAltitudeM: number
    defaultSpeedMps: number
    maxApproachSpeedMps: number
  }
  operatingProfile: 'outdoor_gps_patrol' | 'indoor_no_gps'
  implicitReturnToLaunch: boolean
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

export interface ControlIntentPayload {
  action: ControlIntentAction
  reason?: string
}

export const api = {
  login: (payload: LoginPayload) =>
    apiFetch<WebSession>('/v1/web/session/login', {
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
  listSites: (token: string) => apiFetch<Site[]>('/v1/sites', { token }),
  getSite: (token: string, siteId: string) => apiFetch<Site>(`/v1/sites/${siteId}`, { token }),
  createSite: (token: string, payload: SitePayload) =>
    apiFetch<Site>('/v1/sites', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    }),
  listMissions: (token: string) => apiFetch<MissionSummary[]>('/v1/missions', { token }),
  getMission: (token: string, missionId: string) =>
    apiFetch<MissionDetail>(`/v1/missions/${missionId}`, { token }),
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
  createInvite: (token: string, organizationId: string, payload: InvitePayload) =>
    apiFetch<InviteCreateResponse>(`/v1/organizations/${organizationId}/invites`, {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
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
}

export function absoluteArtifactUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }
  return `${API_BASE_URL}${path}`
}
