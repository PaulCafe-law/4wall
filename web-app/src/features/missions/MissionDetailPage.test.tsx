import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'

import { MissionDetailPage } from './MissionDetailPage'
import { createAuthValue, renderWithProviders } from '../../test/utils'

const apiMock = vi.hoisted(() => ({
  getMission: vi.fn(),
}))

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  return {
    ...actual,
    api: {
      ...actual.api,
      getMission: apiMock.getMission,
    },
  }
})

describe('MissionDetailPage', () => {
  beforeEach(() => {
    apiMock.getMission.mockReset()
  })

  it('renders published delivery state with artifact publication metadata', async () => {
    apiMock.getMission.mockResolvedValue({
      missionId: 'mission-001',
      organizationId: 'org-001',
      siteId: 'site-001',
      requestedByUserId: 'user-001',
      missionName: 'Tower A Delivery',
      status: 'ready',
      bundleVersion: 'bundle-v3',
      request: { missionName: 'Tower A Delivery' },
      response: { missionId: 'mission-001' },
      delivery: {
        state: 'published',
        publishedAt: '2026-04-14T10:15:00Z',
        failureReason: null,
      },
      artifacts: [
        {
          artifactName: 'mission.kmz',
          downloadUrl: '/v1/missions/mission-001/artifacts/mission.kmz',
          version: 3,
          checksumSha256: 'abc123',
          contentType: 'application/vnd.google-earth.kmz',
          sizeBytes: 1024,
          cacheControl: 'private, max-age=60',
          publishedAt: '2026-04-14T10:15:00Z',
        },
        {
          artifactName: 'mission_meta.json',
          downloadUrl: '/v1/missions/mission-001/artifacts/mission_meta.json',
          version: 3,
          checksumSha256: 'def456',
          contentType: 'application/json',
          sizeBytes: 2048,
          cacheControl: 'private, max-age=60',
          publishedAt: '2026-04-14T10:15:00Z',
        },
      ],
      createdAt: '2026-04-14T10:00:00Z',
    })

    renderWithProviders(
      <Routes>
        <Route path="/missions/:missionId" element={<MissionDetailPage />} />
      </Routes>,
      {
        route: '/missions/mission-001',
        auth: createAuthValue(),
      },
    )

    expect(await screen.findByText('Tower A Delivery')).toBeInTheDocument()
    expect(screen.getAllByText('成果已可交付').length).toBeGreaterThan(0)
    expect(screen.getAllByText('最新成果檔已完成發布，可直接下載 mission.kmz 與 metadata。').length).toBeGreaterThan(0)
    expect(screen.getAllByText('已發布').length).toBeGreaterThan(0)
    expect(screen.getAllByText('mission.kmz').length).toBeGreaterThan(0)
    expect(screen.getAllByText('mission_meta.json').length).toBeGreaterThan(0)
  })

  it('renders failure reason when delivery generation failed', async () => {
    apiMock.getMission.mockResolvedValue({
      missionId: 'mission-002',
      organizationId: 'org-001',
      siteId: 'site-001',
      requestedByUserId: 'user-001',
      missionName: 'Tower B Delivery',
      status: 'failed',
      bundleVersion: 'bundle-v4',
      request: { missionName: 'Tower B Delivery' },
      response: { failureReason: 'Route provider timed out for this site.' },
      delivery: {
        state: 'failed',
        publishedAt: null,
        failureReason: 'Route provider timed out for this site.',
      },
      artifacts: [],
      createdAt: '2026-04-14T11:00:00Z',
    })

    renderWithProviders(
      <Routes>
        <Route path="/missions/:missionId" element={<MissionDetailPage />} />
      </Routes>,
      {
        route: '/missions/mission-002',
        auth: createAuthValue(),
      },
    )

    expect(await screen.findByText('Tower B Delivery')).toBeInTheDocument()
    expect(screen.getAllByText('Route provider timed out for this site.').length).toBeGreaterThan(0)
    expect(screen.getAllByText('尚未發布').length).toBeGreaterThan(0)
  })
})
