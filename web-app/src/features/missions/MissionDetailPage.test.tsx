import { screen } from '@testing-library/react'
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

describe('MissionDetailPage', () => {
  beforeEach(() => {
    apiMock.getMission.mockReset()
  })

  it('renders planning, dispatch, execution-report, and artifact sections', async () => {
    apiMock.getMission.mockResolvedValue({
      missionId: 'mission-001',
      organizationId: 'org-001',
      siteId: 'site-001',
      requestedByUserId: 'user-001',
      missionName: 'Tower A Delivery',
      status: 'dispatched',
      bundleVersion: 'bundle-v3',
      request: { missionName: 'Tower A Delivery' },
      response: { missionId: 'mission-001' },
      delivery: { state: 'published', publishedAt: '2026-04-14T10:15:00Z', failureReason: null },
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
      route: {
        routeId: 'route-001',
        organizationId: 'org-001',
        siteId: 'site-001',
        name: 'Tower A facade loop',
        description: 'Facade-first route',
        version: 1,
        pointCount: 3,
        previewPolyline: [],
        estimatedDurationSec: 480,
        waypoints: [],
        planningParameters: {},
        createdAt: '2026-04-17T08:00:00Z',
        updatedAt: '2026-04-17T08:00:00Z',
      },
      template: {
        templateId: 'template-001',
        organizationId: 'org-001',
        siteId: 'site-001',
        routeId: 'route-001',
        name: 'Facade standard',
        description: 'Operator-reviewed',
        inspectionProfile: {},
        alertRules: [],
        evidencePolicy: 'capture_key_frames',
        reportMode: 'html_report',
        reviewMode: 'operator_review',
        createdAt: '2026-04-17T08:00:00Z',
        updatedAt: '2026-04-17T08:00:00Z',
      },
      schedule: {
        scheduleId: 'schedule-001',
        organizationId: 'org-001',
        siteId: 'site-001',
        routeId: 'route-001',
        templateId: 'template-001',
        plannedAt: '2026-04-18T09:00:00Z',
        recurrence: 'One-off',
        status: 'scheduled',
        alertRules: [],
        nextRunAt: '2026-04-18T09:00:00Z',
        lastRunAt: null,
        lastDispatchedAt: '2026-04-17T08:40:00Z',
        pauseReason: null,
        lastOutcome: 'scheduled_for_execution',
        createdAt: '2026-04-17T08:00:00Z',
        updatedAt: '2026-04-17T08:00:00Z',
      },
      dispatch: {
        dispatchId: 'dispatch-001',
        missionId: 'mission-001',
        routeId: 'route-001',
        templateId: 'template-001',
        scheduleId: 'schedule-001',
        dispatchedAt: '2026-04-17T08:40:00Z',
        acceptedAt: '2026-04-17T08:42:00Z',
        closedAt: null,
        lastUpdatedAt: '2026-04-17T08:42:00Z',
        dispatchedByUserId: 'user-1',
        assignee: 'observer-01',
        executionTarget: 'field-team',
        status: 'accepted',
        note: 'Demo walkthrough ready',
      },
      executionSummary: {
        missionId: 'mission-001',
        phase: 'running',
        telemetryFreshness: 'stale',
        lastTelemetryAt: '2026-04-17T08:43:00Z',
        lastImageryAt: '2026-04-17T08:44:00Z',
        reportStatus: 'ready',
        eventCount: 2,
        failureReason: null,
      },
      createdAt: '2026-04-14T10:00:00Z',
    })

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

    expect(await screen.findByText('Tower A Delivery')).toBeInTheDocument()
    expect(screen.getByText('規劃與任務背景')).toBeInTheDocument()
    expect(screen.getByText('控制平面規劃串接')).toBeInTheDocument()
    expect(screen.getByText('派工與執行責任')).toBeInTheDocument()
    expect(screen.getByText('執行與報表狀態')).toBeInTheDocument()
    expect(screen.getByText('執行摘要')).toBeInTheDocument()
    expect(screen.getByText('偵測到的事件')).toBeInTheDocument()
    expect(screen.getByText('成果檔案')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '產生 demo 異常' })).toBeInTheDocument()
    expect(screen.getByText('Surface discoloration detected on the east facade.')).toBeInTheDocument()
    expect(screen.getAllByText('2 inspection events were generated for Tower A Delivery.')).toHaveLength(2)
    expect(screen.getByText('observer-01')).toBeInTheDocument()
    expect(screen.getByText(/最近派工/)).toBeInTheDocument()
    expect(screen.getByText(/最近一次影像/)).toBeInTheDocument()
    expect(screen.getByText('執行中')).toBeInTheDocument()
    expect(screen.getByText(/最後更新/)).toBeInTheDocument()
  })
})
