import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import {
  ActionButton,
  DataList,
  EmptyState,
  Metric,
  Panel,
  ShellSection,
  formatDateTime,
} from '../../components/ui'
import { api, ApiError, type ControlIntentPayload } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAuthedMutation, useAuthedQuery } from '../../lib/auth-query'
import {
  formatApiError,
  formatBoolean,
  formatControlAction,
  formatControlMode,
  formatFlightAlert,
  formatFlightState,
} from '../../lib/presentation'
import type {
  ControlIntent,
  ControlIntentAction,
  LiveFlightDetail,
  LiveFlightSummary,
  TelemetryFreshness,
  VideoAvailability,
} from '../../lib/types'

const controlActions: Array<{ action: ControlIntentAction; label: string }> = [
  { action: 'request_remote_control', label: '申請遠端接管' },
  { action: 'release_remote_control', label: '釋放遠端控制' },
  { action: 'pause_mission', label: '暫停任務' },
  { action: 'resume_mission', label: '恢復任務' },
  { action: 'hold', label: '保持待命' },
  { action: 'return_to_home', label: '返航' },
]

const freshnessLabels: Record<TelemetryFreshness, string> = {
  fresh: '遙測正常',
  stale: '遙測延遲',
  missing: '遙測缺失',
}

const videoLabels: Record<VideoAvailability, string> = {
  live: '影像可用',
  stale: '影像延遲',
  unavailable: '影像不可用',
}

function subtleBadgeClass(kind: 'good' | 'warning' | 'danger' | 'neutral') {
  if (kind === 'good') {
    return 'rounded-full bg-moss-300/40 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-moss-600'
  }
  if (kind === 'warning') {
    return 'rounded-full bg-amber-100 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-amber-800'
  }
  if (kind === 'danger') {
    return 'rounded-full bg-red-100 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-red-700'
  }
  return 'rounded-full bg-chrome-100 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-chrome-700'
}

function freshnessBadgeClass(freshness: TelemetryFreshness) {
  if (freshness === 'fresh') {
    return subtleBadgeClass('good')
  }
  if (freshness === 'stale') {
    return subtleBadgeClass('warning')
  }
  return subtleBadgeClass('danger')
}

function videoBadgeClass(status: VideoAvailability) {
  if (status === 'live') {
    return subtleBadgeClass('good')
  }
  if (status === 'stale') {
    return subtleBadgeClass('warning')
  }
  return subtleBadgeClass('danger')
}

function intentStatusClass(status: ControlIntent['status']) {
  if (status === 'accepted') {
    return subtleBadgeClass('good')
  }
  if (status === 'rejected' || status === 'superseded') {
    return subtleBadgeClass('danger')
  }
  return subtleBadgeClass('warning')
}

function formatAgeSeconds(ageSeconds: number | null): string {
  if (ageSeconds == null) {
    return '未提供'
  }
  if (ageSeconds < 60) {
    return `${ageSeconds} 秒前`
  }
  const minutes = Math.floor(ageSeconds / 60)
  if (minutes < 60) {
    return `${minutes} 分鐘前`
  }
  const hours = Math.floor(minutes / 60)
  return `${hours} 小時前`
}

function buildOperatingSummary(flight: LiveFlightDetail) {
  const reasons: string[] = []

  if (flight.telemetryFreshness !== 'fresh') {
    reasons.push(freshnessLabels[flight.telemetryFreshness])
  }
  if (flight.video.status !== 'live') {
    reasons.push(videoLabels[flight.video.status])
  }
  if (!flight.controlLease.observerReady) {
    reasons.push('現場 observer 未就緒')
  }
  if (!flight.controlLease.heartbeatHealthy) {
    reasons.push('lease heartbeat 異常')
  }

  if (reasons.length === 0) {
    return {
      title: '目前可作為內部監看與任務級協調依據',
      body: '遙測、影像與 lease 狀態目前都在可用範圍內。這裡仍然只送出高階控制意圖，不直接下連續飛控指令。',
      tone: 'good' as const,
    }
  }

  return {
    title: '目前以 monitor-only 為主',
    body: `請先處理 ${reasons.join('、')}，再決定是否需要要求現場 observer 或 Android bridge 介入。`,
    tone: 'warning' as const,
  }
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
  const telemetryRiskCount = flights.filter((flight) => flight.telemetryFreshness !== 'fresh').length
  const videoRiskCount = flights.filter((flight) => flight.video.status !== 'live').length
  const alertCount = flights.filter((flight) => flight.alerts.length > 0).length
  const remoteActiveCount = flights.filter(
    (flight) => flight.controlLease.mode === 'remote_control_active',
  ).length

  const onRequestAction = async (action: ControlIntentAction) => {
    if (!effectiveFlightId) {
      return
    }
    await requestControlIntent.mutateAsync({
      action,
      reason: `${formatControlAction(action)}，由 ${auth.user?.displayName ?? 'internal user'} 從 Live Ops 提出。`,
    })
  }

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="Internal Only"
        title="Live Ops"
        subtitle="這裡只提供內部監看、lease 狀態與任務級 control intent。任何資料不完整時，都應先降級成 monitor-only。"
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="目前飛行" value={flights.length} hint="依最近 flight session 與遙測彙整。" />
        <Metric label="遙測異常" value={telemetryRiskCount} hint="包含 stale 與 missing。" />
        <Metric label="影像異常" value={videoRiskCount} hint="包含 stale 與 unavailable。" />
        <Metric label="需要判斷" value={Math.max(alertCount, remoteActiveCount)} hint="告警與遠端控制狀態需人工確認。" />
      </div>

      {flightsQuery.isLoading ? (
        <Panel>
          <p className="text-sm text-chrome-700">正在載入現場 flight session。</p>
        </Panel>
      ) : null}

      {!flightsQuery.isLoading && flights.length === 0 ? (
        <EmptyState
          title="目前沒有可監看的 flight session"
          body="等 Android bridge 開始上傳 flight event、telemetry 與 video metadata 後，這裡才會顯示現場狀態。"
        />
      ) : null}

      {flights.length > 0 ? (
        <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
          <FlightList
            flights={flights}
            selectedFlightId={effectiveFlightId}
            onSelect={setSelectedFlightId}
          />
          <div className="space-y-6">
            {selectedFlight ? (
              <>
                <FlightSummaryPanel flight={selectedFlight} />
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
                  <FlightMapPanel flight={selectedFlight} />
                  <VideoAndLeaseColumn flight={selectedFlight} />
                </div>
                <ControlIntentPanel
                  canRequestControl={auth.isInternal && Boolean(selectedFlight)}
                  flight={selectedFlight}
                  intents={intentsQuery.data ?? []}
                  errorDetail={requestControlIntent.error instanceof ApiError ? requestControlIntent.error.detail : undefined}
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
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Flight Sessions</p>
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
            aria-label={`select-flight-${flight.flightId}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="break-words font-medium text-chrome-950">{flight.missionName}</h2>
                <p className="mt-1 text-sm text-chrome-700">{flight.siteName ?? '未綁定場址'}</p>
              </div>
              <span className={flight.alerts.length > 0 ? subtleBadgeClass('danger') : subtleBadgeClass('neutral')}>
                {flight.alerts.length > 0 ? `${flight.alerts.length} 則告警` : '正常'}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={freshnessBadgeClass(flight.telemetryFreshness)}>{freshnessLabels[flight.telemetryFreshness]}</span>
              <span className={videoBadgeClass(flight.video.status)}>{videoLabels[flight.video.status]}</span>
            </div>
            <p className="mt-3 break-all font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">
              {flight.flightId}
            </p>
          </button>
        ))}
      </div>
    </Panel>
  )
}

function FlightSummaryPanel({ flight }: { flight: LiveFlightDetail }) {
  const operatingSummary = buildOperatingSummary(flight)
  const sample = flight.latestTelemetry

  return (
    <Panel>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ember-500">Mission Context</p>
          <h2 className="mt-2 break-words font-display text-3xl font-semibold text-chrome-950">{flight.missionName}</h2>
          <p className="mt-2 text-sm text-chrome-700">
            {flight.siteName ?? '未綁定場址'} / flight {flight.flightId}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={freshnessBadgeClass(flight.telemetryFreshness)}>{freshnessLabels[flight.telemetryFreshness]}</span>
          <span className={videoBadgeClass(flight.video.status)}>{videoLabels[flight.video.status]}</span>
          <span className={subtleBadgeClass(flight.controlLease.remoteControlEnabled ? 'good' : 'neutral')}>
            {flight.controlLease.remoteControlEnabled ? 'lease 可接受 control intent' : 'lease 尚未開放'}
          </span>
        </div>
      </div>

      <div
        className={
          operatingSummary.tone === 'good'
            ? 'mt-5 rounded-2xl border border-moss-200 bg-moss-50/80 px-4 py-4'
            : 'mt-5 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-4'
        }
      >
        <p className="font-medium text-chrome-950">{operatingSummary.title}</p>
        <p className="mt-2 text-sm text-chrome-700">{operatingSummary.body}</p>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-4">
        <Metric
          label="電量"
          value={sample ? `${sample.batteryPct}%` : '—'}
          hint={sample ? formatFlightState(sample.flightState) : '尚未收到遙測'}
        />
        <Metric label="高度" value={sample ? `${sample.altitudeM.toFixed(1)} m` : '—'} hint="最新樣本" />
        <Metric label="速度" value={sample ? `${sample.groundSpeedMps.toFixed(1)} m/s` : '—'} hint="地速" />
        <Metric label="告警" value={flight.alerts.length} hint={flight.alerts.length > 0 ? flight.alerts.map(formatFlightAlert).join('、') : '目前沒有告警'} />
      </div>

      <div className="mt-5">
        <DataList
          rows={[
            { label: '組織', value: flight.organizationId },
            { label: '任務', value: flight.missionId },
            { label: '場址', value: flight.siteName ?? '未綁定場址' },
            { label: '遙測更新', value: flight.lastTelemetryAt ? formatDateTime(flight.lastTelemetryAt) : '尚未收到' },
            { label: '遙測新鮮度', value: `${freshnessLabels[flight.telemetryFreshness]} / ${formatAgeSeconds(flight.telemetryAgeSeconds)}` },
            { label: '最近事件', value: flight.lastEventAt ? formatDateTime(flight.lastEventAt) : '尚未收到' },
            { label: '控制模式', value: formatControlMode(flight.controlLease.mode) },
          ]}
        />
      </div>
    </Panel>
  )
}

function FlightMapPanel({ flight }: { flight: LiveFlightDetail }) {
  const sample = flight.latestTelemetry

  if (!sample) {
    return (
      <EmptyState
        title="尚未收到定位資料"
        body="沒有 telemetry sample 時，Live Ops 只應該維持 monitor-only，不應推導現場位置。"
      />
    )
  }

  return (
    <Panel className="min-w-0">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Telemetry Map</p>
      <div className="mt-4 overflow-hidden rounded-[1.5rem] border border-chrome-200 bg-chrome-50">
        <iframe
          title="飛行位置地圖"
          className="h-[20rem] w-full"
          loading="lazy"
          src={buildMapEmbedUrl(sample.lat, sample.lng)}
        />
      </div>
      <div className="mt-4">
        <DataList
          rows={[
            { label: '座標', value: `${sample.lat.toFixed(5)}, ${sample.lng.toFixed(5)}` },
            { label: '偏移', value: `${sample.corridorDeviationM.toFixed(1)} m` },
            { label: '更新時間', value: formatDateTime(sample.timestamp) },
            { label: '新鮮度', value: `${freshnessLabels[flight.telemetryFreshness]} / ${formatAgeSeconds(flight.telemetryAgeSeconds)}` },
          ]}
        />
      </div>
    </Panel>
  )
}

function VideoAndLeaseColumn({ flight }: { flight: LiveFlightDetail }) {
  return (
    <div className="space-y-6">
      <Panel>
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Video Channel</p>
          <span className={videoBadgeClass(flight.video.status)}>{videoLabels[flight.video.status]}</span>
        </div>
        <div className="mt-4">
          <DataList
            rows={[
              { label: 'viewer URL', value: flight.video.viewerUrl ?? '未提供' },
              { label: '串流中', value: formatBoolean(flight.video.streaming) },
              { label: '延遲', value: flight.video.latencyMs != null ? `${flight.video.latencyMs} ms` : '未提供' },
              { label: '最近畫面', value: flight.video.lastFrameAt ? formatDateTime(flight.video.lastFrameAt) : '未提供' },
              { label: '畫面年齡', value: formatAgeSeconds(flight.video.ageSeconds) },
            ]}
          />
        </div>
        {flight.video.viewerUrl ? (
          <div className="mt-4">
            <a
              href={flight.video.viewerUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex rounded-full border border-chrome-300 bg-white px-4 py-2 text-sm text-chrome-950"
            >
              在新分頁開啟 viewer
            </a>
          </div>
        ) : null}
      </Panel>

      <Panel>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Control Lease</p>
        <div className="mt-4">
          <DataList
            rows={[
              { label: '模式', value: formatControlMode(flight.controlLease.mode) },
              { label: '持有人', value: flight.controlLease.holder },
              { label: '可送意圖', value: formatBoolean(flight.controlLease.remoteControlEnabled) },
              { label: 'observer', value: formatBoolean(flight.controlLease.observerReady) },
              { label: 'heartbeat', value: formatBoolean(flight.controlLease.heartbeatHealthy) },
              { label: '到期', value: flight.controlLease.expiresAt ? formatDateTime(flight.controlLease.expiresAt) : '未設定' },
            ]}
          />
        </div>
      </Panel>
    </div>
  )
}

function ControlIntentPanel({
  canRequestControl,
  flight,
  intents,
  errorDetail,
  isPending,
  onRequestAction,
}: {
  canRequestControl: boolean
  flight: LiveFlightDetail
  intents: ControlIntent[]
  errorDetail?: string
  isPending: boolean
  onRequestAction: (action: ControlIntentAction) => Promise<void>
}) {
  return (
    <Panel>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Control Intent</p>
          <h3 className="mt-2 font-display text-2xl font-semibold text-chrome-950">只提出任務級控制意圖</h3>
          <p className="mt-2 max-w-3xl text-sm text-chrome-700">
            這裡不直接控制飛機。web 只記錄與送出高階意圖，實際仲裁仍由現場 observer、Android bridge 與 RC 負責。
          </p>
        </div>
        <span className={subtleBadgeClass(flight.controlLease.remoteControlEnabled ? 'good' : 'neutral')}>
          {flight.controlLease.remoteControlEnabled ? '目前可送意圖' : '目前先監看'}
        </span>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        {controlActions.map((item) => (
          <ActionButton
            key={item.action}
            type="button"
            disabled={!canRequestControl || isPending}
            variant={item.action === 'request_remote_control' ? 'primary' : 'secondary'}
            onClick={() => void onRequestAction(item.action)}
          >
            {item.label}
          </ActionButton>
        ))}
      </div>

      {errorDetail ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {formatApiError(errorDetail, '送出 control intent 失敗，請稍後再試。')}
        </div>
      ) : null}

      <div className="mt-6 grid gap-3">
        {intents.length === 0 ? (
          <p className="text-sm text-chrome-700">目前沒有 control intent 紀錄。</p>
        ) : (
          intents.map((intent) => (
            <div key={intent.requestId} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-chrome-950">{formatControlAction(intent.action)}</p>
                  <p className="mt-1 text-sm text-chrome-700">{intent.reason ?? '未填寫理由'}</p>
                  <p className="mt-2 text-xs text-chrome-500">
                    建立於 {formatDateTime(intent.createdAt)}
                    {intent.acknowledgedAt ? ` / 回應於 ${formatDateTime(intent.acknowledgedAt)}` : ''}
                  </p>
                  {intent.resolutionNote ? <p className="mt-1 text-xs text-chrome-500">{intent.resolutionNote}</p> : null}
                </div>
                <span className={intentStatusClass(intent.status)}>{intent.status}</span>
              </div>
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
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Recent Events</p>
          <h3 className="mt-2 font-display text-2xl font-semibold text-chrome-950">最近事件與現場線索</h3>
        </div>
        <Link to={`/missions/${flight.missionId}`} className="text-sm text-ember-600 underline underline-offset-4">
          前往任務詳情
        </Link>
      </div>

      <div className="mt-4 grid gap-3">
        {flight.recentEvents.length === 0 ? (
          <p className="text-sm text-chrome-700">目前沒有最近事件。</p>
        ) : (
          flight.recentEvents.map((event) => (
            <div key={event.eventId} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-chrome-950">{event.eventType}</p>
                  <p className="mt-1 text-sm text-chrome-700">{formatDateTime(event.eventTimestamp)}</p>
                </div>
                <pre className="max-w-full overflow-x-auto rounded-2xl bg-chrome-950 p-4 text-xs text-chrome-50 md:max-w-xl">
                  {JSON.stringify(event.payload, null, 2)}
                </pre>
              </div>
            </div>
          ))
        )}
      </div>
    </Panel>
  )
}

function buildMapEmbedUrl(lat: number, lng: number): string {
  const delta = 0.004
  const bbox = [lng - delta, lat - delta, lng + delta, lat + delta].join('%2C')
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`
}
