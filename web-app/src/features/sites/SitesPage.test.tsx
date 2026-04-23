import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'

import { SitesPage } from './SitesPage'
import { createAuthValue, createSession, renderWithProviders } from '../../test/utils'

const apiMock = vi.hoisted(() => ({
  listSites: vi.fn(),
  listInspectionRoutes: vi.fn(),
  createSite: vi.fn(),
  patchSite: vi.fn(),
}))

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  return {
    ...actual,
    api: {
      ...actual.api,
      listSites: apiMock.listSites,
      listInspectionRoutes: apiMock.listInspectionRoutes,
      createSite: apiMock.createSite,
      patchSite: apiMock.patchSite,
    },
  }
})

vi.mock('../../lib/organization-choices', () => ({
  useOrganizationChoices: () => ({
    choices: [{ organizationId: 'org-001', name: 'Acme Build' }],
    isLoading: false,
  }),
}))

vi.mock('../maps/GoogleMapCanvas', () => ({
  GoogleMapCanvas: () => <div>GoogleMapCanvasMock</div>,
}))

describe('SitesPage', () => {
  beforeEach(() => {
    for (const mock of Object.values(apiMock)) mock.mockReset()

    apiMock.listSites.mockResolvedValue([
      {
        siteId: 'site-001',
        organizationId: 'org-001',
        name: 'North Yard',
        externalRef: 'SITE-A',
        address: '1 Example Road',
        location: { lat: 22.99635, lng: 120.23634 },
        notes: 'Patrol staging area',
        siteMap: {
          baseMapType: 'satellite',
          center: { lat: 22.99635, lng: 120.23634 },
          zoom: 18,
          version: 1,
          zones: [],
          launchPoints: [],
          viewpoints: [],
        },
        activeRouteCount: 1,
        activeTemplateCount: 1,
        activeRoutes: [
          {
            routeId: 'route-001',
            name: 'North Yard Patrol',
            version: 1,
            pointCount: 3,
            estimatedDurationSec: 480,
            updatedAt: '2026-04-19T10:00:00Z',
          },
        ],
        activeTemplates: [
          {
            templateId: 'template-001',
            routeId: 'route-001',
            name: 'Standard Patrol',
            evidencePolicy: 'capture_key_frames',
            reportMode: 'html_report',
            reviewMode: 'operator_review',
            updatedAt: '2026-04-19T10:00:00Z',
          },
        ],
        createdAt: '2026-04-19T10:00:00Z',
        updatedAt: '2026-04-19T10:00:00Z',
      },
    ])

    apiMock.listInspectionRoutes.mockResolvedValue([
      {
        routeId: 'route-001',
        organizationId: 'org-001',
        siteId: 'site-001',
        name: 'North Yard Patrol',
        description: 'Closed patrol route',
        version: 1,
        launchPoint: {
          launchPointId: 'launch-001',
          label: 'North Yard Launch',
          kind: 'primary',
          lat: 22.9963,
          lng: 120.2363,
          headingDeg: 180,
          altitudeM: 0,
          isActive: true,
        },
        implicitReturnToLaunch: true,
        pointCount: 3,
        previewPolyline: [
          { lat: 22.9963, lng: 120.2363 },
          { lat: 22.9964, lng: 120.2365 },
          { lat: 22.9962, lng: 120.2367 },
          { lat: 22.9963, lng: 120.2363 },
        ],
        estimatedDurationSec: 480,
        waypoints: [],
        planningParameters: {},
        createdAt: '2026-04-19T10:00:00Z',
        updatedAt: '2026-04-19T10:00:00Z',
      },
    ])
  })

  it('shows site context as a read-only workspace for internal users', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/sites/:siteId" element={<SitesPage />} />
      </Routes>,
      {
        route: '/sites/site-001',
        auth: createAuthValue({
          session: createSession({ globalRoles: ['platform_admin'] }),
        }),
      },
    )

    expect(await screen.findByRole('heading', { level: 1, name: '場址' })).toBeInTheDocument()
    expect((await screen.findAllByText('North Yard')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('1 Example Road').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Patrol staging area').length).toBeGreaterThan(0)
    expect(screen.queryByText('Google Maps 場域規劃')).not.toBeInTheDocument()
  })

  it('keeps customer roles on the same read-only site context', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/sites/:siteId" element={<SitesPage />} />
      </Routes>,
      {
        route: '/sites/site-001',
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

    expect(await screen.findByRole('heading', { level: 1, name: '場址' })).toBeInTheDocument()
    expect((await screen.findAllByText('North Yard')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('1 Example Road').length).toBeGreaterThan(0)
    expect(screen.queryByText('Google Maps 場域規劃')).not.toBeInTheDocument()
  })
})
