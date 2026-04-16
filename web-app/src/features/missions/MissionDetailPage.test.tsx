import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'

import { MissionDetailPage } from './MissionDetailPage'
import { createAuthValue, renderWithProviders } from '../../test/utils'

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

describe('MissionDetailPage', () => {
  beforeEach(() => {
    apiMock.getMission.mockReset()
  })

  it('renders published delivery, report summary, and evidence artifacts', async () => {
    apiMock.getMission.mockResolvedValue({
      missionId: 'mission-001',
      organizationId: 'org-001',
      siteId: 'site-001',
      requestedByUserId: 'user-001',
      missionName: 'Tower A Delivery',
      status: 'ready',
      bundleVersion: 'bundle-v3',
      request: { missionName: 'Tower A Delivery' },
      response: { missionId: 'mission-001' },
      delivery: {
        state: 'published',
        publishedAt: '2026-04-14T10:15:00Z',
        failureReason: null,
      },
      artifacts: [
        {
          artifactName: 'mission.kmz',
          downloadUrl: '/v1/missions/mission-001/artifacts/mission.kmz',
          version: 3,
          checksumSha256: 'abc123',
          contentType: 'application/vnd.google-earth.kmz',
          sizeBytes: 1024,
          cacheControl: 'private, max-age=60',
          publishedAt: '2026-04-14T10:15:00Z',
        },
        {
          artifactName: 'mission_meta.json',
          downloadUrl: '/v1/missions/mission-001/artifacts/mission_meta.json',
          version: 3,
          checksumSha256: 'def456',
          contentType: 'application/json',
          sizeBytes: 2048,
          cacheControl: 'private, max-age=60',
          publishedAt: '2026-04-14T10:15:00Z',
        },
        {
          artifactName: 'inspection_report.html',
          downloadUrl: '/v1/missions/mission-001/artifacts/inspection_report.html',
          version: 1,
          checksumSha256: 'report123',
          contentType: 'text/html',
          sizeBytes: 4096,
          cacheControl: 'private, max-age=60',
          publishedAt: '2026-04-14T10:20:00Z',
        },
      ],
      reportStatus: 'ready',
      reportGeneratedAt: '2026-04-14T10:20:00Z',
      eventCount: 2,
      latestReport: {
        reportId: 'report-001',
        missionId: 'mission-001',
        status: 'ready',
        generatedAt: '2026-04-14T10:20:00Z',
        summary: '2 inspection events were generated for Tower A Delivery.',
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
      createdAt: '2026-04-14T10:00:00Z',
    })

    renderWithProviders(
      <Routes>
        <Route path="/missions/:missionId" element={<MissionDetailPage />} />
      </Routes>,
      {
        route: '/missions/mission-001',
        auth: createAuthValue(),
      },
    )

    expect(await screen.findByText('Tower A Delivery')).toBeInTheDocument()
    expect(screen.getByText('Inspection analysis and report')).toBeInTheDocument()
    expect(screen.getByText('2 inspection events were generated for Tower A Delivery.')).toBeInTheDocument()
    expect(screen.getByText('Detected events')).toBeInTheDocument()
    expect(screen.getByText('Surface discoloration detected on the east facade.')).toBeInTheDocument()
    expect(screen.getAllByText('inspection_report.html').length).toBeGreaterThan(0)
    expect(screen.getAllByText('mission.kmz').length).toBeGreaterThan(0)
    expect(screen.getAllByText('mission_meta.json').length).toBeGreaterThan(0)
    expect(screen.getByText('Next step')).toBeInTheDocument()
  })

  it('renders failure reason and recovery guidance when analysis or delivery failed', async () => {
    apiMock.getMission.mockResolvedValue({
      missionId: 'mission-002',
      organizationId: 'org-001',
      siteId: 'site-001',
      requestedByUserId: 'user-001',
      missionName: 'Tower B Delivery',
      status: 'failed',
      bundleVersion: 'bundle-v4',
      request: { missionName: 'Tower B Delivery' },
      response: { failureReason: 'Route provider timed out for this site.' },
      delivery: {
        state: 'failed',
        publishedAt: null,
        failureReason: 'Route provider timed out for this site.',
      },
      artifacts: [],
      reportStatus: 'failed',
      reportGeneratedAt: '2026-04-14T11:10:00Z',
      eventCount: 0,
      latestReport: {
        reportId: 'report-002',
        missionId: 'mission-002',
        status: 'failed',
        generatedAt: '2026-04-14T11:10:00Z',
        summary: 'Analysis pipeline could not derive inspection events from the mission imagery.',
        eventCount: 0,
        downloadArtifact: null,
      },
      events: [],
      route: null,
      template: null,
      schedule: null,
      dispatch: null,
      createdAt: '2026-04-14T11:00:00Z',
    })

    renderWithProviders(
      <Routes>
        <Route path="/missions/:missionId" element={<MissionDetailPage />} />
      </Routes>,
      {
        route: '/missions/mission-002',
        auth: createAuthValue(),
      },
    )

    expect(await screen.findByText('Tower B Delivery')).toBeInTheDocument()
    expect(screen.getAllByText('Route provider timed out for this site.').length).toBeGreaterThan(0)
    expect(screen.getByText('Analysis pipeline could not derive inspection events from the mission imagery.')).toBeInTheDocument()
    expect(
      screen.getByText('Use the internal reprocess controls to regenerate the demo report or simulate a no-findings pass.'),
    ).toBeInTheDocument()
    expect(screen.getByText('No inspection events recorded')).toBeInTheDocument()
  })
})
