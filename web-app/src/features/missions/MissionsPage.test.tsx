import { screen } from '@testing-library/react'
import { vi } from 'vitest'

import { MissionsPage } from './MissionsPage'
import { renderWithProviders } from '../../test/utils'

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

  it('renders patrol-route summary and operating profile', async () => {
    apiMock.listMissions.mockResolvedValue([
      {
        missionId: 'mission-001',
        organizationId: 'org-001',
        siteId: 'site-001',
        missionName: 'Tower A Patrol',
        status: 'ready',
        bundleVersion: '1.1.0',
        operatingProfile: 'outdoor_gps_patrol',
        launchPoint: {
          label: 'L1',
          location: { lat: 25.03391, lng: 121.56452 },
        },
        waypointCount: 3,
        implicitReturnToLaunch: true,
        deliveryStatus: 'ready',
        publishedAt: '2026-04-19T08:30:00Z',
        failureReason: null,
        reportStatus: 'ready',
        reportGeneratedAt: '2026-04-19T08:45:00Z',
        eventCount: 0,
        createdAt: '2026-04-19T08:00:00Z',
      },
    ])

    renderWithProviders(<MissionsPage />)

    expect(await screen.findByText('Tower A Patrol')).toBeInTheDocument()
    expect(screen.getByText('戶外 GPS 巡邏')).toBeInTheDocument()
    expect(
      screen.getByText('起降點 L / 25.03391, 121.56452 / 3 個航點 / 含隱式返航'),
    ).toBeInTheDocument()
  })
})
