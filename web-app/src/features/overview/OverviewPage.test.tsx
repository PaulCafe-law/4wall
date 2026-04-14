import { screen } from '@testing-library/react'
import { vi } from 'vitest'

import { OverviewPage } from './OverviewPage'
import { createAuthValue, createSession, renderWithProviders } from '../../test/utils'

const apiMock = vi.hoisted(() => ({
  listSites: vi.fn(),
  listMissions: vi.fn(),
  listInvoices: vi.fn(),
  getOrganization: vi.fn(),
  listOrganizations: vi.fn(),
}))

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  return {
    ...actual,
    api: {
      ...actual.api,
      listSites: apiMock.listSites,
      listMissions: apiMock.listMissions,
      listInvoices: apiMock.listInvoices,
      getOrganization: apiMock.getOrganization,
      listOrganizations: apiMock.listOrganizations,
    },
  }
})

describe('OverviewPage', () => {
  beforeEach(() => {
    apiMock.listSites.mockReset()
    apiMock.listMissions.mockReset()
    apiMock.listInvoices.mockReset()
    apiMock.getOrganization.mockReset()
    apiMock.listOrganizations.mockReset()
  })

  it('surfaces pending invites, overdue invoices, and next actions for customer admins', async () => {
    apiMock.listSites.mockResolvedValue([
      {
        siteId: 'site-001',
        organizationId: 'org-001',
        name: 'Tower A',
        externalRef: null,
        address: 'Taipei',
        location: { lat: 25.03, lng: 121.56 },
        notes: '',
        createdAt: '2026-04-10T10:00:00Z',
        updatedAt: '2026-04-10T10:00:00Z',
      },
    ])
    apiMock.listMissions.mockResolvedValue([
      {
        missionId: 'mission-001',
        organizationId: 'org-001',
        siteId: 'site-001',
        missionName: 'Tower A Delivery',
        status: 'failed',
        bundleVersion: 'bundle-v1',
        createdAt: '2026-04-14T10:00:00Z',
      },
      {
        missionId: 'mission-002',
        organizationId: 'org-001',
        siteId: 'site-001',
        missionName: 'Tower A Follow-up',
        status: 'planning',
        bundleVersion: 'bundle-v2',
        createdAt: '2026-04-14T09:00:00Z',
      },
      {
        missionId: 'mission-003',
        organizationId: 'org-001',
        siteId: 'site-001',
        missionName: 'Tower A Published',
        status: 'ready',
        bundleVersion: 'bundle-v3',
        createdAt: '2026-04-13T09:00:00Z',
      },
    ])
    apiMock.listInvoices.mockResolvedValue([
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
        paymentInstructions: '',
        attachmentRefs: [],
        notes: '',
        paymentNote: '',
        receiptRef: '',
        voidReason: '',
        createdAt: '2026-04-01T10:00:00Z',
        updatedAt: '2026-04-01T10:00:00Z',
      },
    ])
    apiMock.getOrganization.mockResolvedValue({
      organizationId: 'org-001',
      name: 'Acme Build',
      slug: 'acme-build',
      isActive: true,
      members: [],
      pendingInvites: [
        {
          inviteId: 'invite-001',
          organizationId: 'org-001',
          email: 'new-member@acme.test',
          role: 'customer_viewer',
          expiresAt: '2026-04-20T10:00:00Z',
          acceptedAt: null,
          revokedAt: null,
        },
      ],
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

    expect(await screen.findByText('總覽')).toBeInTheDocument()
    expect(await screen.findByText('待接受邀請')).toBeInTheDocument()
    expect(await screen.findByText('有 1 份邀請尚未接受')).toBeInTheDocument()
    expect(await screen.findByText('有 1 張帳單已逾期')).toBeInTheDocument()
    expect(await screen.findByText('new-member@acme.test')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: '查看團隊' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: '查看帳務' })).toBeInTheDocument()
  })
})
