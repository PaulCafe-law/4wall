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

  it('renders execution summary, execution mode, and intent history', async () => {
    apiMock.listLiveFlights.mockResolvedValue([
      {
        flightId: 'flight-001',
        organizationId: 'org-001',
        missionId: 'mission-001',
        missionName: 'Tower A Demo',
        operatingProfile: 'outdoor_gps_patrol',
        siteId: 'site-001',
        siteName: 'Tower A',
        lastEventAt: '2026-04-14T10:00:00Z',
        lastTelemetryAt: '2026-04-14T10:00:00Z',
        latestTelemetry: {
          timestamp: '2026-04-14T10:00:00Z',
          lat: 25.03391,
          lng: 121.56452,
          altitudeM: 38.5,
          groundSpeedMps: 4.2,
          batteryPct: 71,
          flightState: 'TRANSIT',
          corridorDeviationM: 0.6,
        },
        executionSummary: {
          flightId: 'flight-001',
          lastEventType: 'MISSION_STARTED',
          lastEventAt: '2026-04-14T10:00:00Z',
          executionState: 'transit',
          uploadState: 'uploaded',
          waypointProgress: '2 / 3',
          plannedOperatingProfile: 'outdoor_gps_patrol',
          executedOperatingProfile: 'outdoor_gps_patrol',
          executionMode: 'manual_pilot',
          cameraStreamState: 'streaming',
          recordingState: 'recording',
          landingPhase: null,
          fallbackReason: null,
          statusNote: 'Mission started',
        },
        video: {
          available: true,
          streaming: true,
          viewerUrl: 'https://viewer.example.test/live',
          codec: 'h264',
          latencyMs: 900,
          lastFrameAt: '2026-04-14T10:00:00Z',
        },
        controlLease: {
          holder: 'hq',
          mode: 'remote_control_requested',
          remoteControlEnabled: false,
          observerReady: true,
          heartbeatHealthy: true,
          expiresAt: '2026-04-14T10:05:00Z',
        },
        alerts: ['bridge_alert'],
      },
    ])
    apiMock.getLiveFlight.mockResolvedValue({
      flightId: 'flight-001',
      organizationId: 'org-001',
      missionId: 'mission-001',
      missionName: 'Tower A Demo',
      operatingProfile: 'outdoor_gps_patrol',
      siteId: 'site-001',
      siteName: 'Tower A',
      lastEventAt: '2026-04-14T10:00:00Z',
      lastTelemetryAt: '2026-04-14T10:00:00Z',
      latestTelemetry: {
        timestamp: '2026-04-14T10:00:00Z',
        lat: 25.03391,
        lng: 121.56452,
        altitudeM: 38.5,
        groundSpeedMps: 4.2,
        batteryPct: 71,
        flightState: 'TRANSIT',
        corridorDeviationM: 0.6,
      },
      executionSummary: {
        flightId: 'flight-001',
        lastEventType: 'MISSION_STARTED',
        lastEventAt: '2026-04-14T10:00:00Z',
        executionState: 'transit',
        uploadState: 'uploaded',
        waypointProgress: '2 / 3',
        plannedOperatingProfile: 'outdoor_gps_patrol',
        executedOperatingProfile: 'outdoor_gps_patrol',
        executionMode: 'manual_pilot',
        cameraStreamState: 'streaming',
        recordingState: 'recording',
        landingPhase: 'confirmation_required',
        fallbackReason: null,
        statusNote: 'Mission started',
      },
      video: {
        available: true,
        streaming: true,
        viewerUrl: 'https://viewer.example.test/live',
        codec: 'h264',
        latencyMs: 900,
        lastFrameAt: '2026-04-14T10:00:00Z',
      },
      controlLease: {
        holder: 'hq',
        mode: 'remote_control_requested',
        remoteControlEnabled: false,
        observerReady: true,
        heartbeatHealthy: true,
        expiresAt: '2026-04-14T10:05:00Z',
      },
      alerts: ['bridge_alert'],
      recentEvents: [
        {
          eventId: 'evt-001',
          eventType: 'CONTROL_LEASE_UPDATED',
          eventTimestamp: '2026-04-14T10:00:00Z',
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
        createdAt: '2026-04-14T10:01:00Z',
        acknowledgedAt: null,
        resolutionNote: null,
      },
    ])

    renderWithProviders(<LiveOpsPage />, {
      auth: createAuthValue({
        session: createSession({
          globalRoles: ['ops'],
          memberships: [
            { membershipId: 'm-1', organizationId: 'org-001', role: 'customer_admin', isActive: true },
          ],
        }),
      }),
    })

    expect(await screen.findByText('飛行營運監看')).toBeInTheDocument()
    expect(await screen.findByText('Tower A Demo')).toBeInTheDocument()
    expect((await screen.findAllByText('手動飛行')).length).toBeGreaterThan(0)
    expect((await screen.findAllByText('串流中')).length).toBeGreaterThan(0)
    expect((await screen.findAllByText('錄影中')).length).toBeGreaterThan(0)
    expect(await screen.findByText('HQ takeover drill')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: '請求接管' })).toBeInTheDocument()
  })
})
