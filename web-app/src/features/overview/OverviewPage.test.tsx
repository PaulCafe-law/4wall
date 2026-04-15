import { screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

import { OverviewPage } from './OverviewPage'
import { createAuthValue, createSession, renderWithProviders } from '../../test/utils'

const apiMock = vi.hoisted(() => ({
  getOverview: vi.fn(),
}))

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  return {
    ...actual,
    api: {
      ...actual.api,
      getOverview: apiMock.getOverview,
    },
  }
})

describe('OverviewPage', () => {
  beforeEach(() => {
    apiMock.getOverview.mockReset()
  })

  it('renders customer overview actions, recent deliveries, invoices, and invites from the aggregate contract', async () => {
    apiMock.getOverview.mockResolvedValue({
      siteCount: 2,
      missionCount: 3,
      planningMissionCount: 1,
      failedMissionCount: 1,
      publishedMissionCount: 1,
      overdueInvoiceCount: 1,
      pendingInviteCount: 1,
      recentMissions: [
        {
          missionId: 'mission-001',
          organizationId: 'org-001',
          siteId: 'site-001',
          missionName: 'Tower A Delivery',
          status: 'failed',
          bundleVersion: 'bundle-v1',
          deliveryStatus: 'failed',
          publishedAt: null,
          failureReason: 'Route provider timed out for this site.',
          createdAt: '2026-04-14T10:00:00Z',
        },
      ],
      recentDeliveries: [
        {
          missionId: 'mission-002',
          organizationId: 'org-001',
          siteId: 'site-001',
          missionName: 'Tower A Published',
          status: 'ready',
          bundleVersion: 'bundle-v2',
          deliveryStatus: 'published',
          publishedAt: '2026-04-14T11:00:00Z',
          failureReason: null,
          createdAt: '2026-04-14T09:00:00Z',
        },
      ],
      recentInvoices: [
        {
          invoiceId: 'invoice-001',
          organizationId: 'org-001',
          invoiceNumber: 'INV-001',
          currency: 'TWD',
          subtotal: 10000,
          tax: 500,
          total: 10500,
          dueDate: '2026-04-12T00:00:00Z',
          status: 'overdue',
          paymentInstructions: 'Bank transfer',
          attachmentRefs: [],
          notes: '',
          paymentNote: 'Please settle this invoice this week.',
          receiptRef: '',
          voidReason: '',
          createdAt: '2026-04-01T10:00:00Z',
          updatedAt: '2026-04-01T10:00:00Z',
        },
      ],
      pendingInvites: [
        {
          inviteId: 'invite-001',
          organizationId: 'org-001',
          organizationName: 'Acme Build',
          email: 'viewer@acme.test',
          role: 'customer_viewer',
          createdAt: '2026-04-15T10:00:00Z',
          expiresAt: '2026-04-20T10:00:00Z',
        },
      ],
      supportSummary: null,
    })

    renderWithProviders(<OverviewPage />, {
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

    expect(await screen.findByText('Tower A Delivery')).toBeInTheDocument()
    expect(screen.getByText('Tower A Published')).toBeInTheDocument()
    expect(screen.getByText('viewer@acme.test')).toBeInTheDocument()
    expect(screen.getByText('INV-001')).toBeInTheDocument()
    expect(document.querySelector('a[href="/missions/mission-001"]')).toBeTruthy()
    expect(document.querySelector('a[href="/missions/mission-002"]')).toBeTruthy()
    expect(document.querySelector('a[href="/billing"]')).toBeTruthy()
    expect(document.querySelector('a[href="/team"]')).toBeTruthy()
  })

  it('shows internal support summary when the overview contract includes support counts', async () => {
    apiMock.getOverview.mockResolvedValue({
      siteCount: 1,
      missionCount: 1,
      planningMissionCount: 0,
      failedMissionCount: 1,
      publishedMissionCount: 0,
      overdueInvoiceCount: 1,
      pendingInviteCount: 0,
      recentMissions: [],
      recentDeliveries: [],
      recentInvoices: [],
      pendingInvites: [],
      supportSummary: {
        openCount: 4,
        criticalCount: 2,
        warningCount: 2,
      },
    })

    renderWithProviders(<OverviewPage />, {
      auth: createAuthValue({
        session: createSession({
          globalRoles: ['ops'],
        }),
        isInternal: true,
      }),
    })

    await waitFor(() => {
      expect(document.querySelector('a[href="/support"]')).toBeTruthy()
      expect(document.querySelector('a[href="/live-ops"]')).toBeTruthy()
    })
  })
})
