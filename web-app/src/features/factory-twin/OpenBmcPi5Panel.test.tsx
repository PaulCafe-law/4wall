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
    apiMock.confirmOpenBmcCommand.mockImplementation(async (_token, commandId: string) =>
      commandFixture({ commandId }),
    )
    apiMock.cancelOpenBmcCommand.mockImplementation(async (_token, commandId: string) =>
      commandFixture({ commandId, status: 'cancelled' }),
    )
  })

  it('fails closed when the server marks telemetry stale', () => {
    const device = deviceFixture({
      freshness: 'stale',
      controlEligible: false,
      controlBlockReasons: ['observation_stale'],
    })

    renderWithProviders(<OpenBmcPi5Panel device={device} sourceMode="live" />)

    expect(screen.queryByText('52.4 °C')).not.toBeInTheDocument()
    expect(screen.queryByText('1180 RPM')).not.toBeInTheDocument()
    expect(screen.getByText('目前沒有可確認的新鮮狀態；數值已隱藏。')).toBeInTheDocument()
    expect(screen.getAllByText('STALE')).toHaveLength(2)

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

  it('labels deterministic fallback data as simulated and keeps it read-only', () => {
    const device = deviceFixture({
      deviceId: 'demo-pi5-simulated',
      controlEligible: false,
      capabilities: {},
    })

    renderWithProviders(<OpenBmcPi5Panel device={device} sourceMode="simulated" />)

    expect(screen.getByText('SIMULATED')).toBeInTheDocument()
    expect(screen.getByText('52.4 °C')).toBeInTheDocument()
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

  it('locks cancellation while a confirmation request is pending', async () => {
    const user = userEvent.setup()
    apiMock.confirmOpenBmcCommand.mockImplementation(() => new Promise(() => undefined))
    const pending = commandFixture({
      status: 'awaiting_confirmation',
      confirmedAt: null,
    })

    renderWithProviders(
      <OpenBmcPi5Panel
        device={deviceFixture({ recentCommands: [pending] })}
        sourceMode="live"
      />,
    )

    const confirmButton = screen.getByRole('button', { name: '確認送出命令' })
    const cancelButton = screen.getByRole('button', { name: '取消提案' })
    await user.click(confirmButton)

    await waitFor(() => {
      expect(confirmButton).toBeDisabled()
      expect(cancelButton).toBeDisabled()
    })
    await user.click(cancelButton)

    expect(apiMock.confirmOpenBmcCommand).toHaveBeenCalledTimes(1)
    expect(apiMock.cancelOpenBmcCommand).not.toHaveBeenCalled()
  })

  it('locks confirmation while a cancellation request is pending', async () => {
    const user = userEvent.setup()
    apiMock.cancelOpenBmcCommand.mockImplementation(() => new Promise(() => undefined))
    const pending = commandFixture({
      status: 'awaiting_confirmation',
      confirmedAt: null,
    })

    renderWithProviders(
      <OpenBmcPi5Panel
        device={deviceFixture({ recentCommands: [pending] })}
        sourceMode="live"
      />,
    )

    const confirmButton = screen.getByRole('button', { name: '確認送出命令' })
    await user.click(screen.getByRole('button', { name: '取消提案' }))

    await waitFor(() => {
      expect(confirmButton).toBeDisabled()
      expect(screen.getByRole('button', { name: '取消中…' })).toBeDisabled()
    })
    await user.click(confirmButton)

    expect(apiMock.cancelOpenBmcCommand).toHaveBeenCalledTimes(1)
    expect(apiMock.confirmOpenBmcCommand).not.toHaveBeenCalled()
  })

  it('disables a pending confirmation when live evidence becomes ineligible', () => {
    const device = deviceFixture({
      controlEligible: false,
      controlBlockReasons: ['command_execution_disabled'],
    })

    renderWithProviders(<OpenBmcPi5Panel device={device} sourceMode="live" />)

    expect(screen.getByRole('button', { name: '建立提案：風扇加速 10 秒' })).toBeDisabled()
    expect(apiMock.createOpenBmcCommandProposal).not.toHaveBeenCalled()
  })

  it('keeps command controls read-only for an authenticated viewer', () => {
    const device = deviceFixture({
      canControl: false,
      controlEligible: false,
      controlBlockReasons: ['insufficient_write_role'],
    })

    renderWithProviders(<OpenBmcPi5Panel device={device} sourceMode="live" />)

    expect(screen.getByRole('button', { name: '建立提案：風扇加速 10 秒' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '建立提案：重啟流程演練' })).toBeDisabled()
    expect(screen.getByText('insufficient_write_role')).toBeInTheDocument()
  })

  it('disables fan boost when the latest live observation lacks manual boost evidence', () => {
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

    expect(screen.getByRole('button', { name: '建立提案：風扇加速 10 秒' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '建立提案：重啟流程演練' })).toBeEnabled()
  })

  it('shows an explicit loading state before a device is available', () => {
    renderWithProviders(
      <OpenBmcPi5Panel
        device={null}
        sourceMode="unavailable"
        isLoading
      />,
    )

    expect(screen.getByText('LOADING')).toBeInTheDocument()
    expect(screen.getByText('正在讀取 Pi5 / OpenBMC 狀態…')).toBeInTheDocument()
    expect(screen.queryByText('UNAVAILABLE')).not.toBeInTheDocument()
  })

  it('restores only the newest valid pending proposal from the selected device', async () => {
    const user = userEvent.setup()
    const now = Date.now()
    const device = deviceFixture({
      recentCommands: [
        commandFixture({
          commandId: 'cancelled-newer',
          type: 'fan_boost',
          status: 'cancelled',
          proposedAt: new Date(now + 3_000).toISOString(),
          confirmationExpiresAt: new Date(now + 60_000).toISOString(),
          proposalHash: 'cancelled-hash',
        }),
        commandFixture({
          commandId: 'pending-newest',
          type: 'reset_dry_run',
          status: 'awaiting_confirmation',
          proposedAt: new Date(now + 2_000).toISOString(),
          confirmationExpiresAt: new Date(now + 60_000).toISOString(),
          proposalHash: 'newest-hash',
        }),
        commandFixture({
          commandId: 'pending-older',
          type: 'fan_boost',
          status: 'awaiting_confirmation',
          proposedAt: new Date(now + 1_000).toISOString(),
          confirmationExpiresAt: new Date(now + 60_000).toISOString(),
          proposalHash: 'older-hash',
        }),
        commandFixture({
          commandId: 'pending-expired',
          type: 'fan_boost',
          status: 'awaiting_confirmation',
          proposedAt: new Date(now + 4_000).toISOString(),
          confirmationExpiresAt: new Date(now - 1_000).toISOString(),
          proposalHash: 'expired-hash',
        }),
      ],
    })

    renderWithProviders(<OpenBmcPi5Panel device={device} sourceMode="live" />)

    expect(screen.getByText('WAITING FOR CONFIRMATION')).toBeInTheDocument()
    expect(screen.getByText('重啟流程演練（不重啟）')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '確認送出命令' }))

    await waitFor(() => {
      expect(apiMock.confirmOpenBmcCommand).toHaveBeenCalledWith('test-token', 'pending-newest', {
        expectedProposalHash: 'newest-hash',
      })
    })
    await waitFor(() => {
      expect(screen.queryByText('WAITING FOR CONFIRMATION')).not.toBeInTheDocument()
    })
  })

  it('switches to a newer pending proposal received by polling', async () => {
    const user = userEvent.setup()
    const now = Date.now()
    const older = commandFixture({
      commandId: 'pending-older-tab',
      type: 'fan_boost',
      status: 'awaiting_confirmation',
      confirmedAt: null,
      proposedAt: new Date(now).toISOString(),
      confirmationExpiresAt: new Date(now + 60_000).toISOString(),
      proposalHash: 'older-tab-hash',
    })
    const newer = commandFixture({
      commandId: 'pending-newer-tab',
      type: 'reset_dry_run',
      status: 'awaiting_confirmation',
      confirmedAt: null,
      proposedAt: new Date(now + 1_000).toISOString(),
      confirmationExpiresAt: new Date(now + 60_000).toISOString(),
      proposalHash: 'newer-tab-hash',
    })
    const initialDevice = deviceFixture({ recentCommands: [older] })
    const { rerender } = renderWithProviders(
      <OpenBmcPi5Panel device={initialDevice} sourceMode="live" />,
    )

    expect(screen.getByText('風扇加速 10 秒')).toBeInTheDocument()

    rerender(
      <OpenBmcPi5Panel
        device={{ ...initialDevice, recentCommands: [newer, older] }}
        sourceMode="live"
      />,
    )

    expect(await screen.findByText('重啟流程演練（不重啟）')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '確認送出命令' }))

    await waitFor(() => {
      expect(apiMock.confirmOpenBmcCommand).toHaveBeenCalledWith('test-token', 'pending-newer-tab', {
        expectedProposalHash: 'newer-tab-hash',
      })
    })
  })
})
