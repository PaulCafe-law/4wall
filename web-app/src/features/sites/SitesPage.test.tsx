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
        name: '平實公園',
        externalRef: 'SITE-A',
        address: '台南市東區平實公園',
        location: { lat: 22.99635, lng: 120.23634 },
        notes: '測試用場域',
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
            name: '平實公園巡檢航線',
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
            name: '保全巡檢模板',
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
        name: '平實公園巡檢航線',
        description: 'Closed patrol route',
        version: 1,
        launchPoint: {
          launchPointId: 'launch-001',
          label: '平實公園起降點',
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

    expect(await screen.findByRole('heading', { level: 1, name: '場域' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 2, name: '平實公園' })).toBeInTheDocument()
    expect(screen.getByText('map context')).toBeInTheDocument()
    expect(screen.getByText('GoogleMapCanvasMock')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 3, name: 'Google Maps 場域規劃' })).not.toBeInTheDocument()
    expect(
      screen.getByText(/Site 頁只保留場域參考中心點與基本資料/),
    ).toBeInTheDocument()
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

    expect(await screen.findByRole('heading', { level: 1, name: '場域' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 2, name: '平實公園' })).toBeInTheDocument()
    expect(screen.getByText('GoogleMapCanvasMock')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 3, name: 'Google Maps 場域規劃' })).not.toBeInTheDocument()
    expect(screen.getByText(/Site 頁只保留場域參考中心點與基本資料/)).toBeInTheDocument()
  })
})
