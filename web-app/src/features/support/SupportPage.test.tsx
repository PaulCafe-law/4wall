import { fireEvent, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

import { SupportPage } from './SupportPage'
import { formatSupportWorkflowState } from '../../lib/presentation'
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
        title: 'Bridge alert: uplink_degraded',
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
        title: 'Battery low',
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

    expect(await screen.findByText('Bridge alert: uplink_degraded')).toBeInTheDocument()
    expect(await screen.findByText('Battery low')).toBeInTheDocument()
    expect(screen.getByLabelText('support-workflow-item-001')).toHaveTextContent(
      formatSupportWorkflowState('open'),
    )
    expect(screen.getByLabelText('support-workflow-item-002')).toHaveTextContent(
      formatSupportWorkflowState('claimed'),
    )
    expect(screen.getByText(/Platform Ops/)).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('support-action-claim-item-001'))

    await waitFor(() => {
      expect(apiMock.requestSupportQueueAction).toHaveBeenCalledWith(expect.any(String), 'item-001', {
        action: 'claim',
      })
    })
  })
})
