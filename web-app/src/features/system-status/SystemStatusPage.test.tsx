import { screen, waitFor, within } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'

import type { CameraDevice } from '../../lib/types'
import { renderWithProviders } from '../../test/utils'
import { SystemStatusPage } from './SystemStatusPage'

const apiMock = vi.hoisted(() => ({
  getHealth: vi.fn(),
  listCameras: vi.fn(),
  getTwinAgentStatus: vi.fn(),
}))

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  return { ...actual, api: { ...actual.api, ...apiMock } }
})

function cameraFixture(updatedAt: string): CameraDevice {
  return {
    cameraId: 'camera-1',
    organizationId: 'org-1',
    siteId: 'site-1',
    name: 'PoE Camera 192.168.1.31',
    status: 'active',
    rtspConfigured: true,
    samplingIntervalSeconds: 10,
    retentionDays: 7,
    localSpoolHours: 24,
    lastHeartbeatAt: updatedAt,
    lastFrameAt: updatedAt,
    lastError: null,
    uploadedFrameCount: 1,
    queuedFrameCount: 0,
    failedFrameCount: 0,
    latestFrame: null,
    latestGaugeReadings: [],
    latestOcrObservation: {
      observationId: 'ocr-1',
      cameraId: 'camera-1',
      frameId: null,
      mode: 'machine_monitor',
      modeConfidence: 0.9,
      source: 'live',
      capturedAt: updatedAt,
      receivedAt: updatedAt,
      rawOcrLines: [],
      structuredFields: {},
      workOrderRawText: null,
      gptSummary: {},
      summaryStatus: 'ok',
      summaryError: null,
    },
    latestPersonObservation: null,
  }
}

function renderPage() {
  return renderWithProviders(
    <Routes><Route path="/system-status" element={<SystemStatusPage />} /></Routes>,
    { route: '/system-status' },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  const now = new Date().toISOString()
  apiMock.getHealth.mockResolvedValue({ status: 'ok', dependencies: { database: { status: 'ok' } } })
  apiMock.listCameras.mockResolvedValue({ cameras: [cameraFixture(now)] })
  apiMock.getTwinAgentStatus.mockResolvedValue({
    enabled: true,
    workerOnline: true,
    workerLastSeenSeconds: 2,
    snapshotAvailable: true,
    snapshotAgeSeconds: 2,
    snapshotCapturedAt: now,
  })
})

it('shows five independent healthy checks without infrastructure details', async () => {
  renderPage()

  expect(await screen.findByRole('heading', { level: 1, name: '現場服務狀態' })).toBeInTheDocument()
  await waitFor(() => {
    for (const id of ['website', 'cameras', 'recognition', 'assistant', 'database']) {
      expect(within(screen.getByTestId(`status-${id}`)).getByText('正常')).toBeInTheDocument()
    }
  })
  expect(screen.getByText('目前所有項目都正常。')).toBeInTheDocument()
  expect(screen.queryByText(/192\.168\./)).not.toBeInTheDocument()
})

it('shows loading instead of zero before the first camera response', () => {
  apiMock.listCameras.mockReturnValue(new Promise(() => {}))
  renderPage()

  expect(within(screen.getByTestId('status-cameras')).getByText('載入中')).toBeInTheDocument()
  expect(within(screen.getByTestId('status-recognition')).getByText('載入中')).toBeInTheDocument()
  expect(screen.queryByText(/0 支攝影機|0 人/)).not.toBeInTheDocument()
})

it('labels stale recognition and assistant evidence with the last update age', async () => {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000).toISOString()
  apiMock.listCameras.mockResolvedValue({ cameras: [cameraFixture(fiveMinutesAgo)] })
  apiMock.getTwinAgentStatus.mockResolvedValue({
    enabled: true,
    workerOnline: true,
    workerLastSeenSeconds: 2,
    snapshotAvailable: true,
    snapshotAgeSeconds: 120,
    snapshotCapturedAt: new Date(Date.now() - 120_000).toISOString(),
  })

  renderPage()

  expect(await within(screen.getByTestId('status-recognition')).findByText('辨識資料已過期')).toBeInTheDocument()
  expect(within(screen.getByTestId('status-recognition')).getByText('最近一次在 5 分鐘前')).toBeInTheDocument()
  expect(within(screen.getByTestId('status-assistant')).getByText('現場資料已過期')).toBeInTheDocument()
  expect(within(screen.getByTestId('status-assistant')).getByText('最近一次在 2 分鐘前')).toBeInTheDocument()
})
