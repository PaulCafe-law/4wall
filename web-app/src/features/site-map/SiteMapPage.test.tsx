import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import { vi } from 'vitest'

import { SiteMapPage } from './SiteMapPage'
import { createAuthValue, createSession, renderWithProviders } from '../../test/utils'

const apiMock = vi.hoisted(() => ({
  listIncidents: vi.fn(),
  getSiteMapAssetManifest: vi.fn(),
}))

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  return {
    ...actual,
    api: {
      ...actual.api,
      listIncidents: apiMock.listIncidents,
      getSiteMapAssetManifest: apiMock.getSiteMapAssetManifest,
    },
  }
})

const baseIncident = {
  organizationId: 'org-1',
  siteId: 'site-1',
  description: '設備溫度偏高，需要複核。',
  status: 'pending_review',
  severity: 'high',
  source: 'manual',
  evidence: [],
  comments: [],
  history: [],
  lineNotifications: [],
  assigneeName: null,
  reporterName: 'Test User',
  aiSummary: null,
  aiConfidence: null,
  createdAt: '2026-05-28T06:00:00Z',
  updatedAt: '2026-05-28T06:00:00Z',
  resolvedAt: null,
} as const

const incidents = [
  {
    ...baseIncident,
    incidentId: 'incident-a',
    title: 'A 區壓縮機異常',
    severity: 'critical',
    location: {
      siteId: 'site-1',
      siteName: '建研所',
      areaName: 'A 區',
      floor: '1F',
      equipmentId: 'compressor-a',
      equipmentName: '壓縮機',
      description: '建研所 / A 區 / 壓縮機',
      anchorId: 'anchor-compressor-a',
      floorplanX: 0.32,
      floorplanY: 0.42,
      worldX: -12,
      worldY: 2,
      worldZ: 6,
      cameraId: null,
      modelObjectId: 'model-compressor-a',
    },
  },
  {
    ...baseIncident,
    incidentId: 'incident-b',
    title: '',
    description: '',
    severity: 'medium',
    assigneeName: null,
    location: {
      siteId: 'site-1',
      siteName: '建研所',
      areaName: 'B 區',
      floor: '2F',
      equipmentId: 'motor-b',
      equipmentName: '馬達',
      description: null,
      worldX: null,
      worldY: null,
      worldZ: null,
      cameraId: null,
      modelObjectId: null,
    },
  },
] as const

describe('SiteMapPage', () => {
  beforeEach(() => {
    apiMock.listIncidents.mockReset()
    apiMock.getSiteMapAssetManifest.mockReset()
  })

  it('renders the BRI GLB map, selected incident, and 2D controls', async () => {
    apiMock.listIncidents.mockResolvedValue(incidents)

    renderWithProviders(
      <>
        <SiteMapPage />
        <LocationProbe />
      </>,
      {
        route: '/site-map?map=bri&incidentId=incident-b',
        auth: createAuthValue({
          session: createSession({
            memberships: [{ membershipId: 'm-1', organizationId: 'org-1', role: 'customer_admin', isActive: true }],
          }),
        }),
      },
    )

    expect(await screen.findByRole('heading', { level: 1, name: '場域地圖' })).toBeInTheDocument()
    expect(screen.getAllByText('建研所').length).toBeGreaterThan(0)
    expect(await screen.findByText('使用場域佔位模型')).toBeInTheDocument()
    expect(await screen.findAllByText('建研所 / B 區 / 2F / 馬達 異常事件')).toHaveLength(2)
    expect(screen.getByText('尚未提供事件描述。請進入事件詳情補充現場資訊、處理狀態與證據。')).toBeInTheDocument()
    expect(screen.getByText('尚未指派')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '開啟事件詳情' })).toHaveAttribute('href', '/incidents/incident-b')
    expect(screen.getByText('使用 fallback 座標')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '2D 參考' }))
    expect(await screen.findByText('建研所 site plan')).toBeInTheDocument()
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/site-map?map=bri&incidentId=incident-b')

    await userEvent.selectOptions(screen.getByLabelText('場域'), 'demo')
    await waitFor(() => {
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/site-map?incidentId=incident-b')
    })
    expect(screen.getByText('2F site plan')).toBeInTheDocument()

    const compressorButtons = screen.getAllByRole('button', { name: /A 區壓縮機異常/ })
    await userEvent.click(compressorButtons[0])

    await waitFor(() => {
      expect(screen.getByRole('link', { name: '開啟事件詳情' })).toHaveAttribute('href', '/incidents/incident-a')
    })
  })

  it('shows the rent house SOG map only for internal users', async () => {
    apiMock.listIncidents.mockResolvedValue([])
    apiMock.getSiteMapAssetManifest.mockResolvedValue({
      assetKey: 'rent-house',
      label: '租屋處',
      assetType: 'sog',
      assetUrl: 'https://r2.example.test/rent-house.sog?signature=test',
      expiresAt: '2026-06-20T02:00:00Z',
    })

    renderWithProviders(<SiteMapPage />, {
      route: '/site-map?map=rent-house',
      auth: createAuthValue({
        session: createSession({
          globalRoles: ['ops'],
        }),
      }),
    })

    expect(await screen.findByRole('option', { name: '租屋處' })).toBeInTheDocument()
    expect(screen.getByText('SuperSplat 裁切後的 3D Gaussian Splat 場域，僅管理者帳號可查看。')).toBeInTheDocument()
    expect(screen.getByText('SOG 場域測試模式')).toBeInTheDocument()
    expect(await screen.findByText('SOG 場域測試模式')).toBeInTheDocument()
    expect(screen.queryByText(/短效/)).not.toBeInTheDocument()
    expect(screen.getByText('目前沒有事件標記')).toBeInTheDocument()
    await waitFor(() => {
      expect(apiMock.getSiteMapAssetManifest).toHaveBeenCalledWith('test-token', 'rent-house')
    })
  })

  it('hides the private rent house map from non-internal users', async () => {
    apiMock.listIncidents.mockResolvedValue([])

    renderWithProviders(<SiteMapPage />, {
      route: '/site-map?map=rent-house',
      auth: createAuthValue({
        session: createSession({
          memberships: [{ membershipId: 'm-1', organizationId: 'org-1', role: 'customer_admin', isActive: true }],
        }),
      }),
    })

    expect(await screen.findByRole('option', { name: '示範場域' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '租屋處' })).not.toBeInTheDocument()
    expect(apiMock.getSiteMapAssetManifest).not.toHaveBeenCalled()
  })
})

function LocationProbe() {
  const location = useLocation()
  return <span data-testid="location-probe">{location.pathname + location.search}</span>
}
