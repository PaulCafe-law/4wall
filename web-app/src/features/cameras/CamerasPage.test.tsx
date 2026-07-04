import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { CameraFrameImage, CamerasPage } from './CamerasPage'
import { renderWithProviders } from '../../test/utils'
import type { CameraDevice, CameraGaugeReading, CameraOcrObservation } from '../../lib/types'

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

function gaugeReadingFixture(overrides: Partial<CameraGaugeReading> = {}): CameraGaugeReading {
  return {
    readingId: 'reading-1',
    cameraId: 'camera-1',
    frameId: null,
    gaugeId: 'press_am_meter',
    label: 'PRESS AM METER',
    value: 3.9,
    unit: 'A',
    confidence: 0.91,
    rawPosition: 0.39,
    status: 'ok',
    source: 'live',
    capturedAt: '2026-07-03T01:00:00+08:00',
    receivedAt: '2026-07-03T01:00:01+08:00',
    metadata: {},
    ...overrides,
  }
}

function ocrObservationFixture(overrides: Partial<CameraOcrObservation> = {}): CameraOcrObservation {
  return {
    observationId: 'ocr-1',
    cameraId: 'camera-1',
    frameId: 'camera-1-frame',
    mode: 'machine_monitor',
    modeConfidence: 0.88,
    source: 'live',
    capturedAt: '2026-07-04T10:00:00+08:00',
    receivedAt: '2026-07-04T10:00:02+08:00',
    rawOcrLines: [{ text: '機器監視', confidence: 0.91, box: null, region: 'hmi' }],
    structuredFields: { screen: { kind: 'machine_monitor' } },
    workOrderRawText: 'HC600 FLJ2R02',
    gptSummary: { summary: 'HC600 目前為手動模式。' },
    summaryStatus: 'ok',
    summaryError: null,
    ...overrides,
  }
}

function cameraFixture(
  cameraId: string,
  name: string,
  options: {
    frameId?: string
    siteId?: string
    uploadStatus?: 'pending' | 'uploaded'
    uploadedFrameCount?: number
    latestGaugeReadings?: CameraGaugeReading[]
    latestOcrObservation?: CameraOcrObservation | null
  } = {},
): CameraDevice {
  const frameId = options.frameId ?? `${cameraId}-frame`
  const uploadStatus = options.uploadStatus ?? 'uploaded'
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
    uploadedFrameCount: options.uploadedFrameCount ?? 12,
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
      uploadStatus,
      analysisStatus: 'skipped',
      errorMessage: 'no_active_watch_zones',
      uploadExpiresAt: '2026-06-19T15:12:04Z',
      completedAt: '2026-06-19T14:57:05Z',
    },
    latestGaugeReadings: options.latestGaugeReadings ?? [],
    latestOcrObservation: options.latestOcrObservation ?? null,
    latestPersonObservation: null,
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

    expect(await screen.findByRole('heading', { level: 1, name: '即時截圖總覽' })).toBeInTheDocument()
    expect((await screen.findAllByText('PoE Camera')).length).toBeGreaterThan(0)
    const images = await screen.findAllByAltText('PoE Camera latest frame')
    expect(images[0]).toHaveAttribute('src', 'blob:camera-frame')
    expect(screen.getAllByText('skipped').length).toBeGreaterThan(0)

    await waitFor(() => {
      expect(apiMock.fetchCameraLatestFrameBlob).toHaveBeenCalledWith('test-token', 'camera-1')
    })
  })

  it('loads the latest uploaded image when the newest frame is still pending', async () => {
    const camera = cameraFixture('camera-1', 'PoE Camera 192.168.1.31', {
      frameId: 'pending-frame',
      uploadStatus: 'pending',
      uploadedFrameCount: 12,
    })

    renderWithProviders(<CameraFrameImage camera={camera} />)

    expect(await screen.findByAltText('PoE Camera 192.168.1.31 latest frame')).toHaveAttribute(
      'src',
      'blob:camera-frame',
    )

    await waitFor(() => {
      expect(apiMock.fetchCameraLatestFrameBlob).toHaveBeenCalledWith('test-token', 'camera-1')
    })
  })

  it('shows latest frame previews for every readable camera in the selected site', async () => {
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

    expect(await screen.findByText('場域攝影機')).toBeInTheDocument()
    expect(await screen.findAllByAltText('PoE Camera 192.168.1.10 latest frame')).not.toHaveLength(0)
    expect(await screen.findByAltText('PoE Camera 192.168.1.28 latest frame')).toBeInTheDocument()
    expect(await screen.findByAltText('PoE Camera 192.168.1.31 latest frame')).toBeInTheDocument()

    await waitFor(() => {
      expect(apiMock.fetchCameraLatestFrameBlob).toHaveBeenCalledWith('test-token', 'camera-1')
      expect(apiMock.fetchCameraLatestFrameBlob).toHaveBeenCalledWith('test-token', 'camera-2')
      expect(apiMock.fetchCameraLatestFrameBlob).toHaveBeenCalledWith('test-token', 'camera-3')
    })
  })

  it('only renders and loads frame previews for the selected field site', async () => {
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
    const user = userEvent.setup()

    renderWithProviders(
      <Routes>
        <Route path="/cameras" element={<CamerasPage />} />
      </Routes>,
      { route: '/cameras' },
    )

    const siteSelect = await screen.findByLabelText('場域')
    expect(siteSelect).toHaveValue('靚程工廠')
    expect(await screen.findByRole('heading', { level: 3, name: '靚程工廠' })).toBeInTheDocument()
    expect(screen.getByText('3 支攝影機')).toBeInTheDocument()
    expect(screen.getAllByText('PoE Camera 192.168.1.31').length).toBeGreaterThan(0)
    expect(screen.queryByRole('heading', { level: 3, name: '牙醫診所' })).not.toBeInTheDocument()
    expect(screen.queryByText('牙醫診所 AVTECH Ch6')).not.toBeInTheDocument()

    await waitFor(() => {
      expect(apiMock.fetchCameraLatestFrameBlob).toHaveBeenCalledWith('test-token', 'factory-1')
      expect(apiMock.fetchCameraLatestFrameBlob).toHaveBeenCalledWith('test-token', 'factory-2')
      expect(apiMock.fetchCameraLatestFrameBlob).toHaveBeenCalledWith('test-token', 'factory-3')
    })
    expect(apiMock.fetchCameraLatestFrameBlob).not.toHaveBeenCalledWith('test-token', 'dental-1')
    expect(apiMock.fetchCameraLatestFrameBlob).not.toHaveBeenCalledWith('test-token', 'dental-6')

    await user.selectOptions(siteSelect, '牙醫診所')

    expect(await screen.findByRole('heading', { level: 3, name: '牙醫診所' })).toBeInTheDocument()
    expect(screen.getByText('6 支攝影機')).toBeInTheDocument()
    expect(screen.getAllByText('牙醫診所 AVTECH Ch6').length).toBeGreaterThan(0)
    expect(screen.queryByText('PoE Camera 192.168.1.31')).not.toBeInTheDocument()

    await waitFor(() => {
      expect(apiMock.fetchCameraLatestFrameBlob).toHaveBeenCalledWith('test-token', 'dental-1')
      expect(apiMock.fetchCameraLatestFrameBlob).toHaveBeenCalledWith('test-token', 'dental-6')
    })
  })

  it('shows gauge readings beside the selected camera frame', async () => {
    apiMock.listCameras.mockResolvedValue({
      cameras: [
        cameraFixture('camera-1', 'PoE Camera 192.168.1.10', {
          latestGaugeReadings: [
            gaugeReadingFixture({ gaugeId: 'press_am_meter', label: 'PRESS AM METER', value: 3.9 }),
            gaugeReadingFixture({
              readingId: 'reading-2',
              gaugeId: 'flow_am_meter',
              label: 'FLOW AM METER',
              value: 4.2,
            }),
          ],
        }),
      ],
    })

    renderWithProviders(
      <Routes>
        <Route path="/cameras" element={<CamerasPage />} />
      </Routes>,
      { route: '/cameras' },
    )

    expect(await screen.findByText('機台儀表讀值')).toBeInTheDocument()
    expect(screen.getAllByText('PRESS AM METER').length).toBeGreaterThan(0)
    expect(screen.getAllByText('FLOW AM METER').length).toBeGreaterThan(0)
    expect(screen.getAllByText('3.90 A').length).toBeGreaterThan(0)
    expect(screen.getAllByText('4.20 A').length).toBeGreaterThan(0)
  })

  it('shows HMI OCR observation beside the selected camera frame', async () => {
    apiMock.listCameras.mockResolvedValue({
      cameras: [
        cameraFixture('camera-1', 'PoE Camera 192.168.1.10', {
          latestOcrObservation: ocrObservationFixture(),
        }),
      ],
    })

    renderWithProviders(
      <Routes>
        <Route path="/cameras" element={<CamerasPage />} />
      </Routes>,
      { route: '/cameras' },
    )

    expect(await screen.findByText('機器監視頁')).toBeInTheDocument()
    expect(screen.getByText('摘要完成')).toBeInTheDocument()
    expect(screen.getByText('HC600 目前為手動模式。')).toBeInTheDocument()
    expect(screen.getByText('HC600 FLJ2R02')).toBeInTheDocument()
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
    expect(screen.queryByText('載入最新截圖中')).not.toBeInTheDocument()
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
