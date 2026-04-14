import { fireEvent, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

import { TeamPage } from './TeamPage'
import { ApiError } from '../../lib/api'
import { createAuthValue, createSession, renderWithProviders } from '../../test/utils'

const apiMock = vi.hoisted(() => ({
  getOrganization: vi.fn(),
  updateOrganization: vi.fn(),
  updateMembership: vi.fn(),
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
      updateOrganization: apiMock.updateOrganization,
      updateMembership: apiMock.updateMembership,
      createInvite: apiMock.createInvite,
      revokeInvite: apiMock.revokeInvite,
    },
  }
})

function buildOrganizationDetail(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: 'org-1',
    name: 'North Tower Builders',
    slug: 'north-tower-builders',
    isActive: true,
    members: [
      {
        membershipId: 'membership-1',
        organizationId: 'org-1',
        userId: 'user-1',
        email: 'admin@north.test',
        displayName: 'North Admin',
        role: 'customer_admin',
        isActive: true,
      },
      {
        membershipId: 'membership-2',
        organizationId: 'org-1',
        userId: 'user-2',
        email: 'viewer@north.test',
        displayName: 'North Viewer',
        role: 'customer_viewer',
        isActive: true,
      },
    ],
    pendingInvites: [
      {
        inviteId: 'invite-1',
        organizationId: 'org-1',
        email: 'pending@north.test',
        role: 'customer_viewer',
        expiresAt: '2026-04-21T10:00:00Z',
        acceptedAt: null,
        revokedAt: null,
      },
    ],
    ...overrides,
  }
}

describe('TeamPage', () => {
  beforeEach(() => {
    apiMock.getOrganization.mockReset()
    apiMock.updateOrganization.mockReset()
    apiMock.updateMembership.mockReset()
    apiMock.createInvite.mockReset()
    apiMock.revokeInvite.mockReset()
  })

  it('renders organization settings, members, and pending invites for customer admins', async () => {
    apiMock.getOrganization.mockResolvedValue(buildOrganizationDetail())

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
    expect(screen.getByDisplayValue('North Tower Builders')).toBeInTheDocument()
    expect(screen.getByText('North Admin')).toBeInTheDocument()
    expect(screen.getByText('viewer@north.test')).toBeInTheDocument()
    expect(screen.getByText('pending@north.test')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'invite-team-member' })).toBeInTheDocument()
  })

  it('lets customer admins update organization settings, members, and invites', async () => {
    apiMock.getOrganization.mockResolvedValue(buildOrganizationDetail())
    apiMock.updateOrganization.mockResolvedValue({
      organizationId: 'org-1',
      name: 'North Tower Group',
      slug: 'north-tower-builders',
      memberCount: 2,
      siteCount: 0,
    })
    apiMock.updateMembership.mockResolvedValue({
      membershipId: 'membership-2',
      organizationId: 'org-1',
      userId: 'user-2',
      email: 'viewer@north.test',
      displayName: 'North Viewer',
      role: 'customer_admin',
      isActive: false,
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

    fireEvent.change(screen.getByLabelText('organization-name'), {
      target: { value: 'North Tower Group' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'save-organization' }))

    await waitFor(() => {
      expect(apiMock.updateOrganization).toHaveBeenCalledWith('test-token', 'org-1', {
        name: 'North Tower Group',
      })
    })

    fireEvent.change(screen.getByLabelText('member-role-membership-2'), {
      target: { value: 'customer_admin' },
    })
    fireEvent.change(screen.getByLabelText('member-status-membership-2'), {
      target: { value: 'inactive' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'save-member-membership-2' }))

    await waitFor(() => {
      expect(apiMock.updateMembership).toHaveBeenCalledWith('test-token', 'org-1', 'membership-2', {
        role: 'customer_admin',
        isActive: false,
      })
    })

    fireEvent.click(screen.getByRole('button', { name: 'invite-team-member' }))
    fireEvent.change(await screen.findByLabelText('invite-email'), {
      target: { value: 'new@north.test' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'submit-invite' }))

    await waitFor(() => {
      expect(apiMock.createInvite).toHaveBeenCalledWith('test-token', 'org-1', {
        email: 'new@north.test',
        role: 'customer_viewer',
      })
    })

    const inviteLinkInput = (await screen.findByLabelText('invite-link')) as HTMLInputElement
    expect(inviteLinkInput.value).toContain('/invite?token=invite-token-2')
  })

  it('allows customer admins to revoke pending invites', async () => {
    apiMock.getOrganization.mockResolvedValue(buildOrganizationDetail())
    apiMock.revokeInvite.mockResolvedValue({
      inviteId: 'invite-1',
      organizationId: 'org-1',
      email: 'pending@north.test',
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

  it('shows the last-admin guard when a mutation would remove the final active customer admin', async () => {
    apiMock.getOrganization.mockResolvedValue(
      buildOrganizationDetail({
        members: [
          {
            membershipId: 'membership-1',
            organizationId: 'org-1',
            userId: 'user-1',
            email: 'admin@north.test',
            displayName: 'North Admin',
            role: 'customer_admin',
            isActive: true,
          },
        ],
        pendingInvites: [],
      }),
    )
    apiMock.updateMembership.mockRejectedValue(new ApiError(409, 'organization_requires_customer_admin'))

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

    expect(await screen.findByText('North Admin')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('member-role-membership-1'), {
      target: { value: 'customer_viewer' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'save-member-membership-1' }))

    expect(await screen.findByText('每個組織至少需要一位啟用中的管理者。')).toBeInTheDocument()
  })

  it('keeps management actions read-only for customer viewers', async () => {
    apiMock.getOrganization.mockResolvedValue(buildOrganizationDetail())

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
    expect(screen.getByRole('button', { name: 'save-organization' })).toBeDisabled()
    expect(screen.queryByLabelText('member-role-membership-1')).not.toBeInTheDocument()
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
