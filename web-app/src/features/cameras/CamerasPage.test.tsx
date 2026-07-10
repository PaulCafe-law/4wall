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

function workOrderSheetFixture() {
  const unknown = { value: 'unknown', confidence: 0, rawText: '' }
  return {
    template: 'hc600_dispatch_sheet_v1',
    unit: 'PCS',
    sourceLineCount: 56,
    stabilized: true,
    fields: {
      machineNo: { label: '機台編號', value: 'HC600', confidence: 0.82, rawText: 'HC600' },
      moldNo: { label: '模具編號', value: 'GM096LC', confidence: 0.78, rawText: 'GM096LC' },
      productionDate: { label: '生產日期', value: '115年', confidence: 0.9, rawText: '生日期 115' },
      moldCavity: { label: '模具穴數', value: '1模2穴', confidence: 0.77, rawText: '以穴 1 積 2穴' },
      material: { label: '材質', value: 'PC', confidence: 0.6, rawText: 'PC' },
      color: { label: '顏色', value: '透明', confidence: 0.99, rawText: '明' },
      packaging: { label: '包裝方式', ...unknown },
      shipDate: { label: '出貨日期', ...unknown },
      remark: { label: '備註', ...unknown },
    },
    quantities: {
      plannedWithHanger: { label: '預計生產數（有掛）', left: { ...unknown, rawText: '200 1uwr2' }, right: { ...unknown, rawText: '20 10Y' } },
      plannedScheduledNoHanger: { label: '預計生產數（有排程、無掛）', left: unknown, right: unknown },
      plannedNoHanger: { label: '預計生產數（無掛）', left: { value: 10, confidence: 1, rawText: '10' }, right: { value: 10, confidence: 0.95, rawText: '10' } },
      total: { label: '總計', left: { value: 210, confidence: 0.95, rawText: '210' }, right: { value: 210, confidence: 0.97, rawText: '210' } },
    },
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
    expect((await screen.findAllByText('現場攝影機 1')).length).toBeGreaterThan(0)
    const images = await screen.findAllByAltText('現場攝影機 1 最新畫面')
    expect(images[0]).toHaveAttribute('src', 'blob:camera-frame')
    expect(screen.getAllByText('連線中').length).toBeGreaterThan(1)
    expect(screen.getAllByText('略過分析').length).toBeGreaterThan(0)

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

    expect(await screen.findByAltText('PoE Camera 192.168.1.31 最新畫面')).toHaveAttribute(
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
    expect(await screen.findAllByAltText('儀表板攝影機 最新畫面')).not.toHaveLength(0)
    expect(await screen.findByAltText('桌面分類攝影機 最新畫面')).toBeInTheDocument()
    expect(await screen.findByAltText('機台周遭攝影機 最新畫面')).toBeInTheDocument()

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
    expect(screen.getAllByText('機台周遭攝影機').length).toBeGreaterThan(0)
    expect(screen.queryByText('PoE Camera 192.168.1.31')).not.toBeInTheDocument()
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
    expect(screen.queryByText('機台周遭攝影機')).not.toBeInTheDocument()

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

  it('uses customer-facing copy when a camera has no machine-screen observation', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/cameras" element={<CamerasPage />} />
      </Routes>,
      { route: '/cameras' },
    )

    expect(await screen.findByText('尚無機台畫面辨識')).toBeInTheDocument()
    expect(screen.getByText('這支攝影機尚未送回可辨識的機台畫面或派工單資訊。')).toBeInTheDocument()
    expect(screen.queryByText(/nckusoc/i)).not.toBeInTheDocument()
    expect(screen.queryByText('no_active_watch_zones')).not.toBeInTheDocument()
  })

  it('renders the structured 派工單 as a paper-form table with unknown cells left blank', async () => {
    apiMock.listCameras.mockResolvedValue({
      cameras: [
        cameraFixture('camera-1', 'PoE Camera 192.168.1.10', {
          latestOcrObservation: ocrObservationFixture({
            structuredFields: {
              screen: { kind: 'machine_monitor' },
              workOrder: workOrderSheetFixture(),
            },
          }),
        }),
      ],
    })

    renderWithProviders(
      <Routes>
        <Route path="/cameras" element={<CamerasPage />} />
      </Routes>,
      { route: '/cameras' },
    )

    expect(await screen.findByText('機台編號')).toBeInTheDocument()
    expect(screen.getByText('HC600')).toBeInTheDocument()
    expect(screen.getByText('GM096LC')).toBeInTheDocument()
    expect(screen.getByText('1模2穴')).toBeInTheDocument()
    expect(screen.getByText('透明')).toBeInTheDocument()
    expect(screen.getAllByText('210')).toHaveLength(2)
    expect(screen.getByText('總計')).toBeInTheDocument()
    // Unreadable handwriting and out-of-crop fields render as blank dashes.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(5)
    // material 信心 0.6 < 0.75 → 灰色斜體＋「待確認」；高信心欄位不受影響。
    expect(screen.getAllByText('待確認')).toHaveLength(1)
    expect(screen.getByText('PC').closest('span')).toHaveClass('italic')
    expect(screen.getByText('HC600').closest('span')).not.toHaveClass('italic')
    expect(screen.getByText('數字為自動辨識，以現場單據為準。')).toBeInTheDocument()
  })

  it('keeps the previous frame visible while the next frame image is loading', async () => {
    createObjectURLMock.mockReturnValueOnce('blob:first-frame')
    apiMock.fetchCameraLatestFrameBlob
      .mockResolvedValueOnce(new Blob(['first'], { type: 'image/jpeg' }))
      .mockImplementationOnce(() => new Promise<Blob>(() => {}))

    const firstCamera = cameraFixture('camera-1', 'PoE Camera', { frameId: 'frame-1' })
    const nextCamera = cameraFixture('camera-1', 'PoE Camera', { frameId: 'frame-2' })

    const { rerender } = renderWithProviders(<CameraFrameImage camera={firstCamera} />)

    expect(await screen.findByAltText('PoE Camera 最新畫面')).toHaveAttribute('src', 'blob:first-frame')

    rerender(<CameraFrameImage camera={nextCamera} />)

    await waitFor(() => {
      expect(apiMock.fetchCameraLatestFrameBlob).toHaveBeenCalledTimes(2)
    })
    expect(screen.getByAltText('PoE Camera 最新畫面')).toHaveAttribute('src', 'blob:first-frame')
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

  it('shows loading in summary metrics instead of initial zero values', () => {
    apiMock.listCameras.mockReturnValueOnce(new Promise(() => {}))

    renderWithProviders(
      <Routes><Route path="/cameras" element={<CamerasPage />} /></Routes>,
      { route: '/cameras' },
    )

    expect(screen.getAllByText('載入中').length).toBeGreaterThanOrEqual(4)
    expect(screen.queryByText(/^0$/)).not.toBeInTheDocument()
  })

  it('marks an old frame as stale and states when it last updated', async () => {
    const staleAt = new Date(Date.now() - 5 * 60_000).toISOString()
    const camera = cameraFixture('camera-stale', 'PoE Camera 192.168.1.31')
    camera.lastHeartbeatAt = staleAt
    camera.lastFrameAt = staleAt
    if (camera.latestFrame) camera.latestFrame.capturedAt = staleAt
    apiMock.listCameras.mockResolvedValueOnce({ cameras: [camera] })

    renderWithProviders(
      <Routes><Route path="/cameras" element={<CamerasPage />} /></Routes>,
      { route: '/cameras' },
    )

    expect((await screen.findAllByText('資料已過期，最近一次在 5 分鐘前')).length).toBeGreaterThan(0)
  })
})
