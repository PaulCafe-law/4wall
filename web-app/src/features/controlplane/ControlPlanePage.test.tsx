import { screen } from '@testing-library/react'
import { vi } from 'vitest'

import { ControlPlanePage } from './ControlPlanePage'
import { createAuthValue, createSession, renderWithProviders } from '../../test/utils'

const apiMock = vi.hoisted(() => ({
  listSites: vi.fn(),
  listInspectionRoutes: vi.fn(),
  listInspectionTemplates: vi.fn(),
  listInspectionSchedules: vi.fn(),
  listMissions: vi.fn(),
  getMission: vi.fn(),
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
      listSites: apiMock.listSites,
      listInspectionRoutes: apiMock.listInspectionRoutes,
      listInspectionTemplates: apiMock.listInspectionTemplates,
      listInspectionSchedules: apiMock.listInspectionSchedules,
      listMissions: apiMock.listMissions,
      getMission: apiMock.getMission,
      createInspectionRoute: apiMock.createInspectionRoute,
      createInspectionTemplate: apiMock.createInspectionTemplate,
      createInspectionSchedule: apiMock.createInspectionSchedule,
      dispatchMission: apiMock.dispatchMission,
    },
  }
})

describe('ControlPlanePage', () => {
  beforeEach(() => {
    for (const mock of Object.values(apiMock)) {
      mock.mockReset()
    }
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
        pointCount: 3,
        waypoints: [],
        planningParameters: {},
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
    apiMock.getMission.mockResolvedValue({
      missionId: 'mission-001',
      organizationId: 'org-001',
      siteId: 'site-001',
      requestedByUserId: 'user-1',
      missionName: 'Tower A morning run',
      status: 'ready',
      bundleVersion: 'bundle-001',
      request: {},
      response: {},
      delivery: {
        state: 'published',
        publishedAt: '2026-04-17T08:30:00Z',
        failureReason: null,
      },
      artifacts: [],
      reportStatus: 'ready',
      reportGeneratedAt: '2026-04-17T08:45:00Z',
      eventCount: 2,
      latestReport: {
        reportId: 'report-001',
        missionId: 'mission-001',
        status: 'ready',
        generatedAt: '2026-04-17T08:45:00Z',
        summary: 'Detected facade cracking and water ingress markers.',
        eventCount: 2,
        downloadArtifact: {
          artifactName: 'inspection_report.html',
          downloadUrl: '/v1/artifacts/report-001',
          contentType: 'text/html',
          checksumSha256: 'abc',
          publishedAt: '2026-04-17T08:45:00Z',
        },
      },
      events: [],
      route: {
        routeId: 'route-001',
        organizationId: 'org-001',
        siteId: 'site-001',
        name: 'Tower A facade loop',
        description: 'Facade-first route',
        pointCount: 3,
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
        dispatchedByUserId: 'user-1',
        assignee: 'observer-01',
        executionTarget: 'field-team',
        status: 'accepted',
        note: 'Demo walkthrough ready',
      },
      createdAt: '2026-04-17T08:00:00Z',
    })
  })

  it('renders the control-plane slice with rehearsal guidance and evidence prompts', async () => {
    renderWithProviders(<ControlPlanePage />, {
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
        isInternal: false,
      }),
    })

    expect(await screen.findByText('控制平面')).toBeInTheDocument()
    expect(await screen.findByText('巡檢到報表演練路徑')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Tower A')).toBeInTheDocument()
    expect(screen.getAllByText('Tower A facade loop').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Facade standard').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Tower A morning run').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '建立派工' })).toBeEnabled()
    expect(screen.getByText('已掛接任務派工')).toBeInTheDocument()
    expect(screen.getByText('事件與報表輸出已就緒')).toBeInTheDocument()
    expect(screen.getByText('建議截圖證據')).toBeInTheDocument()
    expect(screen.getByText('截圖場域與規劃脈絡')).toBeInTheDocument()
  })
})
