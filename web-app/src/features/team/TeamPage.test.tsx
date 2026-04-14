import { fireEvent, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

import { TeamPage } from './TeamPage'
import { ApiError } from '../../lib/api'
import { createAuthValue, createSession, renderWithProviders } from '../../test/utils'

const apiMock = vi.hoisted(() => ({
  getOrganization: vi.fn(),
  createInvite: vi.fn(),
  revokeInvite: vi.fn(),
}))

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  return {
    ...actual,
    api: {
      ...actual.api,
      getOrganization: apiMock.getOrganization,
      createInvite: apiMock.createInvite,
      revokeInvite: apiMock.revokeInvite,
    },
  }
})

describe('TeamPage', () => {
  beforeEach(() => {
    apiMock.getOrganization.mockReset()
    apiMock.createInvite.mockReset()
    apiMock.revokeInvite.mockReset()
  })

  it('renders team detail and pending invites for customer admins', async () => {
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
    expect(screen.getByRole('button', { name: 'invite-team-member' })).toBeInTheDocument()
    expect(screen.getByText('viewer@north.test')).toBeInTheDocument()
    expect(screen.getByText('客戶管理員')).toBeInTheDocument()
    expect(screen.getAllByText('客戶檢視者').length).toBeGreaterThan(0)
  })

  it('shows a shareable invite link after creating an invite', async () => {
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
      ],
      pendingInvites: [],
    })
    apiMock.createInvite.mockResolvedValue({
      invite: {
        inviteId: 'invite-2',
        organizationId: 'org-1',
        email: 'new@north.test',
        role: 'customer_viewer',
        expiresAt: '2026-04-22T10:00:00Z',
        acceptedAt: null,
        revokedAt: null,
      },
      inviteToken: 'invite-token-2',
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

    fireEvent.click(screen.getByRole('button', { name: 'invite-team-member' }))

    const emailInput = await screen.findByLabelText('invite-email')
    const roleSelect = screen.getByLabelText('invite-role')
    const submitButton = screen.getByRole('button', { name: 'submit-invite' })

    fireEvent.change(emailInput, { target: { value: 'new@north.test' } })
    fireEvent.change(roleSelect, { target: { value: 'customer_viewer' } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(apiMock.createInvite).toHaveBeenCalledWith('test-token', 'org-1', {
        email: 'new@north.test',
        role: 'customer_viewer',
      })
    })

    const inviteLinkInput = (await screen.findByLabelText('invite-link')) as HTMLInputElement
    expect(inviteLinkInput.value).toContain('/invite?token=invite-token-2')
    expect(screen.getByText('已建立可分享的邀請連結')).toBeInTheDocument()
  })

  it('allows customer admins to revoke pending invites', async () => {
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
    apiMock.revokeInvite.mockResolvedValue({
      inviteId: 'invite-1',
      organizationId: 'org-1',
      email: 'viewer@north.test',
      role: 'customer_viewer',
      expiresAt: '2026-04-21T10:00:00Z',
      acceptedAt: null,
      revokedAt: '2026-04-15T01:00:00Z',
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

    fireEvent.click(screen.getByRole('button', { name: 'revoke-invite-invite-1' }))

    await waitFor(() => {
      expect(apiMock.revokeInvite).toHaveBeenCalledWith('test-token', 'invite-1')
    })
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
    expect(screen.queryByRole('button', { name: 'invite-team-member' })).not.toBeInTheDocument()
    expect(screen.getByText('僅能檢視')).toBeInTheDocument()
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

    expect(await screen.findByText('無法載入團隊資料')).toBeInTheDocument()
    expect(screen.getByText('目前角色沒有執行這個操作的權限。')).toBeInTheDocument()
  })
})
