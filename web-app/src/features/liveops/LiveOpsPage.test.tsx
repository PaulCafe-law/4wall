import { screen } from '@testing-library/react'
import { vi } from 'vitest'

import { LiveOpsPage } from './LiveOpsPage'
import { createAuthValue, createSession, renderWithProviders } from '../../test/utils'

const apiMock = vi.hoisted(() => ({
  listLiveFlights: vi.fn(),
  getLiveFlight: vi.fn(),
  listControlIntents: vi.fn(),
  requestControlIntent: vi.fn(),
}))

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  return {
    ...actual,
    api: {
      ...actual.api,
      listLiveFlights: apiMock.listLiveFlights,
      getLiveFlight: apiMock.getLiveFlight,
      listControlIntents: apiMock.listControlIntents,
      requestControlIntent: apiMock.requestControlIntent,
    },
  }
})

describe('LiveOpsPage', () => {
  beforeEach(() => {
    apiMock.listLiveFlights.mockReset()
    apiMock.getLiveFlight.mockReset()
    apiMock.listControlIntents.mockReset()
    apiMock.requestControlIntent.mockReset()
  })

  it('renders monitor-only flight context and reporting guidance', async () => {
    apiMock.listLiveFlights.mockResolvedValue([
      {
        flightId: 'flight-001',
        organizationId: 'org-001',
        missionId: 'mission-001',
        missionName: 'Tower A Demo',
        siteId: 'site-001',
        siteName: 'Tower A',
        lastEventAt: '2026-04-16T10:00:00Z',
        lastTelemetryAt: '2026-04-16T09:57:30Z',
        latestTelemetry: {
          timestamp: '2026-04-16T09:57:30Z',
          lat: 25.03391,
          lng: 121.56452,
          altitudeM: 38.5,
          groundSpeedMps: 4.2,
          batteryPct: 71,
          flightState: 'TRANSIT',
          corridorDeviationM: 0.6,
        },
        telemetryFreshness: 'stale',
        telemetryAgeSeconds: 150,
        video: {
          available: true,
          streaming: true,
          viewerUrl: 'https://viewer.example.test/live',
          codec: 'h264',
          latencyMs: 900,
          lastFrameAt: '2026-04-16T09:57:00Z',
          status: 'stale',
          ageSeconds: 180,
        },
        controlLease: {
          holder: 'hq',
          mode: 'remote_control_requested',
          remoteControlEnabled: false,
          observerReady: true,
          heartbeatHealthy: true,
          expiresAt: '2026-04-16T10:05:00Z',
        },
        alerts: ['bridge_alert'],
        reportStatus: 'failed',
        reportGeneratedAt: '2026-04-16T10:02:00Z',
        eventCount: 0,
        reportSummary: 'Analysis pipeline could not derive inspection events from the mission imagery.',
      },
    ])
    apiMock.getLiveFlight.mockResolvedValue({
      flightId: 'flight-001',
      organizationId: 'org-001',
      missionId: 'mission-001',
      missionName: 'Tower A Demo',
      siteId: 'site-001',
      siteName: 'Tower A',
      lastEventAt: '2026-04-16T10:00:00Z',
      lastTelemetryAt: '2026-04-16T09:57:30Z',
      latestTelemetry: {
        timestamp: '2026-04-16T09:57:30Z',
        lat: 25.03391,
        lng: 121.56452,
        altitudeM: 38.5,
        groundSpeedMps: 4.2,
        batteryPct: 71,
        flightState: 'TRANSIT',
        corridorDeviationM: 0.6,
      },
      telemetryFreshness: 'stale',
      telemetryAgeSeconds: 150,
      video: {
        available: true,
        streaming: true,
        viewerUrl: 'https://viewer.example.test/live',
        codec: 'h264',
        latencyMs: 900,
        lastFrameAt: '2026-04-16T09:57:00Z',
        status: 'stale',
        ageSeconds: 180,
      },
      controlLease: {
        holder: 'hq',
        mode: 'remote_control_requested',
        remoteControlEnabled: false,
        observerReady: true,
        heartbeatHealthy: true,
        expiresAt: '2026-04-16T10:05:00Z',
      },
      alerts: ['bridge_alert'],
      reportStatus: 'failed',
      reportGeneratedAt: '2026-04-16T10:02:00Z',
      eventCount: 0,
      reportSummary: 'Analysis pipeline could not derive inspection events from the mission imagery.',
      recentEvents: [
        {
          eventId: 'evt-001',
          eventType: 'CONTROL_LEASE_UPDATED',
          eventTimestamp: '2026-04-16T10:00:00Z',
          payload: { holder: 'hq' },
        },
      ],
    })
    apiMock.listControlIntents.mockResolvedValue([
      {
        requestId: 'intent-001',
        flightId: 'flight-001',
        action: 'request_remote_control',
        status: 'requested',
        reason: 'HQ takeover drill',
        requestedByUserId: 'user-1',
        createdAt: '2026-04-16T10:01:00Z',
        acknowledgedAt: null,
        resolutionNote: null,
      },
    ])

    renderWithProviders(<LiveOpsPage />, {
      auth: createAuthValue({
        session: createSession({
          globalRoles: ['ops'],
          memberships: [{ membershipId: 'm-1', organizationId: 'org-001', role: 'customer_admin', isActive: true }],
        }),
      }),
    })

    expect(await screen.findByRole('heading', { name: '即時營運' })).toBeInTheDocument()
    expect(await screen.findAllByText('Tower A Demo')).not.toHaveLength(0)
    expect(await screen.findByText('監看模式已降級')).toBeInTheDocument()
    expect(await screen.findAllByText('遙測延遲')).not.toHaveLength(0)
    expect(await screen.findAllByText('影像延遲')).not.toHaveLength(0)
    expect(await screen.findByText('報表產生失敗')).toBeInTheDocument()
    expect(
      await screen.findAllByText('Analysis pipeline could not derive inspection events from the mission imagery.'),
    ).not.toHaveLength(0)
    expect(await screen.findByRole('button', { name: '申請遠端接管' })).toBeInTheDocument()
    expect(await screen.findByText('HQ takeover drill')).toBeInTheDocument()
    expect(await screen.findByText('CONTROL_LEASE_UPDATED')).toBeInTheDocument()
    expect(document.querySelector('a[href="/missions/mission-001"]')).toBeTruthy()
  })
})
