import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { api, type OpenBmcCommandProposalPayload } from '../../lib/api'
import { useAuthedMutation } from '../../lib/auth-query'
import type {
  OpenBmcCommandProposal,
  OpenBmcCommandType,
  OpenBmcDevice,
  OpenBmcEvent,
} from '../../lib/types'

export type OpenBmcPanelSourceMode = 'live' | 'simulated' | 'unavailable'

const LIVE_EVIDENCE_MAX_AGE_MS = 30_000
const LIVE_EVIDENCE_MAX_FUTURE_SKEW_MS = 120_000

interface OpenBmcPi5PanelProps {
  device: OpenBmcDevice | null
  sourceMode: OpenBmcPanelSourceMode
  isLoading?: boolean
  errorText?: string | null
  onRefresh?: () => void
}

interface ProposalRequest {
  deviceId: string
  payload: OpenBmcCommandProposalPayload
}

interface ConfirmRequest {
  commandId: string
  expectedProposalHash: string
}

function formatMetric(value: number | null | undefined, unit: string): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)} ${unit}` : '—'
}

function formatTemperature(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)} °C` : '—'
}

function formatPwm(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)} / 255` : '—'
}

function formatObservedAt(value: string | null | undefined): string {
  if (!value) return '尚無觀測'
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return '時間未知'
  return new Intl.DateTimeFormat('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(parsed)
}

function evidenceTimestampIsCurrent(value: string | null | undefined, nowMs: number): boolean {
  if (!value) return false
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return false
  const ageMs = nowMs - parsed
  return ageMs <= LIVE_EVIDENCE_MAX_AGE_MS && ageMs >= -LIVE_EVIDENCE_MAX_FUTURE_SKEW_MS
}

function healthLabel(value: string | null | undefined): string {
  if (value === 'ok' || value === 'normal') return '正常'
  if (value === 'warning') return '警告'
  if (value === 'critical') return '嚴重'
  return '未知'
}

function statusTone(value: string | null | undefined): string {
  if (value === 'ok' || value === 'normal') return 'border-[#1E7F53] text-[#1E7F53]'
  if (value === 'warning') return 'border-[#A56A16] text-[#8A570F]'
  if (value === 'critical') return 'border-[#B9382F] text-[#B9382F]'
  return 'border-[#B0A79B] text-[#6F685F]'
}

function eventTone(event: OpenBmcEvent): string {
  if (event.severity === 'critical') return 'border-l-[#B9382F]'
  if (event.severity === 'warning') return 'border-l-[#A56A16]'
  return 'border-l-[#0E6B69]'
}

function capabilityEnabled(device: OpenBmcDevice, commandType: OpenBmcCommandType): boolean {
  const capabilities = device.capabilities
  if (Array.isArray(capabilities)) return capabilities.includes(commandType)

  const direct = capabilities[commandType]
  if (direct === true) return true

  const commandTypes = capabilities.commandTypes
  if (Array.isArray(commandTypes) && commandTypes.includes(commandType)) return true

  const commands = capabilities.commands
  if (Array.isArray(commands) && commands.includes(commandType)) return true
  if (commands && typeof commands === 'object') {
    return (commands as Record<string, unknown>)[commandType] === true
  }
  return false
}

function commandLabel(commandType: OpenBmcCommandType): string {
  return commandType === 'fan_boost' ? '風扇加速 10 秒' : '重啟流程演練（不重啟）'
}

export function OpenBmcPi5Panel({
  device,
  sourceMode,
  isLoading = false,
  errorText = null,
  onRefresh,
}: OpenBmcPi5PanelProps) {
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [proposal, setProposal] = useState<OpenBmcCommandProposal | null>(null)
  const [proposalType, setProposalType] = useState<OpenBmcCommandType | null>(null)
  const [clockMs, setClockMs] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setClockMs(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [])

  const proposalMutation = useAuthedMutation<OpenBmcCommandProposal, ProposalRequest>({
    mutationKey: ['openbmc', 'command-proposal'],
    mutationFn: ({ token, payload }) =>
      api.createOpenBmcCommandProposal(token, payload.deviceId, payload.payload),
    onSuccess: (nextProposal) => {
      setProposal(nextProposal)
      setClockMs(Date.now())
    },
  })

  const confirmMutation = useAuthedMutation<unknown, ConfirmRequest>({
    mutationKey: ['openbmc', 'command-confirm'],
    mutationFn: ({ token, payload }) =>
      api.confirmOpenBmcCommand(token, payload.commandId, {
        expectedProposalHash: payload.expectedProposalHash,
      }),
    onSuccess: async () => {
      setProposal(null)
      setProposalType(null)
      await queryClient.invalidateQueries({ queryKey: ['openbmc', 'devices'] })
      onRefresh?.()
    },
  })

  const cancelMutation = useAuthedMutation<unknown, string>({
    mutationKey: ['openbmc', 'command-cancel'],
    mutationFn: ({ token, payload: commandId }) => api.cancelOpenBmcCommand(token, commandId),
    onSuccess: async () => {
      setProposal(null)
      setProposalType(null)
      await queryClient.invalidateQueries({ queryKey: ['openbmc', 'devices'] })
      onRefresh?.()
    },
  })

  const observation = device?.latestObservation ?? null
  const liveEvidenceIsCurrent =
    observation !== null &&
    evidenceTimestampIsCurrent(observation.observedAt, clockMs) &&
    evidenceTimestampIsCurrent(observation.collectorReceivedAt, clockMs) &&
    evidenceTimestampIsCurrent(observation.ingestedAt, clockMs)
  const currentStateAvailable =
    sourceMode === 'simulated' ||
    (sourceMode === 'live' &&
      device?.freshness === 'fresh' &&
      observation !== null &&
      observation.collectorStale === false &&
      liveEvidenceIsCurrent)
  const controlEligible =
    sourceMode === 'live' &&
    currentStateAvailable &&
    device?.status === 'active' &&
    device.canControl &&
    device.controlEligible
  const fanBoostEvidenceAvailable =
    currentStateAvailable &&
    observation?.fan.present === true &&
    observation.fan.manualBoostSupported === true
  const commandEligible = (commandType: OpenBmcCommandType): boolean =>
    Boolean(
      controlEligible &&
        device &&
        capabilityEnabled(device, commandType) &&
        (commandType !== 'fan_boost' || fanBoostEvidenceAvailable),
    )
  const proposalControlEligible =
    proposalType === null ? Boolean(controlEligible) : commandEligible(proposalType)
  const proposalExpired =
    proposal !== null && Date.parse(proposal.confirmationExpiresAt) <= clockMs

  const commandError =
    proposalMutation.error?.detail ?? confirmMutation.error?.detail ?? cancelMutation.error?.detail ?? null
  const controlBlockMessage = useMemo(() => {
    if (sourceMode === 'simulated') return '模擬資料僅供展示，不會送出控制命令。'
    if (!device) return '尚未綁定 Pi5 / OpenBMC 裝置。'
    if (!currentStateAvailable) return '資料不新鮮，控制已安全停用。'
    if (!device.controlEligible) {
      return device.controlBlockReasons.length > 0
        ? device.controlBlockReasons.join('、')
        : '後端目前以唯讀模式運作。'
    }
    return null
  }, [currentStateAvailable, device, sourceMode])

  const propose = (commandType: OpenBmcCommandType) => {
    if (!device || !commandEligible(commandType) || proposalMutation.isPending) return
    setProposalType(commandType)
    proposalMutation.mutate({
      deviceId: device.deviceId,
      payload: {
        command: {
          type: commandType,
          arguments: commandType === 'fan_boost' ? { seconds: 10 } : {},
        },
        reason: 'Pi5 OpenBMC 展示操作',
      },
    })
  }

  const confirm = () => {
    if (!proposal || proposalExpired || !proposalControlEligible || confirmMutation.isPending) return
    confirmMutation.mutate({
      commandId: proposal.commandId,
      expectedProposalHash: proposal.proposalHash,
    })
  }

  const sourceBadge =
    sourceMode === 'live'
      ? 'LIVE'
      : sourceMode === 'simulated'
        ? 'SIMULATED'
        : 'UNAVAILABLE'
  const sourceBadgeClass =
    sourceMode === 'live'
      ? 'border-[#0E6B69] bg-[#E6F0EE] text-[#0E6B69]'
      : sourceMode === 'simulated'
        ? 'border-[#A56A16] bg-[#F7E8BF] text-[#7B4D0D]'
        : 'border-[#B0A79B] bg-[#EEE8DF] text-[#6F685F]'

  if (isLoading && !device) {
    return (
      <section
        aria-label="Pi5 OpenBMC 狀態"
        className="border-b border-[#DED5C8] bg-[#F4EFE7] px-4 py-3 md:px-6"
      >
        <p className="m-0 font-mono text-xs text-[#6F685F]">正在讀取 Pi5 / OpenBMC 狀態…</p>
      </section>
    )
  }

  return (
    <section
      aria-label="Pi5 OpenBMC 狀態"
      className="border-b-2 border-[#171B1F] bg-[#F4EFE7] text-[#171B1F]"
      data-source-mode={sourceMode}
    >
      <div className="flex min-h-[72px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 md:px-6">
        <div className="min-w-[210px]">
          <div className="flex items-center gap-2">
            <h2 className="m-0 font-display text-base font-semibold tracking-[-0.02em]">
              {device?.name ?? 'Pi5 OpenBMC'}
            </h2>
            <span
              className={`border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.08em] ${sourceBadgeClass}`}
            >
              {sourceBadge}
            </span>
          </div>
          <p className="mt-1 mb-0 text-xs text-[#6F685F]">
            {errorText
              ? 'OpenBMC 服務目前無法讀取。'
              : currentStateAvailable
                ? `最近觀測 ${formatObservedAt(observation?.observedAt)}`
                : '目前沒有可確認的新鮮狀態；數值已隱藏。'}
          </p>
        </div>

        <dl className="m-0 grid min-w-[440px] flex-1 grid-cols-4 divide-x divide-[#DED5C8]">
          <div className="px-3 first:pl-0">
            <dt className="text-[10px] font-semibold tracking-[0.08em] text-[#6F685F]">溫度</dt>
            <dd className="m-0 mt-1 font-mono text-base font-semibold">
              {currentStateAvailable ? formatTemperature(observation?.temperatureC) : '—'}
            </dd>
          </div>
          <div className="px-3">
            <dt className="text-[10px] font-semibold tracking-[0.08em] text-[#6F685F]">健康</dt>
            <dd className="m-0 mt-1">
              <span
                className={`inline-block border px-1.5 py-0.5 text-xs font-semibold ${statusTone(
                  currentStateAvailable ? observation?.health : null,
                )}`}
              >
                {currentStateAvailable ? healthLabel(observation?.health) : '無資料'}
              </span>
            </dd>
          </div>
          <div className="px-3">
            <dt className="text-[10px] font-semibold tracking-[0.08em] text-[#6F685F]">風扇轉速</dt>
            <dd className="m-0 mt-1 font-mono text-base font-semibold">
              {currentStateAvailable && observation?.fan.present
                ? formatMetric(observation.fan.rpm, 'RPM')
                : '—'}
            </dd>
          </div>
          <div className="px-3">
            <dt className="text-[10px] font-semibold tracking-[0.08em] text-[#6F685F]">PWM</dt>
            <dd className="m-0 mt-1 font-mono text-base font-semibold">
              {currentStateAvailable && observation?.fan.present ? formatPwm(observation.fan.pwm) : '—'}
            </dd>
          </div>
        </dl>

        <button
          type="button"
          className="h-9 border border-[#0E6B69] bg-transparent px-3 text-xs font-semibold text-[#0E6B69] hover:bg-[#E6F0EE]"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? '收合詳情' : '查看詳情與控制'}
        </button>
      </div>

      {expanded ? (
        <div className="grid border-t border-[#DED5C8] lg:grid-cols-[1.1fr_1fr]">
          <div className="border-b border-[#DED5C8] p-4 lg:border-r lg:border-b-0 md:px-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="m-0 font-display text-sm font-semibold">狀態與近期事件</h3>
              <span className="font-mono text-[10px] text-[#6F685F]">
                {device?.freshness === 'fresh' ? 'FRESH' : (device?.freshness ?? 'MISSING').toUpperCase()}
              </span>
            </div>
            {!currentStateAvailable ? (
              <p className="m-0 border-l-4 border-[#A56A16] bg-[#FBF0D7] p-3 text-xs text-[#6B4812]">
                為避免把過期資料當成現在狀態，本畫面不顯示最後一次的溫度、RPM 或 PWM。
              </p>
            ) : (
              <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
                <div>
                  <dt className="text-[#6F685F]">運行狀態</dt>
                  <dd className="m-0 mt-1 font-semibold">{healthLabel(observation?.status)}</dd>
                </div>
                <div>
                  <dt className="text-[#6F685F]">風扇</dt>
                  <dd className="m-0 mt-1 font-semibold">
                    {observation?.fan.present ? '已偵測' : '未偵測'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[#6F685F]">警告門檻</dt>
                  <dd className="m-0 mt-1 font-mono">
                    {formatMetric(observation?.thresholds.warningC, '°C')}
                  </dd>
                </div>
                <div>
                  <dt className="text-[#6F685F]">嚴重門檻</dt>
                  <dd className="m-0 mt-1 font-mono">
                    {formatMetric(observation?.thresholds.criticalC, '°C')}
                  </dd>
                </div>
              </dl>
            )}

            <div className="mt-4 space-y-2">
              {(device?.recentEvents ?? []).slice(0, 3).map((event) => (
                <article
                  key={event.eventId}
                  className={`border-l-4 bg-[#EEE8DF] px-3 py-2 ${eventTone(event)}`}
                >
                  <div className="flex justify-between gap-3">
                    <strong className="text-xs">{event.message}</strong>
                    <time className="shrink-0 font-mono text-[10px] text-[#6F685F]">
                      {formatObservedAt(event.occurredAt)}
                    </time>
                  </div>
                  <p className="mt-1 mb-0 font-mono text-[10px] text-[#6F685F]">{event.code}</p>
                </article>
              ))}
              {(device?.recentEvents.length ?? 0) === 0 ? (
                <p className="m-0 text-xs text-[#6F685F]">目前沒有近期事件。</p>
              ) : null}
            </div>
          </div>

          <div className="p-4 md:px-6">
            <h3 className="m-0 font-display text-sm font-semibold">經確認的控制操作</h3>
            <p className="mt-1 mb-3 text-xs text-[#6F685F]">
              第一次點擊只建立提案；必須再次核對並確認，現場 connector 才能領取命令。
            </p>

            {proposal ? (
              <div className="border-2 border-[#B55C2B] bg-[#FBF0D7] p-3">
                <span className="font-mono text-[10px] font-semibold tracking-[0.08em] text-[#8A461F]">
                  WAITING FOR CONFIRMATION
                </span>
                <p className="mt-2 mb-1 text-sm font-semibold">
                  {proposal.summary || commandLabel(proposalType ?? 'reset_dry_run')}
                </p>
                <p className="m-0 text-xs text-[#6F685F]">
                  {proposalExpired
                    ? '提案已逾期，請取消後重新建立。'
                    : `確認期限 ${formatObservedAt(proposal.confirmationExpiresAt)}`}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="h-9 border border-[#B55C2B] bg-[#B55C2B] px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={proposalExpired || !proposalControlEligible || confirmMutation.isPending}
                    onClick={confirm}
                  >
                    {confirmMutation.isPending ? '送出確認中…' : '確認送出命令'}
                  </button>
                  <button
                    type="button"
                    className="h-9 border border-[#6F685F] bg-transparent px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={cancelMutation.isPending}
                    onClick={() => cancelMutation.mutate(proposal.commandId)}
                  >
                    取消提案
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    className="min-h-11 border border-[#0E6B69] bg-[#0E6B69] px-3 text-left text-xs font-semibold text-white disabled:cursor-not-allowed disabled:border-[#B0A79B] disabled:bg-[#D6CFC5] disabled:text-[#6F685F]"
                    disabled={
                      !commandEligible('fan_boost') ||
                      proposalMutation.isPending
                    }
                    onClick={() => propose('fan_boost')}
                  >
                    建立提案：風扇加速 10 秒
                  </button>
                  <button
                    type="button"
                    className="min-h-11 border border-[#4A4F55] bg-transparent px-3 text-left text-xs font-semibold disabled:cursor-not-allowed disabled:border-[#B0A79B] disabled:bg-[#EEE8DF] disabled:text-[#6F685F]"
                    disabled={
                      !commandEligible('reset_dry_run') ||
                      proposalMutation.isPending
                    }
                    onClick={() => propose('reset_dry_run')}
                  >
                    建立提案：重啟流程演練
                  </button>
                </div>
                {controlBlockMessage ? (
                  <p className="mt-3 mb-0 border-l-4 border-[#A56A16] pl-3 text-xs text-[#6B4812]">
                    {controlBlockMessage}
                  </p>
                ) : null}
              </>
            )}

            {commandError ? (
              <p role="alert" className="mt-3 mb-0 text-xs font-semibold text-[#B9382F]">
                操作未送出：{commandError}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}
