import { act, fireEvent, screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LineFloorplanMobilePage } from './LineFloorplanMobilePage'
import { renderWithProviders } from '../../test/utils'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('LineFloorplanMobilePage', () => {
  it('shows the LINE reopen prompt when the token is missing', async () => {
    renderPage('/m/floorplan/jingcheng')

    expect(await screen.findByText('請回 LINE 重新開啟')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('renders state geometry without a logged-in session', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(stateFixture()))

    renderPage('/m/floorplan/jingcheng?token=live-token')

    expect(await screen.findByText('靚程工廠')).toBeInTheDocument()
    expect(await screen.findByText('HC600-01')).toBeInTheDocument()
    expect(screen.getByTestId('machine-m-hc600')).toHaveAttribute('data-status', 'green')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/v1/line/floorplan/jingcheng/state?token=live-token',
      { credentials: 'omit' },
    )
  })

  it('opens the bottom sheet with machine detail after tapping a machine', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/machine/m-hc600')) {
        return Promise.resolve(jsonResponse(machineDetailFixture()))
      }
      return Promise.resolve(jsonResponse(stateFixture()))
    })

    renderPage('/m/floorplan/jingcheng?token=live-token')

    fireEvent.click(await screen.findByTestId('machine-m-hc600'))

    expect(await screen.findByText('今日異常 2 件')).toBeInTheDocument()
    expect(await screen.findByText('溫度監視')).toBeInTheDocument()
    expect(screen.getByText('設定')).toBeInTheDocument()
    expect(screen.getByText('一段')).toBeInTheDocument()
    expect(screen.getByText('180 °C')).toBeInTheDocument()
    expect(screen.getByText('模具保溫中')).toBeInTheDocument()
    expect(screen.getByText(/拍攝/)).toHaveAttribute('datetime', '2026-07-04T09:19:30+08:00')
    expect(screen.queryByText('PRESS')).not.toBeInTheDocument()
    const thumbnail = screen.getByRole('img', { name: /HC600-01/ })
    expect(thumbnail).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(screen.getByAltText('HC600-01 最新截圖')).toHaveAttribute(
      'src',
      'https://signed.example.test/thumb.jpg',
    )
  })

  it('shows a deterministic message when HC600-01 has no fresh HMI evidence', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/machine/m-hc600')) {
        return Promise.resolve(jsonResponse(machineDetailFixture({ hmiScreen: null, gauges: [gaugeFixture()] })))
      }
      return Promise.resolve(jsonResponse(stateFixture()))
    })

    renderPage('/m/floorplan/jingcheng?token=live-token')

    fireEvent.click(await screen.findByTestId('machine-m-hc600'))

    expect(
      await screen.findByText('HC600-01 目前沒有 3 分鐘內可確認的螢幕資訊。'),
    ).toBeInTheDocument()
    expect(screen.queryByText('PRESS')).not.toBeInTheDocument()
  })

  it('shows unavailable machines without requesting their detail endpoint', async () => {
    const state = stateFixture()
    state.machines.push({
      id: 'm-hc600-002',
      label: 'HC600-02',
      rect: { x: 580, y: 430, width: 110, height: 72 },
      point: { x: 635, y: 466 },
      status: 'gray',
      gauges: [],
      lineEnabled: false,
    })
    fetchMock.mockResolvedValueOnce(jsonResponse(state))

    renderPage('/m/floorplan/jingcheng?token=live-token')

    fireEvent.click(await screen.findByTestId('machine-m-hc600-002'))

    expect(await screen.findByText('HC600-02 尚未開通。')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('polls state every ten seconds and updates machine status', async () => {
    vi.useFakeTimers()
    fetchMock
      .mockResolvedValueOnce(jsonResponse(stateFixture({ machineStatus: 'green' })))
      .mockResolvedValueOnce(jsonResponse(stateFixture({ machineStatus: 'red' })))

    renderPage('/m/floorplan/jingcheng?token=live-token')

    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByTestId('machine-m-hc600')).toHaveAttribute('data-status', 'green')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })

    expect(screen.getByTestId('machine-m-hc600')).toHaveAttribute('data-status', 'red')
  })

  it('uses focus to highlight an incident and open the related machine', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/machine/m-hc600')) {
        return Promise.resolve(jsonResponse(machineDetailFixture()))
      }
      return Promise.resolve(jsonResponse(stateFixture()))
    })

    renderPage('/m/floorplan/jingcheng?token=live-token&focus=incident%3Aincident-1')

    expect(await screen.findByTestId('incident-incident-1')).toBeInTheDocument()
    expect(await screen.findByText('今日異常 2 件')).toBeInTheDocument()
  })

  it('shows the LINE reopen prompt when the token is rejected', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'invalid_floorplan_token' }, 403))

    renderPage('/m/floorplan/jingcheng?token=expired-token')

    expect(await screen.findByText('請回 LINE 重新開啟')).toBeInTheDocument()
  })
})

function renderPage(route: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/m/floorplan/:siteSlug" element={<LineFloorplanMobilePage />} />
    </Routes>,
    { route },
  )
}

function stateFixture({ machineStatus = 'green' }: { machineStatus?: string } = {}) {
  return {
    siteSlug: 'jingcheng',
    siteName: '靚程工廠',
    serverTime: '2026-07-04T09:20:00+08:00',
    canvas: { width: 1040, height: 700 },
    zones: [{ id: 'z-molding', label: 'HC600 成型區', rect: { x: 420, y: 390, width: 220, height: 140 } }],
    machines: [
      {
        id: 'm-hc600',
        label: 'HC600-01',
        rect: { x: 465, y: 430, width: 110, height: 72 },
        point: { x: 520, y: 466 },
        status: machineStatus,
        gauges: [gaugeFixture()],
        lineEnabled: true,
      },
    ],
    cameras: [
      {
        nameContains: '192.168.1.10',
        label: '儀表板',
        point: { x: 612, y: 424 },
        machineId: 'm-hc600',
        status: 'green',
        matchedCount: 1,
      },
    ],
    incidents: [
      {
        id: 'incident-1',
        title: 'HC600-01 未結異常',
        severity: 'medium',
        status: 'pending_review',
        machineId: 'm-hc600',
        machineLabel: 'HC600-01',
        point: { x: 520, y: 466 },
      },
    ],
  }
}

function machineDetailFixture({
  hmiScreen = hmiScreenFixture(),
  gauges = [],
}: {
  hmiScreen?: ReturnType<typeof hmiScreenFixture> | null
  gauges?: ReturnType<typeof gaugeFixture>[]
} = {}) {
  return {
    machineId: 'm-hc600',
    label: 'HC600-01',
    siteName: '靚程工廠',
    gauges,
    todayIncidentCount: 2,
    thumbnailUrl: 'https://signed.example.test/thumb.jpg',
    thumbnailFallbackText: null,
    lineEnabled: true,
    hmiScreen,
  }
}

function hmiScreenFixture() {
  return {
    machineLabel: 'HC600-01',
    modeLabel: '溫度監視',
    capturedAt: '2026-07-04T09:19:30+08:00',
    sections: [
      {
        label: '設定',
        fields: [{ label: '一段', value: '180 °C', confidence: 0.93 }],
      },
    ],
    rawLines: ['模具保溫中'],
  }
}

function gaugeFixture() {
  return {
    gaugeId: 'press_am_meter',
    label: 'PRESS',
    value: 121.5,
    unit: 'bar',
    confidence: 0.94,
    status: 'ok',
    capturedAt: '2026-07-04T09:17:00+08:00',
    minutesAgo: 3,
    trend: '↗',
    stale: false,
  }
}

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response
}
