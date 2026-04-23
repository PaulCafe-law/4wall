import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  ActionButton,
  DataList,
  EmptyState,
  Metric,
  Panel,
  ShellSection,
  StatusBadge,
  formatDate,
} from '../../components/ui'
import { api, ApiError, type ControlIntentPayload } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAuthedMutation, useAuthedQuery } from '../../lib/auth-query'
import {
  formatApiError,
  formatBoolean,
  formatCameraStreamState,
  formatControlAction,
  formatControlMode,
  formatExecutionMode,
  formatExecutionState,
  formatFlightAlert,
  formatFlightState,
  formatLandingPhase,
  formatOperatingProfile,
  formatRecordingState,
  formatUploadState,
} from '../../lib/presentation'
import type { ControlIntentAction, LiveFlightDetail, LiveFlightSummary } from '../../lib/types'

const controlActions: Array<{ action: ControlIntentAction; label: string }> = [
  { action: 'request_remote_control', label: '請求接管' },
  { action: 'release_remote_control', label: '釋放接管' },
  { action: 'pause_mission', label: '暫停任務' },
  { action: 'resume_mission', label: '恢復任務' },
  { action: 'hold', label: '保持' },
  { action: 'return_to_home', label: '返航' },
]

function executionProgress(flight: { executionSummary: LiveFlightSummary['executionSummary'] }) {
  if (flight.executionSummary?.executionMode === 'manual_pilot') {
    return '手動飛行中'
  }
  return flight.executionSummary?.waypointProgress ?? '尚無航點進度'
}

function flightStatus(flight: LiveFlightSummary): string {
  if (flight.alerts.length > 0) {
    return 'failed'
  }
  if (flight.executionSummary?.executionState === 'completed') {
    return 'ready'
  }
  return 'planning'
}

export function LiveOpsPage() {
  const auth = useAuth()
  const queryClient = useQueryClient()
  const [selectedFlightId, setSelectedFlightId] = useState('')

  const flightsQuery = useAuthedQuery({
    queryKey: ['live-ops', 'flights'],
    queryFn: api.listLiveFlights,
    staleTime: 5_000,
    refetchInterval: 5_000,
  })

  const flights = flightsQuery.data ?? []
  const effectiveFlightId = selectedFlightId || flights[0]?.flightId || ''

  const detailQuery = useAuthedQuery({
    queryKey: ['live-ops', 'flight', effectiveFlightId],
    queryFn: (token) => api.getLiveFlight(token, effectiveFlightId),
    enabled: Boolean(effectiveFlightId),
    staleTime: 3_000,
    refetchInterval: 5_000,
  })

  const intentsQuery = useAuthedQuery({
    queryKey: ['live-ops', 'control-intents', effectiveFlightId],
    queryFn: (token) => api.listControlIntents(token, effectiveFlightId),
    enabled: Boolean(effectiveFlightId),
    staleTime: 3_000,
    refetchInterval: 5_000,
  })

  const requestControlIntent = useAuthedMutation({
    mutationKey: ['live-ops', 'request-control-intent', effectiveFlightId],
    mutationFn: ({ token, payload }: { token: string; payload: ControlIntentPayload }) =>
      api.requestControlIntent(token, effectiveFlightId, payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['live-ops', 'flights'] }),
        queryClient.invalidateQueries({ queryKey: ['live-ops', 'flight', effectiveFlightId] }),
        queryClient.invalidateQueries({ queryKey: ['live-ops', 'control-intents', effectiveFlightId] }),
      ])
    },
  })

  const selectedFlight = detailQuery.data
  const remoteActiveCount = flights.filter(
    (flight) => flight.controlLease.mode === 'remote_control_active',
  ).length
  const alertCount = flights.filter((flight) => flight.alerts.length > 0).length
  const manualPilotCount = flights.filter(
    (flight) => flight.executionSummary?.executionMode === 'manual_pilot',
  ).length

  const intentError =
    requestControlIntent.error instanceof ApiError
      ? formatApiError(requestControlIntent.error.detail, requestControlIntent.error.detail)
      : null

  const onRequestAction = async (action: ControlIntentAction) => {
    if (!effectiveFlightId) {
      return
    }
    await requestControlIntent.mutateAsync({
      action,
      reason: `${formatControlAction(action)} / ${auth.user?.displayName ?? 'web user'}`,
    })
  }

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="即時營運"
        title="飛行營運監看"
        subtitle="監看 Android 執行狀態、巡邏進度、手動飛行、降落階段與控制意圖；web 不取得飛控權限。"
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="飛行 Session" value={flights.length} hint="Android 回報中的飛行紀錄" />
        <Metric label="遠端接管" value={remoteActiveCount} hint="目前有效的接管 lease" />
        <Metric label="告警" value={alertCount} hint="Bridge、電量、遙測或執行告警" />
        <Metric label="手動飛行" value={manualPilotCount} hint="操作員直接飛行中的 session" />
      </div>

      {flightsQuery.isLoading ? (
        <Panel>
          <p className="text-sm text-chrome-700">正在載入即時飛行 session…</p>
        </Panel>
      ) : null}

      {!flightsQuery.isLoading && flights.length === 0 ? (
        <EmptyState
          title="目前沒有即時飛行"
          body="Android 尚未回報飛行 session。請先從現場裝置啟動飛行，或回放遙測資料。"
        />
      ) : null}

      {flights.length > 0 ? (
        <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
          <FlightList flights={flights} selectedFlightId={effectiveFlightId} onSelect={setSelectedFlightId} />
          <div className="space-y-6">
            {selectedFlight ? (
              <>
                <FlightSummaryPanel flight={selectedFlight} />
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
                  <FlightTelemetryPanel flight={selectedFlight} />
                  <VideoAndLeasePanel flight={selectedFlight} />
                </div>
                <ControlIntentPanel
                  canRequestControl={auth.isInternal}
                  errorDetail={intentError}
                  flight={selectedFlight}
                  intents={intentsQuery.data ?? []}
                  isPending={requestControlIntent.isPending}
                  onRequestAction={onRequestAction}
                />
                <RecentEventsPanel flight={selectedFlight} />
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function FlightList({
  flights,
  selectedFlightId,
  onSelect,
}: {
  flights: LiveFlightSummary[]
  selectedFlightId: string
  onSelect: (flightId: string) => void
}) {
  return (
    <Panel>
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">飛行 Session</p>
      <div className="mt-4 grid gap-3">
        {flights.map((flight) => (
          <button
            key={flight.flightId}
            type="button"
            onClick={() => onSelect(flight.flightId)}
            className={
              flight.flightId === selectedFlightId
                ? 'w-full rounded-2xl border border-ember-300 bg-white px-4 py-4 text-left'
                : 'w-full rounded-2xl border border-chrome-200 bg-chrome-50/70 px-4 py-4 text-left transition hover:border-chrome-400'
            }
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="min-w-0 break-words font-medium text-chrome-950">{flight.missionName}</h2>
              <StatusBadge status={flightStatus(flight)} />
            </div>
            <p className="mt-1 text-sm text-chrome-700">{flight.siteName ?? '尚未指定場域'}</p>
            <p className="mt-2 text-xs text-chrome-500">
              {formatOperatingProfile(flight.executionSummary?.executedOperatingProfile ?? flight.operatingProfile)}
            </p>
            <p className="mt-1 text-xs text-chrome-500">
              {formatExecutionMode(flight.executionSummary?.executionMode)} / {executionProgress(flight)}
            </p>
          </button>
        ))}
      </div>
    </Panel>
  )
}

function FlightSummaryPanel({ flight }: { flight: LiveFlightDetail }) {
  return (
    <Panel>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ember-500">執行摘要</p>
          <h2 className="mt-2 break-words font-display text-3xl font-semibold text-chrome-950">
            {flight.missionName}
          </h2>
          <p className="mt-2 text-sm text-chrome-700">
            {flight.siteName ?? '尚未指定場域'} / Flight {flight.flightId}
          </p>
          <p className="mt-2 text-sm text-chrome-700">
            規劃 {formatOperatingProfile(flight.executionSummary?.plannedOperatingProfile ?? flight.operatingProfile)}
            {' / '}
            實際 {formatOperatingProfile(flight.executionSummary?.executedOperatingProfile ?? flight.operatingProfile)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {flight.alerts.length === 0 ? (
            <span className="rounded-full bg-moss-300/40 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-moss-500">
              正常
            </span>
          ) : (
            flight.alerts.map((alert) => (
              <span
                key={alert}
                className="rounded-full bg-amber-100 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-amber-800"
              >
                {formatFlightAlert(alert)}
              </span>
            ))
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-4 xl:grid-cols-8">
        <Metric
          label="電量"
          value={flight.latestTelemetry ? `${flight.latestTelemetry.batteryPct}%` : '--'}
          hint={flight.latestTelemetry ? formatFlightState(flight.latestTelemetry.flightState) : '尚無遙測'}
        />
        <Metric label="高度" value={flight.latestTelemetry ? `${flight.latestTelemetry.altitudeM.toFixed(1)} m` : '--'} />
        <Metric
          label="地速"
          value={flight.latestTelemetry ? `${flight.latestTelemetry.groundSpeedMps.toFixed(1)} m/s` : '--'}
        />
        <Metric label="上傳" value={formatUploadState(flight.executionSummary?.uploadState)} />
        <Metric label="狀態" value={formatExecutionState(flight.executionSummary?.executionState)} />
        <Metric label="模式" value={formatExecutionMode(flight.executionSummary?.executionMode)} />
        <Metric label="相機" value={formatCameraStreamState(flight.executionSummary?.cameraStreamState)} />
        <Metric label="錄影" value={formatRecordingState(flight.executionSummary?.recordingState)} />
      </div>
    </Panel>
  )
}

function FlightTelemetryPanel({ flight }: { flight: LiveFlightDetail }) {
  const execution = flight.executionSummary
  const rows = useMemo(
    () => [
      { label: '任務', value: flight.missionId },
      { label: '最後事件', value: execution?.lastEventType ?? '無' },
      { label: '事件時間', value: execution?.lastEventAt ? formatDate(execution.lastEventAt) : '無' },
      { label: '進度', value: executionProgress(flight) },
      { label: '降落', value: formatLandingPhase(execution?.landingPhase) },
      { label: '備援原因', value: execution?.fallbackReason ?? '無' },
      { label: '狀態備註', value: execution?.statusNote ?? '無' },
      { label: '遙測時間', value: flight.latestTelemetry ? formatDate(flight.latestTelemetry.timestamp) : '無' },
      {
        label: '偏離',
        value: flight.latestTelemetry ? `${flight.latestTelemetry.corridorDeviationM.toFixed(1)} m` : '--',
      },
    ],
    [execution, flight],
  )

  return (
    <Panel>
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">遙測</p>
      <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">執行明細</h2>
      <div className="mt-4">
        <DataList rows={rows} />
      </div>
    </Panel>
  )
}

function VideoAndLeasePanel({ flight }: { flight: LiveFlightDetail }) {
  return (
    <div className="space-y-6">
      <Panel>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">相機</p>
        <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">預覽通道</h2>
        <div className="mt-4">
          <DataList
            rows={[
              { label: '可用', value: formatBoolean(flight.video.available) },
              { label: '串流', value: formatBoolean(flight.video.streaming) },
              { label: '編碼', value: flight.video.codec ?? '未知' },
              {
                label: '延遲',
                value: flight.video.latencyMs !== null ? `${flight.video.latencyMs} ms` : '未知',
              },
              {
                label: '觀看',
                value: flight.video.viewerUrl ? (
                  <a href={flight.video.viewerUrl} target="_blank" rel="noreferrer" className="text-ember-600 underline underline-offset-4">
                    開啟串流
                  </a>
                ) : (
                  '尚無觀看網址'
                ),
              },
            ]}
          />
        </div>
      </Panel>

      <Panel>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">接管權限</p>
        <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">遠端營運狀態</h2>
        <div className="mt-4">
          <DataList
            rows={[
              { label: '持有者', value: flight.controlLease.holder },
              { label: '模式', value: formatControlMode(flight.controlLease.mode) },
              { label: '遠端控制', value: flight.controlLease.remoteControlEnabled ? '啟用' : '停用' },
              { label: '觀察員', value: flight.controlLease.observerReady ? '已就緒' : '未就緒' },
              { label: '心跳', value: flight.controlLease.heartbeatHealthy ? '正常' : '異常' },
              {
                label: '到期',
                value: flight.controlLease.expiresAt ? formatDate(flight.controlLease.expiresAt) : '無到期時間',
              },
            ]}
          />
        </div>
      </Panel>
    </div>
  )
}

function ControlIntentPanel({
  canRequestControl,
  errorDetail,
  flight,
  intents,
  isPending,
  onRequestAction,
}: {
  canRequestControl: boolean
  errorDetail: string | null
  flight: LiveFlightDetail
  intents: Array<{
    requestId: string
    action: ControlIntentAction
    status: string
    reason: string | null
    createdAt: string
  }>
  isPending: boolean
  onRequestAction: (action: ControlIntentAction) => Promise<void>
}) {
  return (
    <Panel>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">控制意圖</p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">接管請求</h2>
          <p className="mt-2 text-sm text-chrome-700">
            控制意圖只留在營運層，不會把搖桿控制權移到 web。
          </p>
        </div>
        {canRequestControl ? (
          <div className="flex flex-wrap gap-2">
            {controlActions.map((item) => (
              <ActionButton
                key={item.action}
                type="button"
                variant="secondary"
                disabled={isPending}
                onClick={() => {
                  void onRequestAction(item.action)
                }}
              >
                {item.label}
              </ActionButton>
            ))}
          </div>
        ) : null}
      </div>
      {errorDetail ? <p className="mt-4 text-sm text-red-700">{errorDetail}</p> : null}
      <div className="mt-4 grid gap-3">
        <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
          <p className="font-medium text-chrome-950">{flight.missionName}</p>
          <p className="mt-2 text-sm text-chrome-700">
            目前接管模式：{formatControlMode(flight.controlLease.mode)}
          </p>
        </div>
        {intents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-chrome-300 bg-chrome-50/80 px-4 py-4 text-sm text-chrome-700">
            這次飛行尚未送出控制意圖。
          </div>
        ) : (
          intents.map((intent) => (
            <div key={intent.requestId} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-medium text-chrome-950">{formatControlAction(intent.action)}</span>
                <StatusBadge status={intent.status} />
              </div>
              <p className="mt-2 text-sm text-chrome-700">{intent.reason ?? '尚未提供原因。'}</p>
              <p className="mt-2 text-xs text-chrome-500">建立時間 {formatDate(intent.createdAt)}</p>
            </div>
          ))
        )}
      </div>
    </Panel>
  )
}

function RecentEventsPanel({ flight }: { flight: LiveFlightDetail }) {
  return (
    <Panel>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">近期事件</p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">飛行事件紀錄</h2>
        </div>
        <Link to={`/missions/${flight.missionId}`} className="text-sm text-ember-600 underline underline-offset-4">
          開啟任務詳情
        </Link>
      </div>
      <div className="mt-4 grid gap-3">
        {flight.recentEvents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-chrome-300 bg-chrome-50/80 px-4 py-4 text-sm text-chrome-700">
            目前沒有近期事件。
          </div>
        ) : (
          flight.recentEvents.map((event) => (
            <div key={event.eventId} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-medium text-chrome-950">{event.eventType}</span>
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-chrome-500">
                  {formatDate(event.eventTimestamp)}
                </span>
              </div>
              <pre className="mt-3 overflow-x-auto rounded-2xl bg-chrome-950 p-4 text-xs text-chrome-50">
                {JSON.stringify(event.payload, null, 2)}
              </pre>
            </div>
          ))
        )}
      </div>
    </Panel>
  )
}
