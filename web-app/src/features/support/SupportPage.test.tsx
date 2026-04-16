import { fireEvent, screen } from '@testing-library/react'
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

  it('renders triage context and severity filters for internal users', async () => {
    apiMock.listSupportQueue.mockResolvedValue([
      {
        itemId: 'item-001',
        category: 'bridge_alert',
        severity: 'critical',
        organizationId: 'org-001',
        organizationName: 'Acme Build',
        flightId: 'flight-001',
        missionId: 'mission-001',
        missionName: 'Tower A Demo',
        siteName: 'Tower A',
        title: 'Bridge 告警: uplink_degraded',
        summary: 'Android bridge reported unstable uplink quality.',
        recommendedNextStep: '打開 Live Ops，確認 lease、telemetry freshness、video 狀態與 observer 是否仍可支援現場處置。',
        createdAt: '2026-04-16T10:00:00Z',
        lastObservedAt: '2026-04-16T10:02:00Z',
      },
      {
        itemId: 'item-002',
        category: 'battery_low',
        severity: 'warning',
        organizationId: 'org-001',
        organizationName: 'Acme Build',
        flightId: 'flight-001',
        missionId: 'mission-001',
        missionName: 'Tower A Demo',
        siteName: 'Tower A',
        title: '電量偏低',
        summary: '最新電量僅剩 20%。',
        recommendedNextStep: '先看 Live Ops 的 lease、視訊與 observer 狀態，再決定是否請現場改成 HOLD 或返航。',
        createdAt: '2026-04-16T09:55:00Z',
        lastObservedAt: '2026-04-16T09:55:00Z',
      },
    ])

    renderWithProviders(<SupportPage />, {
      auth: createAuthValue({
        session: createSession({
          globalRoles: ['platform_admin'],
        }),
      }),
    })

    expect(await screen.findByRole('heading', { name: '支援佇列' })).toBeInTheDocument()
    expect(await screen.findByText('Bridge 告警: uplink_degraded')).toBeInTheDocument()
    expect(await screen.findAllByText('Acme Build', { exact: false })).not.toHaveLength(0)
    expect(await screen.findAllByText('Tower A Demo', { exact: false })).not.toHaveLength(0)
    expect(await screen.findAllByText('最近觀測', { exact: false })).not.toHaveLength(0)
    expect(await screen.findAllByRole('link', { name: '打開 Live Ops' })).not.toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: '高風險' }))

    expect(await screen.findByText('Bridge 告警: uplink_degraded')).toBeInTheDocument()
    expect(screen.queryByText('電量偏低')).not.toBeInTheDocument()
  })
})
