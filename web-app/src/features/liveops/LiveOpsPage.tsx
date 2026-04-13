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
  formatDate,
} from '../../components/ui'
import { api, ApiError, type ControlIntentPayload } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAuthedMutation, useAuthedQuery } from '../../lib/auth-query'
import {
  formatApiError,
  formatControlAction,
  formatControlMode,
  formatFlightAlert,
  formatFlightState,
} from '../../lib/presentation'
import type { ControlIntentAction, LiveFlightDetail, LiveFlightSummary } from '../../lib/types'

const controlActions: Array<{ action: ControlIntentAction; label: string }> = [
  { action: 'request_remote_control', label: '申請遠端接管' },
  { action: 'release_remote_control', label: '釋放遠端控制' },
  { action: 'pause_mission', label: '請求暫停任務' },
  { action: 'resume_mission', label: '請求繼續任務' },
  { action: 'hold', label: '請求保持位置' },
  { action: 'return_to_home', label: '請求返航' },
]

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
  const canRequestControl = auth.isInternal && Boolean(selectedFlight)
  const remoteActiveCount = flights.filter(
    (flight) => flight.controlLease.mode === 'remote_control_active',
  ).length
  const alertCount = flights.filter((flight) => flight.alerts.length > 0).length

  const onRequestAction = async (action: ControlIntentAction) => {
    if (!effectiveFlightId) {
      return
    }
    await requestControlIntent.mutateAsync({
      action,
      reason: `${formatControlAction(action)}，由 ${auth.user?.displayName ?? 'web user'} 發起。`,
    })
  }

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="即時監看"
        title="飛行監看"
        subtitle="僅供內部營運查看現場飛行狀態、控制權租約、遙測新鮮度與直播入口。這裡只送出高階控制請求，不直接下連續飛控指令。"
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="目前飛行中" value={flights.length} hint="依最近的 flight session 與遙測推導。" />
        <Metric label="遠端控制中" value={remoteActiveCount} hint="只有 lease 生效才會顯示。" />
        <Metric label="需要注意" value={alertCount} hint="包含低電量、遙測中斷與 bridge 告警。" />
      </div>

      {flightsQuery.isLoading ? (
        <Panel>
          <p className="text-sm text-chrome-700">正在讀取飛行監看資料。</p>
        </Panel>
      ) : null}

      {!flightsQuery.isLoading && flights.length === 0 ? (
        <EmptyState
          title="目前沒有可監看的飛行"
          body="等 Android bridge 開始上傳 flight event 與 telemetry 後，這裡會顯示現場飛行會話。"
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
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
                  <FlightMapPanel flight={selectedFlight} />
                  <VideoAndLeasePanel flight={selectedFlight} />
                </div>
                <ControlIntentPanel
                  canRequestControl={canRequestControl}
                  errorDetail={requestControlIntent.error instanceof ApiError ? requestControlIntent.error.detail : undefined}
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
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">飛行會話</p>
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
              <StatusBadge
                status={
                  flight.alerts.length > 0
                    ? 'failed'
                    : flight.controlLease.mode === 'remote_control_active'
                      ? 'ready'
                      : 'planning'
                }
              />
            </div>
            <p className="mt-1 text-sm text-chrome-700">{flight.siteName ?? '未綁定場址'}</p>
            <p className="mt-2 break-all font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">
              {flight.flightId}
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
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ember-500">現場飛行</p>
          <h2 className="mt-2 break-words font-display text-3xl font-semibold text-chrome-950">
            {flight.missionName}
          </h2>
          <p className="mt-2 text-sm text-chrome-700">
            {flight.siteName ?? '未綁定場址'} / 任務 {flight.missionId}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {flight.alerts.length === 0 ? (
            <span className="rounded-full bg-moss-300/40 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-moss-500">
              無即時告警
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
      <div className="mt-5 grid gap-4 md:grid-cols-4">
        <Metric
          label="電量"
          value={flight.latestTelemetry ? `${flight.latestTelemetry.batteryPct}%` : '—'}
          hint={flight.latestTelemetry ? formatFlightState(flight.latestTelemetry.flightState) : '尚未收到遙測'}
        />
        <Metric
          label="高度"
          value={flight.latestTelemetry ? `${flight.latestTelemetry.altitudeM.toFixed(1)} m` : '—'}
          hint="最新樣本"
        />
        <Metric
          label="速度"
          value={flight.latestTelemetry ? `${flight.latestTelemetry.groundSpeedMps.toFixed(1)} m/s` : '—'}
          hint="地速"
        />
        <Metric
          label="控制權"
          value={formatControlMode(flight.controlLease.mode)}
          hint={flight.controlLease.holder}
        />
      </div>
    </Panel>
  )
}

function FlightMapPanel({ flight }: { flight: LiveFlightDetail }) {
  const sample = flight.latestTelemetry

  return (
    <Panel className="min-w-0">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">即時地圖</p>
      {sample ? (
        <>
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
                { label: '更新時間', value: formatDate(sample.timestamp) },
              ]}
            />
          </div>
        </>
      ) : (
        <EmptyState
          title="尚未收到定位資料"
          body="待 Android bridge 上傳遙測樣本後，這裡才會顯示飛行器位置。"
        />
      )}
    </Panel>
  )
}

function VideoAndLeasePanel({ flight }: { flight: LiveFlightDetail }) {
  return (
    <div className="space-y-6">
      <Panel>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">影像通道</p>
        {flight.video.viewerUrl ? (
          <>
            <div className="mt-4 overflow-hidden rounded-[1.5rem] border border-chrome-200 bg-chrome-950/90">
              <iframe
                title="即時影像"
                className="h-[14rem] w-full bg-black"
                loading="lazy"
                src={flight.video.viewerUrl}
              />
            </div>
            <div className="mt-4 space-y-3">
              <p className="text-sm text-chrome-700">
                直播狀態：{flight.video.streaming ? '串流中' : '已建立但未串流'}
              </p>
              <a
                href={flight.video.viewerUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-full border border-chrome-300 bg-white px-4 py-2 text-sm text-chrome-950"
              >
                在新分頁開啟直播
              </a>
            </div>
          </>
        ) : (
          <p className="mt-4 text-sm text-chrome-700">目前沒有可用的 viewer URL。</p>
        )}
      </Panel>

      <Panel>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">控制權租約</p>
        <div className="mt-4">
          <DataList
            rows={[
              { label: '模式', value: formatControlMode(flight.controlLease.mode) },
              { label: '持有人', value: flight.controlLease.holder },
              { label: '可接管', value: flight.controlLease.remoteControlEnabled ? '是' : '否' },
              { label: '現場觀察員', value: flight.controlLease.observerReady ? '已就緒' : '未就緒' },
              { label: '心跳健康', value: flight.controlLease.heartbeatHealthy ? '正常' : '異常' },
              { label: '到期時間', value: flight.controlLease.expiresAt ? formatDate(flight.controlLease.expiresAt) : '未設定' },
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
  errorDetail: string | undefined
  flight: LiveFlightDetail
  intents: Array<{
    requestId: string
    action: ControlIntentAction
    status: string
    reason: string | null
    requestedByUserId: string | null
    createdAt: string
    resolutionNote: string | null
  }>
  isPending: boolean
  onRequestAction: (action: ControlIntentAction) => Promise<void>
}) {
  return (
    <Panel>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">高階控制請求</p>
          <h3 className="mt-2 font-display text-2xl font-semibold text-chrome-950">由 web 提出控制意圖</h3>
          <p className="mt-2 max-w-3xl text-sm text-chrome-700">
            只有內部營運與管理員可在這裡提出高階控制請求；實際仲裁仍由現場控制站、Android bridge 與 RC 負責。
          </p>
        </div>
        {!canRequestControl ? (
          <span className="rounded-full bg-chrome-100 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-chrome-700">
            尚未選擇可操作的飛行會話
          </span>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        {controlActions.map((item) => (
          <ActionButton
            key={item.action}
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
          {formatApiError(errorDetail, '送出控制請求失敗，請稍後再試。')}
        </div>
      ) : null}

      <div className="mt-6 grid gap-3">
        {intents.length === 0 ? (
          <p className="text-sm text-chrome-700">目前沒有控制請求紀錄。</p>
        ) : (
          intents.map((intent) => (
            <div key={intent.requestId} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-chrome-950">{formatControlAction(intent.action)}</p>
                  <p className="mt-1 text-sm text-chrome-700">{intent.reason ?? '未填寫原因'}</p>
                </div>
                <StatusBadge status={intent.status === 'accepted' ? 'ready' : intent.status === 'rejected' ? 'failed' : 'planning'} />
              </div>
              <p className="mt-3 text-xs text-chrome-500">
                {flight.flightId} / {formatDate(intent.createdAt)}
                {intent.resolutionNote ? ` / ${intent.resolutionNote}` : ''}
              </p>
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
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">最近事件</p>
      <div className="mt-4 grid gap-3">
        {flight.recentEvents.length === 0 ? (
          <p className="text-sm text-chrome-700">目前沒有最近事件。</p>
        ) : (
          flight.recentEvents.map((event) => (
            <div key={event.eventId} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-chrome-950">{event.eventType}</p>
                  <p className="mt-1 text-sm text-chrome-700">{formatDate(event.eventTimestamp)}</p>
                </div>
                <pre className="max-w-full overflow-x-auto rounded-2xl bg-chrome-950 p-4 text-xs text-chrome-50 md:max-w-xl">
                  {JSON.stringify(event.payload, null, 2)}
                </pre>
              </div>
            </div>
          ))
        )}
      </div>
      {flight.siteId ? (
        <div className="mt-4">
          <Link to={`/missions/${flight.missionId}`} className="text-sm text-ember-600 underline underline-offset-4">
            前往任務詳情與成果下載
          </Link>
        </div>
      ) : null}
    </Panel>
  )
}

function buildMapEmbedUrl(lat: number, lng: number): string {
  const delta = 0.004
  const bbox = [lng - delta, lat - delta, lng + delta, lat + delta].join('%2C')
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`
}
