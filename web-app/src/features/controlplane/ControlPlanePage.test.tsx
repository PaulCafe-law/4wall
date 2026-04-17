import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'

import { ControlPlanePage } from './ControlPlanePage'
import { createAuthValue, createSession, renderWithProviders } from '../../test/utils'

const apiMock = vi.hoisted(() => ({
  getOverview: vi.fn(),
  listSites: vi.fn(),
  listInspectionRoutes: vi.fn(),
  listInspectionTemplates: vi.fn(),
  listInspectionSchedules: vi.fn(),
  listMissions: vi.fn(),
  createInspectionRoute: vi.fn(),
  createInspectionTemplate: vi.fn(),
  createInspectionSchedule: vi.fn(),
  dispatchMission: vi.fn(),
}))

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  return {
    ...actual,
    api: {
      ...actual.api,
      getOverview: apiMock.getOverview,
      listSites: apiMock.listSites,
      listInspectionRoutes: apiMock.listInspectionRoutes,
      listInspectionTemplates: apiMock.listInspectionTemplates,
      listInspectionSchedules: apiMock.listInspectionSchedules,
      listMissions: apiMock.listMissions,
      createInspectionRoute: apiMock.createInspectionRoute,
      createInspectionTemplate: apiMock.createInspectionTemplate,
      createInspectionSchedule: apiMock.createInspectionSchedule,
      dispatchMission: apiMock.dispatchMission,
    },
  }
})

describe('ControlPlanePage', () => {
  beforeEach(() => {
    for (const mock of Object.values(apiMock)) mock.mockReset()

    apiMock.getOverview.mockResolvedValue({
      siteCount: 1,
      missionCount: 2,
      planningMissionCount: 0,
      scheduledMissionCount: 1,
      runningMissionCount: 0,
      readyMissionCount: 1,
      failedMissionCount: 0,
      publishedMissionCount: 1,
      invoiceDueCount: 0,
      overdueInvoiceCount: 0,
      pendingInviteCount: 0,
      recentMissions: [],
      recentDeliveries: [],
      recentInvoices: [],
      pendingInvites: [],
      latestReportSummary: {
        reportId: 'report-001',
        missionId: 'mission-001',
        status: 'ready',
        generatedAt: '2026-04-17T08:45:00Z',
        summary: 'Detected facade cracking and water ingress markers.',
        eventCount: 2,
        downloadArtifact: null,
      },
      latestEventSummary: {
        eventId: 'event-001',
        missionId: 'mission-001',
        category: 'joint_water_ingress_risk',
        severity: 'critical',
        summary: 'Tower A flagged a possible water ingress pattern.',
        detectedAt: '2026-04-17T08:44:00Z',
      },
      supportSummary: { openCount: 1, criticalCount: 1, warningCount: 0 },
    })
    apiMock.listSites.mockResolvedValue([
      {
        siteId: 'site-001',
        organizationId: 'org-001',
        name: 'Tower A',
        externalRef: 'SITE-A',
        address: 'Taipei',
        location: { lat: 25.03391, lng: 121.56452 },
        notes: 'North facade priority',
        createdAt: '2026-04-17T08:00:00Z',
        updatedAt: '2026-04-17T08:00:00Z',
      },
    ])
    apiMock.listInspectionRoutes.mockResolvedValue([
      {
        routeId: 'route-001',
        organizationId: 'org-001',
        siteId: 'site-001',
        name: 'Tower A facade loop',
        description: 'Facade-first route',
        version: 1,
        pointCount: 3,
        previewPolyline: [
          { lat: 25.0337, lng: 121.5643 },
          { lat: 25.03391, lng: 121.56452 },
        ],
        estimatedDurationSec: 480,
        waypoints: [],
        planningParameters: { routeMode: 'site-envelope-demo' },
        createdAt: '2026-04-17T08:00:00Z',
        updatedAt: '2026-04-17T08:00:00Z',
      },
    ])
    apiMock.listInspectionTemplates.mockResolvedValue([
      {
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
    ])
    apiMock.listInspectionSchedules.mockResolvedValue([
      {
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
        pauseReason: null,
        lastOutcome: 'scheduled_for_execution',
        createdAt: '2026-04-17T08:00:00Z',
        updatedAt: '2026-04-17T08:00:00Z',
      },
    ])
    apiMock.listMissions.mockResolvedValue([
      {
        missionId: 'mission-001',
        organizationId: 'org-001',
        siteId: 'site-001',
        missionName: 'Tower A morning run',
        status: 'ready',
        bundleVersion: 'bundle-001',
        deliveryStatus: 'published',
        publishedAt: '2026-04-17T08:30:00Z',
        failureReason: null,
        reportStatus: 'ready',
        reportGeneratedAt: '2026-04-17T08:45:00Z',
        eventCount: 2,
        createdAt: '2026-04-17T08:00:00Z',
      },
    ])
  })

  it('renders dashboard workspace with productized control-plane IA', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/control-plane" element={<ControlPlanePage />} />
      </Routes>,
      {
        route: '/control-plane',
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

    expect(await screen.findByRole('heading', { level: 1, name: '控制平面總覽' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '總覽' })).toBeInTheDocument()
    expect(screen.getByText('場域覆蓋與規劃密度')).toBeInTheDocument()
    expect(screen.getByText('評審要看到的完整故事')).toBeInTheDocument()
    expect(screen.getByText('待處理營運提醒')).toBeInTheDocument()
    expect(await screen.findAllByText('Tower A')).toHaveLength(2)
  })

  it('renders route workspace with route library summaries', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/control-plane/routes" element={<ControlPlanePage />} />
      </Routes>,
      {
        route: '/control-plane/routes',
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

    expect(await screen.findByRole('heading', { level: 1, name: '航線規劃庫' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '建立航線' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '航線庫' })).toBeInTheDocument()
    expect(await screen.findByText('Tower A facade loop')).toBeInTheDocument()
    expect(screen.getByText('8 分鐘')).toBeInTheDocument()
    expect(screen.getByText('v1')).toBeInTheDocument()
  })
})
