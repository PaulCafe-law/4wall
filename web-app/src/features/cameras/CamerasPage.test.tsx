import { screen, waitFor } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { beforeAll, beforeEach, vi } from 'vitest'

import { CamerasPage } from './CamerasPage'
import { renderWithProviders } from '../../test/utils'

const apiMock = vi.hoisted(() => ({
  listCameras: vi.fn(),
  fetchCameraLatestFrameBlob: vi.fn(),
}))

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  return {
    ...actual,
    api: {
      ...actual.api,
      listCameras: apiMock.listCameras,
      fetchCameraLatestFrameBlob: apiMock.fetchCameraLatestFrameBlob,
    },
  }
})

const createObjectURLMock = vi.fn(() => 'blob:camera-frame')
const revokeObjectURLMock = vi.fn()

beforeAll(() => {
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURLMock })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURLMock })
})

describe('CamerasPage', () => {
  beforeEach(() => {
    apiMock.listCameras.mockReset()
    apiMock.fetchCameraLatestFrameBlob.mockReset()
    createObjectURLMock.mockClear()
    revokeObjectURLMock.mockClear()

    apiMock.listCameras.mockResolvedValue({
      cameras: [
        {
          cameraId: 'camera-1',
          organizationId: 'org-1',
          siteId: 'site-1',
          name: 'PoE Camera',
          status: 'active',
          rtspConfigured: true,
          samplingIntervalSeconds: 10,
          retentionDays: 7,
          localSpoolHours: 24,
          lastHeartbeatAt: new Date().toISOString(),
          lastFrameAt: new Date().toISOString(),
          lastError: null,
          uploadedFrameCount: 12,
          queuedFrameCount: 0,
          failedFrameCount: 0,
          latestFrame: {
            frameId: 'frame-1',
            cameraId: 'camera-1',
            capturedAt: '2026-06-19T14:57:04Z',
            storageKey: 'camera-frames/org-1/camera-1/frame-1.jpg',
            contentType: 'image/jpeg',
            checksumSha256: 'a'.repeat(64),
            sizeBytes: 128,
            width: 1280,
            height: 720,
            uploadStatus: 'uploaded',
            analysisStatus: 'skipped',
            errorMessage: 'no_active_watch_zones',
            uploadExpiresAt: '2026-06-19T15:12:04Z',
            completedAt: '2026-06-19T14:57:05Z',
          },
        },
      ],
    })
    apiMock.fetchCameraLatestFrameBlob.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }))
  })

  it('shows the latest uploaded camera frame', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/cameras" element={<CamerasPage />} />
      </Routes>,
      { route: '/cameras' },
    )

    expect(await screen.findByRole('heading', { level: 1, name: '固定攝影機' })).toBeInTheDocument()
    expect((await screen.findAllByText('PoE Camera')).length).toBeGreaterThan(0)
    expect(await screen.findByAltText('PoE Camera latest frame')).toHaveAttribute('src', 'blob:camera-frame')
    expect(screen.getAllByText('skipped').length).toBeGreaterThan(0)

    await waitFor(() => {
      expect(apiMock.fetchCameraLatestFrameBlob).toHaveBeenCalledWith('test-token', 'camera-1')
    })
  })

  it('shows an empty state when no cameras are readable', async () => {
    apiMock.listCameras.mockResolvedValue({ cameras: [] })

    renderWithProviders(
      <Routes>
        <Route path="/cameras" element={<CamerasPage />} />
      </Routes>,
      { route: '/cameras' },
    )

    expect(await screen.findByText('尚無攝影機')).toBeInTheDocument()
    expect(apiMock.fetchCameraLatestFrameBlob).not.toHaveBeenCalled()
  })
})
