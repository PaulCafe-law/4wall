import { fireEvent, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

import { SupportPage } from './SupportPage'
import { createAuthValue, createSession, renderWithProviders } from '../../test/utils'

const apiMock = vi.hoisted(() => ({
  listSupportQueue: vi.fn(),
  requestSupportQueueAction: vi.fn(),
}))

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  return {
    ...actual,
    api: {
      ...actual.api,
      listSupportQueue: apiMock.listSupportQueue,
      requestSupportQueueAction: apiMock.requestSupportQueueAction,
    },
  }
})

describe('SupportPage', () => {
  beforeEach(() => {
    apiMock.listSupportQueue.mockReset()
    apiMock.requestSupportQueueAction.mockReset()
  })

  it('renders workflow context and can claim a support item', async () => {
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
        recommendedNextStep: 'Open Live Ops and verify lease, telemetry freshness, video, and observer state.',
        createdAt: '2026-04-16T10:00:00Z',
        lastObservedAt: '2026-04-16T10:02:00Z',
        workflow: {
          state: 'open',
          assignedToUserId: null,
          assignedToDisplayName: null,
          updatedAt: null,
          note: null,
        },
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
        summary: 'Latest telemetry shows 20% battery remaining.',
        recommendedNextStep: 'Use Live Ops to confirm observer and return-home readiness.',
        createdAt: '2026-04-16T09:55:00Z',
        lastObservedAt: '2026-04-16T09:55:00Z',
        workflow: {
          state: 'claimed',
          assignedToUserId: 'user-ops',
          assignedToDisplayName: 'Platform Ops',
          updatedAt: '2026-04-16T09:56:00Z',
          note: null,
        },
      },
    ])
    apiMock.requestSupportQueueAction.mockResolvedValue({
      state: 'claimed',
      assignedToUserId: 'user-ops',
      assignedToDisplayName: 'Platform Ops',
      updatedAt: '2026-04-16T10:03:00Z',
      note: null,
    })

    renderWithProviders(<SupportPage />, {
      auth: createAuthValue({
        session: createSession({
          globalRoles: ['platform_admin'],
        }),
      }),
    })

    expect(await screen.findByRole('heading', { name: '支援佇列' })).toBeInTheDocument()
    expect(await screen.findByText('Bridge 告警: uplink_degraded')).toBeInTheDocument()
    expect(screen.getByLabelText('support-workflow-item-001')).toHaveTextContent('待處理')
    expect(screen.getByLabelText('support-workflow-item-002')).toHaveTextContent('已認領')
    expect(screen.getByText('目前負責：Platform Ops')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('support-action-claim-item-001'))

    await waitFor(() => {
      expect(apiMock.requestSupportQueueAction).toHaveBeenCalledWith(expect.any(String), 'item-001', {
        action: 'claim',
      })
    })
  })
})
