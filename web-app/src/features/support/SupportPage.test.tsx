import { screen } from '@testing-library/react'
import { vi } from 'vitest'

import { SupportPage } from './SupportPage'
import { createAuthValue, createSession, renderWithProviders } from '../../test/utils'

const apiMock = vi.hoisted(() => ({
  listSupportQueue: vi.fn(),
}))

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  return {
    ...actual,
    api: {
      ...actual.api,
      listSupportQueue: apiMock.listSupportQueue,
    },
  }
})

describe('SupportPage', () => {
  beforeEach(() => {
    apiMock.listSupportQueue.mockReset()
  })

  it('renders support queue items with operating profile context', async () => {
    apiMock.listSupportQueue.mockResolvedValue([
      {
        itemId: 'item-001',
        severity: 'critical',
        organizationId: 'org-001',
        flightId: 'flight-001',
        missionId: 'mission-001',
        operatingProfile: 'outdoor_gps_patrol',
        title: 'Bridge alert / uplink_degraded',
        summary: 'Android bridge reported unstable uplink quality.',
        createdAt: '2026-04-14T10:00:00Z',
      },
    ])

    renderWithProviders(<SupportPage />, {
      auth: createAuthValue({
        session: createSession({
          globalRoles: ['platform_admin'],
        }),
      }),
    })

    expect(await screen.findByText('支援佇列')).toBeInTheDocument()
    expect(await screen.findByText('Bridge alert / uplink_degraded')).toBeInTheDocument()
    expect(await screen.findByText('模式：戶外 GPS 巡邏')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: '開啟任務' })).toBeInTheDocument()
  })
})
