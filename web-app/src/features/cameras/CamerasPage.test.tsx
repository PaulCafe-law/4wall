import { screen, waitFor } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { beforeAll, beforeEach, vi } from 'vitest'

import { CameraFrameImage, CamerasPage } from './CamerasPage'
import { renderWithProviders } from '../../test/utils'
import type { CameraDevice } from '../../lib/types'

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

function cameraFixture(
  cameraId: string,
  name: string,
  options: { frameId?: string; siteId?: string } = {},
): CameraDevice {
  const frameId = options.frameId ?? `${cameraId}-frame`
  return {
    cameraId,
    organizationId: 'org-1',
    siteId: options.siteId ?? 'site-1',
    name,
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
      frameId,
      cameraId,
      capturedAt: '2026-06-19T14:57:04Z',
      storageKey: `camera-frames/org-1/${cameraId}/${cameraId}-frame.jpg`,
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
  }
}

describe('CamerasPage', () => {
  beforeEach(() => {
    apiMock.listCameras.mockReset()
    apiMock.fetchCameraLatestFrameBlob.mockReset()
    createObjectURLMock.mockClear()
    revokeObjectURLMock.mockClear()

    apiMock.listCameras.mockResolvedValue({
      cameras: [cameraFixture('camera-1', 'PoE Camera')],
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
    const images = await screen.findAllByAltText('PoE Camera latest frame')
    expect(images[0]).toHaveAttribute('src', 'blob:camera-frame')
    expect(screen.getAllByText('skipped').length).toBeGreaterThan(0)

    await waitFor(() => {
      expect(apiMock.fetchCameraLatestFrameBlob).toHaveBeenCalledWith('test-token', 'camera-1')
    })
  })

  it('shows latest frame previews for every readable camera', async () => {
    apiMock.listCameras.mockResolvedValue({
      cameras: [
        cameraFixture('camera-1', 'PoE Camera 192.168.1.10'),
        cameraFixture('camera-2', 'PoE Camera 192.168.1.28'),
        cameraFixture('camera-3', 'PoE Camera 192.168.1.31'),
      ],
    })

    renderWithProviders(
      <Routes>
        <Route path="/cameras" element={<CamerasPage />} />
      </Routes>,
      { route: '/cameras' },
    )

    expect(await screen.findByText('即時截圖總覽')).toBeInTheDocument()
    expect(await screen.findAllByAltText('PoE Camera 192.168.1.10 latest frame')).not.toHaveLength(0)
    expect(await screen.findByAltText('PoE Camera 192.168.1.28 latest frame')).toBeInTheDocument()
    expect(await screen.findByAltText('PoE Camera 192.168.1.31 latest frame')).toBeInTheDocument()

    await waitFor(() => {
      expect(apiMock.fetchCameraLatestFrameBlob).toHaveBeenCalledWith('test-token', 'camera-1')
      expect(apiMock.fetchCameraLatestFrameBlob).toHaveBeenCalledWith('test-token', 'camera-2')
      expect(apiMock.fetchCameraLatestFrameBlob).toHaveBeenCalledWith('test-token', 'camera-3')
    })
  })

  it('groups the live frame overview by field site', async () => {
    apiMock.listCameras.mockResolvedValue({
      cameras: [
        ...Array.from({ length: 6 }, (_, index) =>
          cameraFixture(`dental-${index + 1}`, `牙醫診所 AVTECH Ch${index + 1}`, {
            siteId: 'fce8ab62e93843da961bbc751bf79176',
          }),
        ),
        cameraFixture('factory-1', 'PoE Camera 192.168.1.10', {
          siteId: 'dd6cbdd3aa744736ad96d2791d689fce',
        }),
        cameraFixture('factory-2', 'PoE Camera 192.168.1.28', {
          siteId: 'dd6cbdd3aa744736ad96d2791d689fce',
        }),
        cameraFixture('factory-3', 'PoE Camera 192.168.1.31', {
          siteId: 'dd6cbdd3aa744736ad96d2791d689fce',
        }),
      ],
    })

    renderWithProviders(
      <Routes>
        <Route path="/cameras" element={<CamerasPage />} />
      </Routes>,
      { route: '/cameras' },
    )

    expect(await screen.findByRole('heading', { level: 3, name: '牙醫診所' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 3, name: '靚程工廠' })).toBeInTheDocument()
    expect(screen.getByText('6 支攝影機')).toBeInTheDocument()
    expect(screen.getByText('3 支攝影機')).toBeInTheDocument()
    expect(screen.getAllByText('牙醫診所 AVTECH Ch6').length).toBeGreaterThan(0)
    expect(screen.getAllByText('PoE Camera 192.168.1.31').length).toBeGreaterThan(0)
  })

  it('keeps the previous frame visible while the next frame image is loading', async () => {
    createObjectURLMock.mockReturnValueOnce('blob:first-frame')
    apiMock.fetchCameraLatestFrameBlob
      .mockResolvedValueOnce(new Blob(['first'], { type: 'image/jpeg' }))
      .mockImplementationOnce(() => new Promise<Blob>(() => {}))

    const firstCamera = cameraFixture('camera-1', 'PoE Camera', { frameId: 'frame-1' })
    const nextCamera = cameraFixture('camera-1', 'PoE Camera', { frameId: 'frame-2' })

    const { rerender } = renderWithProviders(<CameraFrameImage camera={firstCamera} />)

    expect(await screen.findByAltText('PoE Camera latest frame')).toHaveAttribute('src', 'blob:first-frame')

    rerender(<CameraFrameImage camera={nextCamera} />)

    await waitFor(() => {
      expect(apiMock.fetchCameraLatestFrameBlob).toHaveBeenCalledTimes(2)
    })
    expect(screen.getByAltText('PoE Camera latest frame')).toHaveAttribute('src', 'blob:first-frame')
    expect(screen.queryByText('正在載入最新截圖。')).not.toBeInTheDocument()
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
