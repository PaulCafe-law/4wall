import { useEffect, useMemo, useState } from 'react'

import { ActionButton, Panel, ShellSection } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuthedQuery } from '../../lib/auth-query'
import type { CameraDevice } from '../../lib/types'

const CAMERA_FRESH_MS = 90_000
const RECOGNITION_FRESH_MS = 180_000
const SNAPSHOT_FRESH_SECONDS = 30

type StatusLevel = 'loading' | 'ok' | 'warning' | 'error' | 'unknown'

interface StatusRow {
  id: string
  label: string
  level: StatusLevel
  statusText: string
  detail: string
  ageText: string | null
}

const STATUS_STYLE: Record<StatusLevel, string> = {
  loading: 'bg-chrome-100 text-chrome-700',
  ok: 'bg-moss-300/40 text-moss-500',
  warning: 'bg-amber-100 text-amber-800',
  error: 'bg-red-100 text-red-700',
  unknown: 'bg-chrome-100 text-chrome-700',
}

const STATUS_DOT: Record<StatusLevel, string> = {
  loading: 'bg-chrome-400',
  ok: 'bg-moss-500',
  warning: 'bg-amber-600',
  error: 'bg-red-600',
  unknown: 'bg-chrome-500',
}

function newestTimestamp(values: Array<string | null | undefined>): string | null {
  let newest: string | null = null
  let newestMs = Number.NEGATIVE_INFINITY
  for (const value of values) {
    if (!value) continue
    const parsed = Date.parse(value)
    if (!Number.isFinite(parsed) || parsed <= newestMs) continue
    newest = value
    newestMs = parsed
  }
  return newest
}

function ageMs(value: string | null, nowMs: number): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return null
  return Math.max(0, nowMs - parsed)
}

function relativeAgeFromMs(value: number | null): string | null {
  if (value === null) return null
  const seconds = Math.round(value / 1000)
  if (seconds < 10) return '剛剛'
  if (seconds < 60) return `${seconds} 秒前`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} 分鐘前`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} 小時前`
  return `${Math.round(hours / 24)} 天前`
}

function cameraSignalAt(camera: CameraDevice): string | null {
  return newestTimestamp([camera.lastHeartbeatAt, camera.lastFrameAt, camera.latestFrame?.capturedAt])
}

function cameraOnline(camera: CameraDevice, nowMs: number): boolean {
  if (camera.status === 'inactive' || camera.lastError) return false
  const age = ageMs(cameraSignalAt(camera), nowMs)
  return age !== null && age <= CAMERA_FRESH_MS
}

function recognitionTimestamp(camera: CameraDevice): string | null {
  return newestTimestamp([
    camera.latestOcrObservation?.receivedAt,
    camera.latestOcrObservation?.capturedAt,
    camera.latestPersonObservation?.receivedAt,
    camera.latestPersonObservation?.capturedAt,
  ])
}

function cameraStatusRow(
  cameras: CameraDevice[] | undefined,
  loading: boolean,
  failed: boolean,
  nowMs: number,
): StatusRow {
  if (loading) {
    return { id: 'cameras', label: '現場攝影機', level: 'loading', statusText: '載入中', detail: '正在讀取攝影機狀態。', ageText: null }
  }
  if (failed || !cameras) {
    return { id: 'cameras', label: '現場攝影機', level: 'error', statusText: '無法確認', detail: '目前無法讀取攝影機狀態。', ageText: null }
  }
  if (cameras.length === 0) {
    return { id: 'cameras', label: '現場攝影機', level: 'warning', statusText: '尚未接入', detail: '目前帳號沒有可讀取的攝影機。', ageText: null }
  }
  const onlineCount = cameras.filter((camera) => cameraOnline(camera, nowMs)).length
  const latestAt = newestTimestamp(cameras.map(cameraSignalAt))
  const latestAge = relativeAgeFromMs(ageMs(latestAt, nowMs))
  return {
    id: 'cameras',
    label: '現場攝影機',
    level: onlineCount === cameras.length ? 'ok' : onlineCount > 0 ? 'warning' : 'error',
    statusText: onlineCount === cameras.length ? '正常' : onlineCount > 0 ? '部分逾時' : '連線逾時',
    detail: `${onlineCount}/${cameras.length} 支攝影機最近 90 秒內有回報。`,
    ageText: latestAge ? `最近一次在 ${latestAge}` : null,
  }
}

function recognitionStatusRow(
  cameras: CameraDevice[] | undefined,
  loading: boolean,
  failed: boolean,
  nowMs: number,
): StatusRow {
  if (loading) {
    return { id: 'recognition', label: '3090 辨識主機', level: 'loading', statusText: '載入中', detail: '正在讀取最近辨識結果。', ageText: null }
  }
  if (failed || !cameras) {
    return { id: 'recognition', label: '3090 辨識主機', level: 'error', statusText: '無法確認', detail: '目前無法讀取辨識結果。', ageText: null }
  }
  const latestAt = newestTimestamp(cameras.map(recognitionTimestamp))
  const latestAgeMs = ageMs(latestAt, nowMs)
  if (latestAgeMs === null) {
    return { id: 'recognition', label: '3090 辨識主機', level: 'unknown', statusText: '尚無資料', detail: '尚未收到機台畫面或人員辨識結果。', ageText: null }
  }
  const fresh = latestAgeMs <= RECOGNITION_FRESH_MS
  const relativeAge = relativeAgeFromMs(latestAgeMs)
  return {
    id: 'recognition',
    label: '3090 辨識主機',
    level: fresh ? 'ok' : 'warning',
    statusText: fresh ? '正常' : '辨識資料已過期',
    detail: '依最近的機台畫面或人員辨識結果判定。',
    ageText: relativeAge ? `最近一次在 ${relativeAge}` : null,
  }
}

function StatusLine({ row }: { row: StatusRow }) {
  return (
    <div className="grid gap-3 py-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center" data-testid={`status-${row.id}`}>
      <div className="flex min-w-0 items-start gap-3">
        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT[row.level]}`} aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold text-chrome-950">{row.label}</h2>
          <p className="mt-1 text-sm leading-6 text-chrome-700">{row.detail}</p>
          {row.ageText ? <p className="mt-1 font-mono text-xs text-chrome-500">{row.ageText}</p> : null}
        </div>
      </div>
      <span className={`w-fit rounded px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[row.level]}`}>
        {row.statusText}
      </span>
    </div>
  )
}

export function SystemStatusPage() {
  const [nowMs, setNowMs] = useState(0)
  const healthQuery = useAuthedQuery({
    queryKey: ['system-status', 'health'],
    queryFn: () => api.getHealth(),
    refetchInterval: 15_000,
  })
  const camerasQuery = useAuthedQuery({
    queryKey: ['system-status', 'cameras'],
    queryFn: api.listCameras,
    refetchInterval: 15_000,
  })
  const assistantQuery = useAuthedQuery({
    queryKey: ['system-status', 'assistant'],
    queryFn: api.getTwinAgentStatus,
    refetchInterval: 15_000,
  })

  useEffect(() => {
    const updateNow = () => setNowMs(Date.now())
    updateNow()
    const timer = window.setInterval(updateNow, 10_000)
    return () => window.clearInterval(timer)
  }, [])

  const rows = useMemo<StatusRow[]>(() => {
    const database: StatusRow = healthQuery.isLoading
      ? { id: 'database', label: '資料庫', level: 'loading', statusText: '載入中', detail: '正在檢查資料庫連線。', ageText: null }
      : healthQuery.isError || !healthQuery.data
        ? { id: 'database', label: '資料庫', level: 'error', statusText: '無法確認', detail: '健康檢查目前沒有回應。', ageText: null }
        : healthQuery.data.dependencies.database.status === 'ok'
          ? { id: 'database', label: '資料庫', level: 'ok', statusText: '正常', detail: '資料庫查詢成功。', ageText: null }
          : { id: 'database', label: '資料庫', level: 'error', statusText: '異常', detail: '資料庫健康檢查失敗。', ageText: null }

    const assistant: StatusRow = assistantQuery.isLoading
      ? { id: 'assistant', label: '4WALL AI 助手', level: 'loading', statusText: '載入中', detail: '正在檢查助手工作程式。', ageText: null }
      : assistantQuery.isError || !assistantQuery.data
        ? { id: 'assistant', label: '4WALL AI 助手', level: 'error', statusText: '無法確認', detail: '目前無法取得助手狀態。', ageText: null }
        : !assistantQuery.data.workerOnline
          ? { id: 'assistant', label: '4WALL AI 助手', level: 'error', statusText: '離線', detail: '助手工作程式沒有在期限內回報。', ageText: assistantQuery.data.workerLastSeenSeconds === null ? null : `最近一次在 ${relativeAgeFromMs(assistantQuery.data.workerLastSeenSeconds * 1000)}` }
          : !assistantQuery.data.snapshotAvailable
            ? { id: 'assistant', label: '4WALL AI 助手', level: 'warning', statusText: '等待現場資料', detail: '助手在線，但尚未收到這個工廠的現場快照。', ageText: null }
            : (assistantQuery.data.snapshotAgeSeconds ?? Number.POSITIVE_INFINITY) > SNAPSHOT_FRESH_SECONDS
              ? { id: 'assistant', label: '4WALL AI 助手', level: 'warning', statusText: '現場資料已過期', detail: '助手在線，但現場快照沒有持續更新。', ageText: `最近一次在 ${relativeAgeFromMs((assistantQuery.data.snapshotAgeSeconds ?? 0) * 1000)}` }
              : { id: 'assistant', label: '4WALL AI 助手', level: 'ok', statusText: '正常', detail: '助手工作程式與現場快照都持續更新。', ageText: `最近一次在 ${relativeAgeFromMs((assistantQuery.data.snapshotAgeSeconds ?? 0) * 1000)}` }

    return [
      { id: 'website', label: '網站', level: 'ok', statusText: '正常', detail: '目前頁面已正常開啟。', ageText: null },
      cameraStatusRow(camerasQuery.data?.cameras, camerasQuery.isLoading || nowMs === 0, camerasQuery.isError, nowMs),
      recognitionStatusRow(camerasQuery.data?.cameras, camerasQuery.isLoading || nowMs === 0, camerasQuery.isError, nowMs),
      assistant,
      database,
    ]
  }, [assistantQuery.data, assistantQuery.isError, assistantQuery.isLoading, camerasQuery.data, camerasQuery.isError, camerasQuery.isLoading, healthQuery.data, healthQuery.isError, healthQuery.isLoading, nowMs])

  const issueCount = rows.filter((row) => row.level === 'warning' || row.level === 'error' || row.level === 'unknown').length
  const loadingCount = rows.filter((row) => row.level === 'loading').length
  const refreshing = healthQuery.isFetching || camerasQuery.isFetching || assistantQuery.isFetching

  const refresh = async () => {
    setNowMs(Date.now())
    await Promise.all([healthQuery.refetch(), camerasQuery.refetch(), assistantQuery.refetch()])
  }

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="系統狀態"
        title="現場服務狀態"
        subtitle="集中查看網站、攝影機、辨識主機、4WALL AI 助手與資料庫最近是否持續更新。"
        action={
          <ActionButton variant="secondary" onClick={() => void refresh()} disabled={refreshing}>
            {refreshing ? '檢查中' : '重新檢查'}
          </ActionButton>
        }
      />

      <div
        className={`border-l-4 px-4 py-3 text-sm ${
          loadingCount > 0
            ? 'border-chrome-400 bg-chrome-50 text-chrome-700'
            : issueCount === 0
              ? 'border-moss-500 bg-moss-50 text-moss-700'
              : 'border-amber-600 bg-amber-50 text-amber-900'
        }`}
        aria-live="polite"
      >
        {loadingCount > 0
          ? `正在檢查 ${loadingCount} 個項目。`
          : issueCount === 0
            ? '目前所有項目都正常。'
            : `目前有 ${issueCount} 個項目需要注意。`}
      </div>

      <Panel className="divide-y divide-chrome-200 py-0">
        {rows.map((row) => <StatusLine key={row.id} row={row} />)}
      </Panel>

      <p className="text-xs leading-5 text-chrome-500">
        3090 狀態依最近的機台畫面與人員辨識結果判定，不會顯示主機位址或內部工作程式資訊。
      </p>
    </div>
  )
}
