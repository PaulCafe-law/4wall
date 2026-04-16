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
        reportStatus: 'not_started',
        reportGeneratedAt: null,
        eventCount: 0,
        createdAt: '2026-04-17T08:00:00Z',
      },
    ])
  })

  it('renders the control-plane slice with site context, planning assets, and dispatch workflow', async () => {
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

    expect(await screen.findByText('Control Plane')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Tower A')).toBeInTheDocument()
    expect(screen.getAllByText('Tower A facade loop').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Facade standard').length).toBeGreaterThan(0)
    expect(screen.getByText('Tower A morning run')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dispatch mission' })).toBeEnabled()
  })
})
