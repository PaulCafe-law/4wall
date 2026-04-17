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
  StatusBadge,
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
  formatStatus,
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
  { action: 'release_remote_control', label: '釋放遠端接管' },
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
  live: '影像正常',
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
    return '未知'
  }
  if (ageSeconds < 60) {
    return `${ageSeconds} 秒`
  }
  const minutes = Math.floor(ageSeconds / 60)
  if (minutes < 60) {
    return `${minutes} 分`
  }
  const hours = Math.floor(minutes / 60)
  return `${hours} 小時`
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
    reasons.push('觀察員尚未確認')
  }
  if (!flight.controlLease.heartbeatHealthy) {
    reasons.push('租約心跳異常')
  }

  if (reasons.length === 0) {
    return {
      title: '監看模式運作正常',
      body: '遙測、影像新鮮度與租約健康度都在可接受範圍內。這個頁面仍維持在飛行關鍵迴路之外，只提供監看與任務層級意圖。',
      tone: 'good' as const,
    }
  }

  return {
    title: '監看模式已降級',
    body: `目前因 ${reasons.join('、')} 而降級。所有判斷仍應以觀察員確認與 Android 端安全處理為準。`,
    tone: 'warning' as const,
  }
}

function buildReportingSummary(flight: LiveFlightDetail) {
  if (flight.reportStatus === 'ready' && flight.eventCount === 0) {
    return {
      title: '已產出無異常巡檢報表',
      body: '此任務已有報表檔，且未記錄異常事件。可前往任務詳情匯出 clean-pass 報表。',
      tone: 'good' as const,
    }
  }
  if (flight.reportStatus === 'ready') {
    return {
      title: '巡檢報表已就緒',
      body:
        flight.reportSummary ??
        `此任務已有 ${flight.eventCount} 筆事件可供檢視證據。`,
      tone: 'warning' as const,
    }
  }
  if (flight.reportStatus === 'failed') {
    return {
      title: '報表產生失敗',
      body:
        flight.reportSummary ??
        '報表流程未產出可用的任務報表。請前往任務詳情重新執行 demo 分析。',
      tone: 'danger' as const,
    }
  }
  if (flight.reportStatus === 'queued' || flight.reportStatus === 'generating') {
    return {
      title: '報表產生中',
      body: '分析流程已啟動，但最終報表檔案尚未就緒。',
      tone: 'warning' as const,
    }
  }
  return {
    title: '尚未產生報表',
    body: '此任務尚未具備巡檢報表。報表生成仍屬 planner-server 的非飛行關鍵責任。',
    tone: 'neutral' as const,
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
  const reportFailureCount = flights.filter((flight) => flight.reportStatus === 'failed').length

  async function onRequestAction(action: ControlIntentAction) {
    if (!effectiveFlightId) {
      return
    }
    await requestControlIntent.mutateAsync({
      action,
      reason: `${auth.user?.displayName ?? '內部使用者'} 透過即時營運頁提出「${formatControlAction(action)}」請求。`,
    })
  }

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="僅限內部"
        title="即時營運"
        subtitle="在不把瀏覽器變成飛行控制介面的前提下，監看遙測、影像新鮮度、租約狀態與任務報表脈絡。"
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="飛行工作階段" value={flights.length} hint="目前納入監看的 monitor-only 工作階段。" />
        <Metric label="遙測風險" value={telemetryRiskCount} hint="遙測延遲或缺失的工作階段。" />
        <Metric label="影像風險" value={videoRiskCount} hint="影像延遲或不可用的工作階段。" />
        <Metric label="報表阻塞" value={Math.max(reportFailureCount, alertCount)} hint="報表失敗與目前存在的飛行告警。" />
      </div>

      {flightsQuery.isLoading ? (
        <Panel>
          <p className="text-sm text-chrome-700">正在載入即時飛行工作階段…</p>
        </Panel>
      ) : null}

      {!flightsQuery.isLoading && flights.length === 0 ? (
        <EmptyState
          title="目前沒有可用的即時飛行工作階段"
          body="在 Android bridge 事件、遙測與影像中繼資料開始流入 planner-server 前，即時營運頁會保持空白。"
        />
      ) : null}

      {flights.length > 0 ? (
        <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
          <FlightList flights={flights} selectedFlightId={effectiveFlightId} onSelect={setSelectedFlightId} />
          <div className="space-y-6">
            {selectedFlight ? (
              <>
                <FlightSummaryPanel flight={selectedFlight} />
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
                  <FlightMapPanel flight={selectedFlight} />
                  <VideoAndLeaseColumn flight={selectedFlight} />
                </div>
                <ReportingPanel flight={selectedFlight} />
                <ControlIntentPanel
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
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">飛行工作階段</p>
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
                <p className="mt-1 text-sm text-chrome-700">{flight.siteName ?? '未知場域'}</p>
              </div>
              <span className={flight.alerts.length > 0 ? subtleBadgeClass('danger') : subtleBadgeClass('neutral')}>
                {flight.alerts.length > 0 ? `${flight.alerts.length} 則告警` : '穩定'}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={freshnessBadgeClass(flight.telemetryFreshness)}>{freshnessLabels[flight.telemetryFreshness]}</span>
              <span className={videoBadgeClass(flight.video.status)}>{videoLabels[flight.video.status]}</span>
              <StatusBadge status={flight.reportStatus} />
            </div>
            <p className="mt-3 text-xs text-chrome-500">
              {flight.eventCount} 筆事件｜報表 {formatStatus(flight.reportStatus)}
            </p>
          </button>
        ))}
      </div>
    </Panel>
  )
}

function FlightSummaryPanel({ flight }: { flight: LiveFlightDetail }) {
  const operatingSummary = buildOperatingSummary(flight)

  return (
    <Panel>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ember-500">任務脈絡</p>
          <h2 className="mt-2 break-words font-display text-3xl font-semibold text-chrome-950">{flight.missionName}</h2>
          <p className="mt-2 text-sm text-chrome-700">
            {flight.siteName ?? '未知場域'} / 飛行工作階段 {flight.flightId}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={freshnessBadgeClass(flight.telemetryFreshness)}>{freshnessLabels[flight.telemetryFreshness]}</span>
          <span className={videoBadgeClass(flight.video.status)}>{videoLabels[flight.video.status]}</span>
          <span className={subtleBadgeClass(flight.controlLease.remoteControlEnabled ? 'good' : 'neutral')}>
            {flight.controlLease.remoteControlEnabled ? '租約允許遠端意圖' : '租約僅供監看'}
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
          value={flight.latestTelemetry ? `${flight.latestTelemetry.batteryPct}%` : '未知'}
          hint={flight.latestTelemetry ? formatFlightState(flight.latestTelemetry.flightState) : '遙測缺失'}
        />
        <Metric label="高度" value={flight.latestTelemetry ? `${flight.latestTelemetry.altitudeM.toFixed(1)} m` : '未知'} />
        <Metric label="地速" value={flight.latestTelemetry ? `${flight.latestTelemetry.groundSpeedMps.toFixed(1)} m/s` : '未知'} />
        <Metric
          label="告警"
          value={flight.alerts.length}
          hint={flight.alerts.length > 0 ? flight.alerts.map(formatFlightAlert).join('、') : '目前沒有告警'}
        />
      </div>

      <div className="mt-5">
        <DataList
          rows={[
            { label: '組織', value: flight.organizationId },
            { label: '任務', value: flight.missionId },
            { label: '場域', value: flight.siteName ?? '未知場域' },
            { label: '最近一次遙測', value: flight.lastTelemetryAt ? formatDateTime(flight.lastTelemetryAt) : '尚無遙測資料' },
            {
              label: '遙測新鮮度',
              value: `${freshnessLabels[flight.telemetryFreshness]} / ${formatAgeSeconds(flight.telemetryAgeSeconds)}`,
            },
            { label: '最近一次飛行事件', value: flight.lastEventAt ? formatDateTime(flight.lastEventAt) : '尚無飛行事件' },
            { label: '租約模式', value: formatControlMode(flight.controlLease.mode) },
          ]}
        />
      </div>
    </Panel>
  )
}

function ReportingPanel({ flight }: { flight: LiveFlightDetail }) {
  const summary = buildReportingSummary(flight)
  const toneClass =
    summary.tone === 'good'
      ? 'border border-moss-200 bg-moss-50/70'
      : summary.tone === 'danger'
        ? 'border border-red-200 bg-red-50/70'
        : summary.tone === 'warning'
          ? 'border border-amber-200 bg-amber-50/70'
          : 'border border-chrome-200 bg-chrome-50/70'

  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">巡檢報表</p>
          <h3 className="mt-2 font-display text-2xl font-semibold text-chrome-950">任務報表脈絡</h3>
        </div>
        <Link to={`/missions/${flight.missionId}`} className="text-sm text-ember-600 underline underline-offset-4">
          開啟任務詳情
        </Link>
      </div>

      <div className={`mt-4 rounded-2xl px-4 py-4 ${toneClass}`}>
        <p className="font-medium text-chrome-950">{summary.title}</p>
        <p className="mt-2 text-sm text-chrome-700">{summary.body}</p>
      </div>

      <div className="mt-4">
        <DataList
          rows={[
            { label: '報表狀態', value: <StatusBadge status={flight.reportStatus} /> },
            { label: '產出時間', value: flight.reportGeneratedAt ? formatDateTime(flight.reportGeneratedAt) : '尚未產出' },
            { label: '事件數量', value: flight.eventCount },
            { label: '摘要', value: flight.reportSummary ?? '尚無報表摘要' },
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
          title="遙測地圖暫不可用"
          body="目前尚未取得這個工作階段的最新遙測樣本，因此地圖維持監看用的預留狀態。"
        />
      )
  }

  return (
    <Panel className="min-w-0">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">遙測地圖</p>
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
            { label: '走廊偏移量', value: `${sample.corridorDeviationM.toFixed(1)} m` },
            { label: '樣本時間', value: formatDateTime(sample.timestamp) },
            {
              label: '遙測新鮮度',
              value: `${freshnessLabels[flight.telemetryFreshness]} / ${formatAgeSeconds(flight.telemetryAgeSeconds)}`,
            },
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
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">影像通道</p>
          <span className={videoBadgeClass(flight.video.status)}>{videoLabels[flight.video.status]}</span>
        </div>
        <div className="mt-4">
          <DataList
            rows={[
                { label: '檢視連結', value: flight.video.viewerUrl ?? '不可用' },
                { label: '是否串流中', value: formatBoolean(flight.video.streaming) },
                { label: '延遲', value: flight.video.latencyMs != null ? `${flight.video.latencyMs} ms` : '未知' },
                { label: '最近一幀', value: flight.video.lastFrameAt ? formatDateTime(flight.video.lastFrameAt) : '未知' },
                { label: '影格年齡', value: formatAgeSeconds(flight.video.ageSeconds) },
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
              開啟影像檢視器
            </a>
          </div>
        ) : null}
      </Panel>

      <Panel>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">控制租約</p>
        <div className="mt-4">
          <DataList
            rows={[
              { label: '模式', value: formatControlMode(flight.controlLease.mode) },
              { label: '持有人', value: flight.controlLease.holder },
              { label: '是否允許遠端意圖', value: formatBoolean(flight.controlLease.remoteControlEnabled) },
              { label: '觀察員已確認', value: formatBoolean(flight.controlLease.observerReady) },
              { label: '心跳健康', value: formatBoolean(flight.controlLease.heartbeatHealthy) },
              { label: '到期時間', value: flight.controlLease.expiresAt ? formatDateTime(flight.controlLease.expiresAt) : '已釋放' },
            ]}
          />
        </div>
      </Panel>
    </div>
  )
}

function ControlIntentPanel({
  flight,
  intents,
  errorDetail,
  isPending,
  onRequestAction,
}: {
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
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">控制意圖</p>
          <h3 className="mt-2 font-display text-2xl font-semibold text-chrome-950">任務層級意圖請求</h3>
          <p className="mt-2 max-w-3xl text-sm text-chrome-700">
            這個頁面只記錄高階營運意圖，不會送出直接搖桿命令，也不會取代 Android 端的安全處理。
          </p>
        </div>
        <span className={subtleBadgeClass(flight.controlLease.remoteControlEnabled ? 'good' : 'neutral')}>
          {flight.controlLease.remoteControlEnabled ? '可送出遠端意圖' : '意圖路徑已關閉'}
        </span>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        {controlActions.map((item) => (
          <ActionButton
            key={item.action}
            type="button"
            disabled={isPending}
            variant={item.action === 'request_remote_control' ? 'primary' : 'secondary'}
            onClick={() => void onRequestAction(item.action)}
          >
            {item.label}
          </ActionButton>
        ))}
      </div>

      {errorDetail ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {formatApiError(errorDetail, '無法送出控制意圖。')}
        </div>
      ) : null}

      <div className="mt-6 grid gap-3">
        {intents.length === 0 ? (
          <p className="text-sm text-chrome-700">這個飛行工作階段目前尚未收到控制意圖請求。</p>
        ) : (
          intents.map((intent) => (
            <div key={intent.requestId} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-chrome-950">{formatControlAction(intent.action)}</p>
                  <p className="mt-1 text-sm text-chrome-700">{intent.reason ?? '目前沒有操作備註。'}</p>
                  <p className="mt-2 text-xs text-chrome-500">
                    申請時間 {formatDateTime(intent.createdAt)}
                    {intent.acknowledgedAt ? `｜確認時間 ${formatDateTime(intent.acknowledgedAt)}` : ''}
                  </p>
                  {intent.resolutionNote ? <p className="mt-1 text-xs text-chrome-500">{intent.resolutionNote}</p> : null}
                </div>
                <span className={intentStatusClass(intent.status)}>{formatStatus(intent.status)}</span>
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
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">最近飛行事件</p>
          <h3 className="mt-2 font-display text-2xl font-semibold text-chrome-950">最近 bridge 與租約遙測</h3>
        </div>
        <Link to={`/missions/${flight.missionId}`} className="text-sm text-ember-600 underline underline-offset-4">
          開啟任務詳情
        </Link>
      </div>

      <div className="mt-4 grid gap-3">
        {flight.recentEvents.length === 0 ? (
          <p className="text-sm text-chrome-700">目前尚未記錄最近的飛行事件。</p>
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
