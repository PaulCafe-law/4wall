import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import { vi } from 'vitest'

import { SiteMapPage } from './SiteMapPage'
import { createAuthValue, createSession, renderWithProviders } from '../../test/utils'

const apiMock = vi.hoisted(() => ({
  listIncidents: vi.fn(),
}))

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  return {
    ...actual,
    api: {
      ...actual.api,
      listIncidents: apiMock.listIncidents,
    },
  }
})

const baseIncident = {
  organizationId: 'org-1',
  siteId: 'site-1',
  description: '現場回報需要確認。',
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
    title: 'A 區空壓機壓力表疑似異常',
    severity: 'critical',
    location: {
      siteId: 'site-1',
      siteName: '建研所工地',
      areaName: 'A 區',
      floor: '1F',
      equipmentId: 'compressor-a',
      equipmentName: '空壓機',
      description: '建研所工地 / A 區 / 空壓機',
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
      siteName: '建研所工地',
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
  })

  it('renders the 3D fallback, selected incident, and 2D view controls', async () => {
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
    })

    expect(await screen.findByText('場域地圖')).toBeInTheDocument()
    expect(screen.getAllByText('建研所').length).toBeGreaterThan(0)
    expect(await screen.findByText('使用示意模型')).toBeInTheDocument()
    expect(screen.getByText(/目前使用建研所示意場域/)).toBeInTheDocument()
    expect(await screen.findAllByText('建研所工地 / B 區 / 2F / 馬達 異常事件')).toHaveLength(2)
    expect(screen.getByText('尚未提供描述，請進入事件詳情查看處理紀錄。')).toBeInTheDocument()
    expect(screen.getByText('尚未指派')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '查看事件詳情' })).toHaveAttribute('href', '/incidents/incident-b')
    expect(screen.getByText('使用示意座標')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '2D 平面' }))
    expect(await screen.findByText('建研所 site plan')).toBeInTheDocument()
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/site-map?map=bri&incidentId=incident-b')

    await userEvent.selectOptions(screen.getByLabelText('場域'), 'demo')
    await waitFor(() => {
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/site-map?incidentId=incident-b')
    })
    expect(screen.getByText('2F site plan')).toBeInTheDocument()

    const compressorButtons = screen.getAllByRole('button', { name: /A 區空壓機壓力表疑似異常/ })
    await userEvent.click(compressorButtons[0])

    await waitFor(() => {
      expect(screen.getByRole('link', { name: '查看事件詳情' })).toHaveAttribute('href', '/incidents/incident-a')
    })
  })
})

function LocationProbe() {
  const location = useLocation()
  return <span data-testid="location-probe">{location.pathname + location.search}</span>
}
