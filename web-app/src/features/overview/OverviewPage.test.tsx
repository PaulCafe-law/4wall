import { screen } from '@testing-library/react'
import { vi } from 'vitest'

import { OverviewPage } from './OverviewPage'
import { createAuthValue, createSession, renderWithProviders } from '../../test/utils'

const apiMock = vi.hoisted(() => ({
  listMissions: vi.fn(),
  listSites: vi.fn(),
  listLiveFlights: vi.fn(),
}))

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  return {
    ...actual,
    api: {
      ...actual.api,
      listMissions: apiMock.listMissions,
      listSites: apiMock.listSites,
      listLiveFlights: apiMock.listLiveFlights,
    },
  }
})

describe('OverviewPage', () => {
  beforeEach(() => {
    apiMock.listMissions.mockReset()
    apiMock.listSites.mockReset()
    apiMock.listLiveFlights.mockReset()
  })

  it('renders mission coverage, profile mix, and live ops snapshot', async () => {
    apiMock.listMissions.mockResolvedValue([
      {
        missionId: 'mission-001',
        organizationId: 'org-001',
        siteId: 'site-001',
        missionName: 'Tower A Patrol',
        status: 'ready',
        bundleVersion: '1.1.0',
        operatingProfile: 'outdoor_gps_patrol',
        launchPoint: { label: 'L1', location: { lat: 25.03391, lng: 121.56452 } },
        waypointCount: 3,
        implicitReturnToLaunch: true,
        createdAt: '2026-04-19T08:00:00Z',
      },
    ])
    apiMock.listSites.mockResolvedValue([
      {
        siteId: 'site-001',
        organizationId: 'org-001',
        name: 'Tower A',
        externalRef: null,
        address: 'Taipei',
        location: { lat: 25.03391, lng: 121.56452 },
        notes: '',
        createdAt: '2026-04-19T08:00:00Z',
        updatedAt: '2026-04-19T08:00:00Z',
      },
    ])
    apiMock.listLiveFlights.mockResolvedValue([
      {
        flightId: 'flight-001',
        organizationId: 'org-001',
        missionId: 'mission-001',
        missionName: 'Tower A Patrol',
        operatingProfile: 'outdoor_gps_patrol',
        siteId: 'site-001',
        siteName: 'Tower A',
        lastEventAt: '2026-04-19T08:05:00Z',
        lastTelemetryAt: '2026-04-19T08:05:00Z',
        latestTelemetry: null,
        executionSummary: {
          flightId: 'flight-001',
          lastEventType: 'LANDING',
          lastEventAt: '2026-04-19T08:05:00Z',
          executionState: 'landing',
          uploadState: 'uploaded',
          waypointProgress: '3 / 3',
          plannedOperatingProfile: 'outdoor_gps_patrol',
          executedOperatingProfile: 'outdoor_gps_patrol',
          executionMode: 'manual_pilot',
          cameraStreamState: 'streaming',
          recordingState: 'recording',
          landingPhase: 'rc_only_fallback',
          fallbackReason: 'Pilot takeover',
          statusNote: 'Fallback',
        },
        video: {
          available: false,
          streaming: false,
          viewerUrl: null,
          codec: null,
          latencyMs: null,
          lastFrameAt: null,
        },
        controlLease: {
          holder: 'released',
          mode: 'monitor_only',
          remoteControlEnabled: false,
          observerReady: false,
          heartbeatHealthy: true,
          expiresAt: null,
        },
        alerts: [],
      },
    ])

    renderWithProviders(<OverviewPage />, {
      auth: createAuthValue({
        session: createSession({
          globalRoles: ['platform_admin'],
        }),
      }),
    })

    expect(await screen.findByText('營運總覽')).toBeInTheDocument()
    expect((await screen.findAllByText('Tower A Patrol')).length).toBeGreaterThan(0)
    expect(await screen.findByText('執行 Profile')).toBeInTheDocument()
    expect((await screen.findAllByText(/戶外/)).length).toBeGreaterThan(0)
    expect(await screen.findByText('遙控器備援')).toBeInTheDocument()
    expect((await screen.findAllByText(/手動飛行/)).length).toBeGreaterThan(0)
  })
})
