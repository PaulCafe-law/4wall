import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'

import { ControlPlanePage } from './ControlPlanePage'
import { createAuthValue, createSession, renderWithProviders } from '../../test/utils'

const apiMock = vi.hoisted(() => ({
  getControlPlaneDashboard: vi.fn(),
  listSites: vi.fn(),
  listInspectionRoutes: vi.fn(),
  listInspectionTemplates: vi.fn(),
  listInspectionSchedules: vi.fn(),
  listInspectionDispatches: vi.fn(),
  listMissions: vi.fn(),
  createInspectionRoute: vi.fn(),
  createInspectionTemplate: vi.fn(),
  createInspectionSchedule: vi.fn(),
  patchInspectionSchedule: vi.fn(),
  dispatchMission: vi.fn(),
  patchInspectionDispatch: vi.fn(),
}))

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  return {
    ...actual,
    api: {
      ...actual.api,
      getControlPlaneDashboard: apiMock.getControlPlaneDashboard,
      listSites: apiMock.listSites,
      listInspectionRoutes: apiMock.listInspectionRoutes,
      listInspectionTemplates: apiMock.listInspectionTemplates,
      listInspectionSchedules: apiMock.listInspectionSchedules,
      listInspectionDispatches: apiMock.listInspectionDispatches,
      listMissions: apiMock.listMissions,
      createInspectionRoute: apiMock.createInspectionRoute,
      createInspectionTemplate: apiMock.createInspectionTemplate,
      createInspectionSchedule: apiMock.createInspectionSchedule,
      patchInspectionSchedule: apiMock.patchInspectionSchedule,
      dispatchMission: apiMock.dispatchMission,
      patchInspectionDispatch: apiMock.patchInspectionDispatch,
    },
  }
})

describe('ControlPlanePage', () => {
  beforeEach(() => {
    for (const mock of Object.values(apiMock)) mock.mockReset()

    apiMock.getControlPlaneDashboard.mockResolvedValue({
      siteCount: 1,
      activeRouteCount: 1,
      activeTemplateCount: 1,
      scheduledMissionCount: 1,
      dispatchPendingCount: 1,
      runningMissionCount: 1,
      failedMissionCount: 0,
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
      alertSummary: { openCount: 1, criticalCount: 1, warningCount: 0 },
      recentAlerts: [
        {
          alertId: 'alert-001',
          category: 'dispatch_blocked',
          severity: 'critical',
          organizationId: 'org-001',
          organizationName: 'Acme Build',
          missionId: 'mission-001',
          missionName: 'Tower A morning run',
          siteId: 'site-001',
          siteName: 'Tower A',
          title: 'Dispatch blocked: observer unavailable',
          summary: 'The control plane is still waiting for a valid assignee before handoff.',
          recommendedNextStep: 'Assign a field observer and resend dispatch.',
          status: 'open',
          lastObservedAt: '2026-04-17T08:46:00Z',
        },
      ],
      recentExecutionSummaries: [
        {
          missionId: 'mission-001',
          phase: 'running',
          telemetryFreshness: 'stale',
          lastTelemetryAt: '2026-04-17T08:44:00Z',
          lastImageryAt: '2026-04-17T08:43:00Z',
          reportStatus: 'ready',
          eventCount: 2,
          failureReason: null,
        },
      ],
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
        siteMap: {
          siteId: 'site-001',
          baseMapType: 'satellite',
          center: { lat: 25.03391, lng: 121.56452 },
          zoom: 18,
          zones: [],
          launchPoints: [],
          viewpoints: [],
          updatedAt: '2026-04-17T08:00:00Z',
        },
        activeRouteCount: 1,
        activeTemplateCount: 1,
        activeRoutes: [
          {
            routeId: 'route-001',
            name: 'Tower A facade loop',
            version: 1,
            estimatedDurationSec: 480,
          },
        ],
        activeTemplates: [
          {
            templateId: 'template-001',
            name: 'Facade standard',
            reportMode: 'html_report',
            evidencePolicy: 'capture_key_frames',
          },
        ],
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
        lastDispatchedAt: '2026-04-17T08:30:00Z',
        pauseReason: null,
        lastOutcome: 'scheduled_for_execution',
        createdAt: '2026-04-17T08:00:00Z',
        updatedAt: '2026-04-17T08:00:00Z',
      },
    ])
    apiMock.listInspectionDispatches.mockResolvedValue([
      {
        dispatchId: 'dispatch-001',
        missionId: 'mission-001',
        routeId: 'route-001',
        templateId: 'template-001',
        scheduleId: 'schedule-001',
        dispatchedAt: '2026-04-17T08:31:00Z',
        acceptedAt: '2026-04-17T08:33:00Z',
        closedAt: null,
        lastUpdatedAt: '2026-04-17T08:33:00Z',
        dispatchedByUserId: 'user-001',
        assignee: 'observer-01',
        executionTarget: 'field-team',
        status: 'accepted',
        note: 'Ready for field handoff',
      },
    ])
    apiMock.listMissions.mockResolvedValue([
      {
        missionId: 'mission-001',
        organizationId: 'org-001',
        siteId: 'site-001',
        missionName: 'Tower A morning run',
        status: 'running',
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
    expect(await screen.findByRole('heading', { level: 2, name: '場域覆蓋與規劃密度' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 2, name: '評審要看到的完整故事' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 2, name: '先用總覽把控制平面講成一個持續運作的工作台' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 2, name: '最近告警' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 2, name: '最近執行狀態' })).toBeInTheDocument()
    expect(
      await screen.findByText('The control plane is still waiting for a valid assignee before handoff.'),
    ).toBeInTheDocument()
    expect(await screen.findByText('執行中')).toBeInTheDocument()
    expect((await screen.findAllByText('Tower A')).length).toBeGreaterThan(0)
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

  it('renders schedule and dispatch workspaces with lifecycle fields', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/control-plane/dispatch" element={<ControlPlanePage />} />
      </Routes>,
      {
        route: '/control-plane/dispatch',
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

    expect(await screen.findByRole('heading', { level: 1, name: '派工與任務佇列' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '建立派工' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '任務佇列' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '派工看板' })).toBeInTheDocument()
    expect(await screen.findAllByText('Tower A morning run')).toHaveLength(2)
    expect(screen.getByDisplayValue('observer-01')).toBeInTheDocument()
    expect(screen.getByDisplayValue('field-team')).toBeInTheDocument()
    expect(await screen.findByText('Ready for field handoff')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '標記完成' })).toBeInTheDocument()
  })
})
