import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, vi } from 'vitest'

import type { OpenBmcCommand, OpenBmcDevice } from '../../lib/types'
import { renderWithProviders } from '../../test/utils'
import { OpenBmcPi5Panel } from './OpenBmcPi5Panel'

const apiMock = vi.hoisted(() => ({
  createOpenBmcCommandProposal: vi.fn(),
  confirmOpenBmcCommand: vi.fn(),
  cancelOpenBmcCommand: vi.fn(),
}))

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  return {
    ...actual,
    api: {
      ...actual.api,
      createOpenBmcCommandProposal: apiMock.createOpenBmcCommandProposal,
      confirmOpenBmcCommand: apiMock.confirmOpenBmcCommand,
      cancelOpenBmcCommand: apiMock.cancelOpenBmcCommand,
    },
  }
})

function deviceFixture(overrides: Partial<OpenBmcDevice> = {}): OpenBmcDevice {
  const now = new Date().toISOString()
  return {
    deviceId: 'pi5-1',
    organizationId: 'org-1',
    siteId: 'site-1',
    connectorId: 'connector-1',
    name: 'Pi5 OpenBMC Demo',
    externalRef: 'pi5-demo',
    deviceType: 'raspberry_pi_5',
    status: 'active',
    capabilities: {
      fan_boost: true,
      reset_dry_run: true,
    },
    freshness: 'fresh',
    canControl: true,
    controlEligible: true,
    controlBlockReasons: [],
    lastObservedAt: now,
    lastIngestedAt: now,
    latestObservation: {
      observationId: 'obs-1',
      sourceObservationId: 'collector:1',
      observedAt: now,
      collectorReceivedAt: now,
      ingestedAt: now,
      collectorStale: false,
      temperatureC: 52.4,
      status: 'normal',
      health: 'ok',
      fan: {
        present: true,
        rpm: 1_180,
        pwm: 42,
        coolingState: 1,
        coolingMaxState: 4,
        manualBoostSupported: true,
      },
      thresholds: {
        warningC: 65,
        criticalC: 75,
      },
    },
    recentEvents: [
      {
        eventId: 'event-1',
        sourceEventKey: 'collector:event:1',
        occurredAt: now,
        severity: 'info',
        source: 'pi5-agent',
        code: 'THERMAL_NORMAL',
        message: 'Pi5 thermal state is normal.',
        details: {},
      },
    ],
    recentCommands: [],
    ...overrides,
  }
}

function commandFixture(overrides: Partial<OpenBmcCommand> = {}): OpenBmcCommand {
  const now = new Date().toISOString()
  return {
    commandId: 'command-1',
    type: 'fan_boost',
    arguments: { seconds: 10 },
    status: 'queued',
    reason: 'Pi5 OpenBMC 展示操作',
    proposalHash: 'proposal-hash-1',
    proposedAt: now,
    confirmationExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    confirmedAt: now,
    claimExpiresAt: null,
    completedAt: null,
    failureCode: null,
    result: null,
    ...overrides,
  }
}

describe('OpenBmcPi5Panel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.createOpenBmcCommandProposal.mockResolvedValue({
      commandId: 'command-1',
      status: 'awaiting_confirmation',
      proposalHash: 'proposal-hash-1',
      confirmationExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      summary: '風扇加速 10 秒',
    })
    apiMock.confirmOpenBmcCommand.mockResolvedValue(commandFixture())
    apiMock.cancelOpenBmcCommand.mockResolvedValue(commandFixture({ status: 'cancelled' }))
  })

  it('fails closed when the server marks telemetry stale', async () => {
    const user = userEvent.setup()
    const device = deviceFixture({
      freshness: 'stale',
      controlEligible: false,
      controlBlockReasons: ['observation_stale'],
    })

    renderWithProviders(<OpenBmcPi5Panel device={device} sourceMode="live" />)

    expect(screen.queryByText('52.4 °C')).not.toBeInTheDocument()
    expect(screen.queryByText('1180 RPM')).not.toBeInTheDocument()
    expect(screen.getByText('目前沒有可確認的新鮮狀態；數值已隱藏。')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '查看詳情與控制' }))

    expect(
      screen.getByText('為避免把過期資料當成現在狀態，本畫面不顯示最後一次的溫度、RPM 或 PWM。'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '建立提案：風扇加速 10 秒' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '建立提案：重啟流程演練' })).toBeDisabled()
  })

  it('fails closed locally after cached live evidence exceeds 30 seconds', async () => {
    const old = new Date(Date.now() - 31_000).toISOString()
    const device = deviceFixture({
      latestObservation: {
        ...deviceFixture().latestObservation!,
        observedAt: old,
        collectorReceivedAt: old,
        ingestedAt: old,
      },
    })

    renderWithProviders(<OpenBmcPi5Panel device={device} sourceMode="live" />)

    expect(screen.queryByText('52.4 °C')).not.toBeInTheDocument()
    expect(screen.queryByText('1180 RPM')).not.toBeInTheDocument()
  })

  it('labels deterministic fallback data as simulated and keeps it read-only', async () => {
    const user = userEvent.setup()
    const device = deviceFixture({
      deviceId: 'demo-pi5-simulated',
      controlEligible: false,
      capabilities: {},
    })

    renderWithProviders(<OpenBmcPi5Panel device={device} sourceMode="simulated" />)

    expect(screen.getByText('SIMULATED')).toBeInTheDocument()
    expect(screen.getByText('52.4 °C')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '查看詳情與控制' }))
    expect(screen.getByText('模擬資料僅供展示，不會送出控制命令。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '建立提案：風扇加速 10 秒' })).toBeDisabled()
  })

  it('requires a proposal and a second explicit confirmation using the proposal hash', async () => {
    const user = userEvent.setup()
    const onRefresh = vi.fn()
    const device = deviceFixture()

    renderWithProviders(
      <OpenBmcPi5Panel
        device={device}
        sourceMode="live"
        onRefresh={onRefresh}
      />,
    )

    await user.click(screen.getByRole('button', { name: '查看詳情與控制' }))
    await user.click(screen.getByRole('button', { name: '建立提案：風扇加速 10 秒' }))

    await waitFor(() => {
      expect(apiMock.createOpenBmcCommandProposal).toHaveBeenCalledWith('test-token', 'pi5-1', {
        command: {
          type: 'fan_boost',
          arguments: { seconds: 10 },
        },
        reason: 'Pi5 OpenBMC 展示操作',
      })
    })
    expect(await screen.findByText('WAITING FOR CONFIRMATION')).toBeInTheDocument()
    expect(apiMock.confirmOpenBmcCommand).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '確認送出命令' }))

    await waitFor(() => {
      expect(apiMock.confirmOpenBmcCommand).toHaveBeenCalledWith('test-token', 'command-1', {
        expectedProposalHash: 'proposal-hash-1',
      })
    })
    expect(onRefresh).toHaveBeenCalled()
  })

  it('disables a pending confirmation when live evidence becomes ineligible', async () => {
    const user = userEvent.setup()
    const device = deviceFixture({
      controlEligible: false,
      controlBlockReasons: ['command_execution_disabled'],
    })

    renderWithProviders(<OpenBmcPi5Panel device={device} sourceMode="live" />)

    await user.click(screen.getByRole('button', { name: '查看詳情與控制' }))
    expect(screen.getByRole('button', { name: '建立提案：風扇加速 10 秒' })).toBeDisabled()
    expect(apiMock.createOpenBmcCommandProposal).not.toHaveBeenCalled()
  })

  it('keeps command controls read-only for an authenticated viewer', async () => {
    const user = userEvent.setup()
    const device = deviceFixture({
      canControl: false,
      controlEligible: false,
      controlBlockReasons: ['insufficient_write_role'],
    })

    renderWithProviders(<OpenBmcPi5Panel device={device} sourceMode="live" />)

    await user.click(screen.getByRole('button', { name: '查看詳情與控制' }))
    expect(screen.getByRole('button', { name: '建立提案：風扇加速 10 秒' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '建立提案：重啟流程演練' })).toBeDisabled()
    expect(screen.getByText('insufficient_write_role')).toBeInTheDocument()
  })

  it('disables fan boost when the latest live observation lacks manual boost evidence', async () => {
    const user = userEvent.setup()
    const base = deviceFixture()
    const device = deviceFixture({
      latestObservation: {
        ...base.latestObservation!,
        fan: {
          ...base.latestObservation!.fan,
          manualBoostSupported: false,
        },
      },
    })

    renderWithProviders(<OpenBmcPi5Panel device={device} sourceMode="live" />)

    await user.click(screen.getByRole('button', { name: '查看詳情與控制' }))
    expect(screen.getByRole('button', { name: '建立提案：風扇加速 10 秒' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '建立提案：重啟流程演練' })).toBeEnabled()
  })
})
