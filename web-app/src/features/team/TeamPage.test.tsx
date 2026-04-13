import { screen } from '@testing-library/react'
import { vi } from 'vitest'

import { TeamPage } from './TeamPage'
import { ApiError } from '../../lib/api'
import { createAuthValue, createSession, renderWithProviders } from '../../test/utils'

const apiMock = vi.hoisted(() => ({
  getOrganization: vi.fn(),
  createInvite: vi.fn(),
}))

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  return {
    ...actual,
    api: {
      ...actual.api,
      getOrganization: apiMock.getOrganization,
      createInvite: apiMock.createInvite,
    },
  }
})

describe('TeamPage', () => {
  beforeEach(() => {
    apiMock.getOrganization.mockReset()
    apiMock.createInvite.mockReset()
  })

  it('renders current-team members and pending invites for customer admins', async () => {
    apiMock.getOrganization.mockResolvedValue({
      organizationId: 'org-1',
      name: 'North Tower Builders',
      slug: 'north-tower-builders',
      isActive: true,
      members: [
        {
          membershipId: 'membership-1',
          organizationId: 'org-1',
          role: 'customer_admin',
          isActive: true,
        },
        {
          membershipId: 'membership-2',
          organizationId: 'org-1',
          role: 'customer_viewer',
          isActive: true,
        },
      ],
      pendingInvites: [
        {
          inviteId: 'invite-1',
          organizationId: 'org-1',
          email: 'viewer@north.test',
          role: 'customer_viewer',
          expiresAt: '2026-04-21T10:00:00Z',
          acceptedAt: null,
          revokedAt: null,
        },
      ],
    })

    renderWithProviders(<TeamPage />, {
      auth: createAuthValue({
        session: createSession({
          memberships: [
            {
              membershipId: 'membership-1',
              organizationId: 'org-1',
              role: 'customer_admin',
              isActive: true,
            },
          ],
        }),
      }),
    })

    expect(await screen.findByText('North Tower Builders')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '邀請成員' })).toBeInTheDocument()
    expect(screen.getByText('viewer@north.test')).toBeInTheDocument()
    expect(screen.getByText('客戶管理員')).toBeInTheDocument()
    expect(screen.getAllByText('客戶檢視者').length).toBeGreaterThan(0)
  })

  it('keeps invite actions hidden for customer viewers', async () => {
    apiMock.getOrganization.mockResolvedValue({
      organizationId: 'org-1',
      name: 'North Tower Builders',
      slug: 'north-tower-builders',
      isActive: true,
      members: [
        {
          membershipId: 'membership-2',
          organizationId: 'org-1',
          role: 'customer_viewer',
          isActive: true,
        },
      ],
      pendingInvites: [],
    })

    renderWithProviders(<TeamPage />, {
      auth: createAuthValue({
        session: createSession({
          memberships: [
            {
              membershipId: 'membership-2',
              organizationId: 'org-1',
              role: 'customer_viewer',
              isActive: true,
            },
          ],
        }),
        canWriteOrganization: vi.fn(() => false),
      }),
    })

    expect(await screen.findByText('North Tower Builders')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '邀請成員' })).not.toBeInTheDocument()
    expect(screen.getByText('僅可檢視')).toBeInTheDocument()
  })

  it('shows a readable empty state when organization detail loading fails', async () => {
    apiMock.getOrganization.mockRejectedValue(new ApiError(403, 'forbidden_role'))

    renderWithProviders(<TeamPage />, {
      auth: createAuthValue({
        session: createSession({
          memberships: [
            {
              membershipId: 'membership-2',
              organizationId: 'org-1',
              role: 'customer_viewer',
              isActive: true,
            },
          ],
        }),
        canWriteOrganization: vi.fn(() => false),
      }),
    })

    expect(await screen.findByText('目前無法讀取團隊資料')).toBeInTheDocument()
    expect(screen.getByText('目前角色沒有執行這個操作的權限。')).toBeInTheDocument()
  })
})
