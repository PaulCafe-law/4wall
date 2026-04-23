import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'

import { MissionDetailPage } from './MissionDetailPage'
import { createAuthValue, createSession, renderWithProviders } from '../../test/utils'

const apiMock = vi.hoisted(() => ({
  getMission: vi.fn(),
}))

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  return {
    ...actual,
    api: {
      ...actual.api,
      getMission: apiMock.getMission,
    },
  }
})

function buildMissionDetail() {
  return {
    missionId: 'mission-001',
    organizationId: 'org-001',
    siteId: 'site-001',
    requestedByUserId: 'user-001',
    missionName: 'Tower A Patrol',
    status: 'dispatched',
    bundleVersion: 'bundle-v3',
    routeMode: 'closed_loop_patrol',
    operatingProfile: 'outdoor_gps_patrol',
    launchPoint: {
      label: 'L1',
      location: { lat: 25.03391, lng: 121.56452 },
    },
    waypointCount: 3,
    implicitReturnToLaunch: true,
    request: { missionName: 'Tower A Patrol' },
    response: {
      missionId: 'mission-001',
      artifacts: {
        missionKmz: {
          artifactName: 'mission.kmz',
          downloadUrl: '/v1/missions/mission-001/artifacts/mission.kmz',
          checksumSha256: 'abc123',
          contentType: 'application/vnd.google-earth.kmz',
          publishedAt: '2026-04-14T10:15:00Z',
        },
        missionMeta: {
          artifactName: 'mission_meta.json',
          downloadUrl: '/v1/missions/mission-001/artifacts/mission_meta.json',
          checksumSha256: 'meta123',
          contentType: 'application/json',
          publishedAt: '2026-04-14T10:15:00Z',
        },
      },
    },
    delivery: { state: 'published', publishedAt: '2026-04-14T10:15:00Z', failureReason: null },
    artifacts: [],
    reportStatus: 'ready',
    reportGeneratedAt: '2026-04-14T10:20:00Z',
    eventCount: 2,
    latestReport: {
      reportId: 'report-001',
      missionId: 'mission-001',
      status: 'ready',
      generatedAt: '2026-04-14T10:20:00Z',
      summary: '2 inspection events were generated for Tower A Patrol.',
      eventCount: 2,
      downloadArtifact: {
        artifactName: 'inspection_report.html',
        downloadUrl: '/v1/missions/mission-001/artifacts/inspection_report.html',
        contentType: 'text/html',
        checksumSha256: 'report123',
        publishedAt: '2026-04-14T10:20:00Z',
      },
    },
    events: [
      {
        eventId: 'event-001',
        missionId: 'mission-001',
        siteId: 'site-001',
        category: 'material_discoloration',
        severity: 'warning',
        summary: 'Surface discoloration detected on the east facade.',
        detectedAt: '2026-04-14T10:18:00Z',
        status: 'open',
        evidenceArtifacts: [
          {
            artifactName: 'evidence-event-001.svg',
            downloadUrl: '/v1/missions/mission-001/artifacts/evidence-event-001.svg',
            contentType: 'image/svg+xml',
            checksumSha256: 'evidence123',
            publishedAt: '2026-04-14T10:18:00Z',
          },
        ],
      },
    ],
    route: null,
    template: null,
    schedule: null,
    dispatch: null,
    executionSummary: {
      missionId: 'mission-001',
      phase: 'running',
      telemetryFreshness: 'stale',
      flightId: 'flight-001',
      executionMode: 'patrol_route',
      uploadState: 'uploaded',
      executionState: 'transit',
      waypointProgress: 'Waypoint 2 / 3',
      plannedOperatingProfile: 'outdoor_gps_patrol',
      executedOperatingProfile: 'outdoor_gps_patrol',
      cameraStreamState: 'streaming',
      recordingState: 'recording',
      landingPhase: 'auto_landing',
      lastEventType: 'telemetry_update',
      statusNote: 'Nominal flight',
      lastTelemetryAt: '2026-04-17T08:43:00Z',
      lastImageryAt: '2026-04-17T08:44:00Z',
      reportStatus: 'ready',
      eventCount: 2,
      failureReason: null,
    },
    createdAt: '2026-04-14T10:00:00Z',
  }
}

describe('MissionDetailPage', () => {
  beforeEach(() => {
    apiMock.getMission.mockReset()
  })

  it('renders patrol route sections and keeps raw contract collapsed for internal users', async () => {
    apiMock.getMission.mockResolvedValue(buildMissionDetail())

    renderWithProviders(
      <Routes>
        <Route path="/missions/:missionId" element={<MissionDetailPage />} />
      </Routes>,
      {
        route: '/missions/mission-001',
        auth: createAuthValue({
          session: createSession({ globalRoles: ['platform_admin'] }),
        }),
      },
    )

    expect(await screen.findByText('Tower A Patrol')).toBeInTheDocument()
    expect(screen.getByText('Mission Detail')).toBeInTheDocument()
    expect(screen.getAllByText('Patrol Route').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { level: 2, name: 'Android Runtime' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2, name: 'Mission Bundle' }).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Outdoor Patrol').length).toBeGreaterThan(0)
    expect(screen.getAllByText('L1 / 25.03391, 121.56452').length).toBeGreaterThan(0)
    expect(screen.getByText('Waypoint 2 / 3')).toBeInTheDocument()
    expect(screen.getAllByText('DJI waypoint mission artifact').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Patrol route metadata and landing policy').length).toBeGreaterThan(0)
    expect(screen.getByText('Raw Contract Debug')).toBeInTheDocument()
    expect(screen.getByText(/"missionName"\s*:\s*"Tower A Patrol"/s)).not.toBeVisible()

    await userEvent.click(screen.getByText('Raw Contract Debug'))

    expect(screen.getByText(/"missionName"\s*:\s*"Tower A Patrol"/s)).toBeVisible()
    expect(screen.getByText(/"missionId"\s*:\s*"mission-001"/s)).toBeVisible()
  })

  it('hides raw contract debug surfaces from customer roles', async () => {
    apiMock.getMission.mockResolvedValue({
      ...buildMissionDetail(),
      latestReport: null,
      artifacts: [],
      events: [],
      executionSummary: null,
      eventCount: 0,
      reportStatus: 'not_started',
      reportGeneratedAt: null,
    })

    renderWithProviders(
      <Routes>
        <Route path="/missions/:missionId" element={<MissionDetailPage />} />
      </Routes>,
      {
        route: '/missions/mission-001',
        auth: createAuthValue({
          session: createSession({
            memberships: [
              {
                membershipId: 'membership-001',
                organizationId: 'org-001',
                role: 'customer_admin',
                isActive: true,
              },
            ],
          }),
        }),
      },
    )

    expect(await screen.findByText('Tower A Patrol')).toBeInTheDocument()
    expect(screen.queryByText('Raw Contract Debug')).not.toBeInTheDocument()
    expect(screen.queryByText(/"missionName"\s*:\s*"Tower A Patrol"/s)).not.toBeInTheDocument()
  })
})
