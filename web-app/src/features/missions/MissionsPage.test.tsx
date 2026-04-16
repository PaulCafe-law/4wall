import { screen } from '@testing-library/react'
import { vi } from 'vitest'

import { MissionsPage } from './MissionsPage'
import { createAuthValue, renderWithProviders } from '../../test/utils'

const apiMock = vi.hoisted(() => ({
  listMissions: vi.fn(),
}))

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  return {
    ...actual,
    api: {
      ...actual.api,
      listMissions: apiMock.listMissions,
    },
  }
})

describe('MissionsPage', () => {
  beforeEach(() => {
    apiMock.listMissions.mockReset()
  })

  it('renders delivery-oriented mission summaries in the list', async () => {
    apiMock.listMissions.mockResolvedValue([
      {
        missionId: 'mission-failed',
        organizationId: 'org-001',
        siteId: 'site-001',
        missionName: 'Tower A Failed',
        status: 'failed',
        bundleVersion: 'bundle-failed',
        deliveryStatus: 'failed',
        publishedAt: null,
        failureReason: 'Route provider timed out for this site.',
        createdAt: '2026-04-15T08:00:00Z',
      },
      {
        missionId: 'mission-published',
        organizationId: 'org-001',
        siteId: 'site-001',
        missionName: 'Tower A Published',
        status: 'ready',
        bundleVersion: 'bundle-published',
        deliveryStatus: 'published',
        publishedAt: '2026-04-15T07:00:00Z',
        failureReason: null,
        createdAt: '2026-04-15T07:00:00Z',
      },
      {
        missionId: 'mission-planning',
        organizationId: 'org-001',
        siteId: 'site-001',
        missionName: 'Tower A Planning',
        status: 'planning',
        bundleVersion: 'bundle-planning',
        deliveryStatus: 'planning',
        publishedAt: null,
        failureReason: null,
        createdAt: '2026-04-15T06:00:00Z',
      },
    ])

    renderWithProviders(<MissionsPage />, {
      auth: createAuthValue(),
    })

    expect(await screen.findByText('Tower A Failed')).toBeInTheDocument()
    expect(screen.getByText('Tower A Published')).toBeInTheDocument()
    expect(screen.getByText('Tower A Planning')).toBeInTheDocument()
    expect(screen.getByText('Route provider timed out for this site.')).toBeInTheDocument()
    expect(screen.getByText('任務')).toBeInTheDocument()
    expect(screen.getByText('1 筆任務已經完成交付')).toBeInTheDocument()
    expect(document.querySelectorAll('a[href^="/missions/mission-"]').length).toBe(3)
  })
})
