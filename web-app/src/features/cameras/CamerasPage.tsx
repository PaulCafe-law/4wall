import { useEffect, useMemo, useState } from 'react'

import { DataList, EmptyState, Metric, Panel, ShellSection, formatDateTime } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuthedQuery } from '../../lib/auth-query'
import type { CameraDevice } from '../../lib/types'

function secondsSince(value: string | null): number | null {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return null
  return Math.max(0, Math.round((Date.now() - timestamp) / 1000))
}

function formatAge(value: string | null): string {
  const seconds = secondsSince(value)
  if (seconds === null) return '無資料'
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  return `${Math.round(minutes / 60)}h`
}

function formatNullableDateTime(value: string | null): string {
  return value ? formatDateTime(value) : '無資料'
}

function heartbeatLabel(camera: CameraDevice): string {
  const age = secondsSince(camera.lastHeartbeatAt)
  if (camera.lastError) return '異常'
  if (age === null) return '無心跳'
  return age <= 90 ? '連線中' : '逾時'
}

function badgeClass(value: string): string {
  if (value === '連線中' || value === 'uploaded' || value === 'skipped' || value === 'succeeded') {
    return 'bg-moss-300/40 text-moss-500'
  }
  if (value === '異常' || value === 'failed') {
    return 'bg-red-100 text-red-700'
  }
  if (value === 'queued' || value === 'pending' || value === '逾時') {
    return 'bg-amber-100 text-amber-800'
  }
  return 'bg-chrome-100 text-chrome-700'
}

function Badge({ value }: { value: string }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] ${badgeClass(value)}`}>
      {value}
    </span>
  )
}

export function CamerasPage() {
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)

  const camerasQuery = useAuthedQuery({
    queryKey: ['cameras'],
    queryFn: api.listCameras,
    staleTime: 5_000,
    refetchInterval: 10_000,
  })

  const cameras = camerasQuery.data?.cameras ?? []
  const selectedCamera = useMemo(() => {
    return cameras.find((camera) => camera.cameraId === selectedCameraId) ?? cameras[0] ?? null
  }, [cameras, selectedCameraId])

  const latestFrameId = selectedCamera?.latestFrame?.frameId ?? null
  const frameImageQuery = useAuthedQuery({
    queryKey: ['cameras', selectedCamera?.cameraId, 'latest-frame-image', latestFrameId],
    queryFn: (token) => api.fetchCameraLatestFrameBlob(token, selectedCamera?.cameraId ?? ''),
    enabled: Boolean(selectedCamera?.cameraId && selectedCamera.latestFrame?.uploadStatus === 'uploaded'),
    staleTime: 0,
    refetchInterval: 10_000,
  })

  useEffect(() => {
    if (!frameImageQuery.data) {
      setImageUrl(null)
      return
    }
    const nextUrl = URL.createObjectURL(frameImageQuery.data)
    setImageUrl(nextUrl)
    return () => URL.revokeObjectURL(nextUrl)
  }, [frameImageQuery.data])

  const onlineCount = cameras.filter((camera) => heartbeatLabel(camera) === '連線中').length
  const queuedCount = cameras.reduce((sum, camera) => sum + camera.queuedFrameCount, 0)
  const failedCount = cameras.reduce((sum, camera) => sum + camera.failedFrameCount, 0)

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="Factory Camera"
        title="固定攝影機"
        subtitle="工廠固定攝影機的最新截圖與健康狀態。"
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="攝影機" value={cameras.length} />
        <Metric label="連線中" value={onlineCount} hint="依最近心跳判斷。" />
        <Metric label="待分析" value={queuedCount} hint="已上傳但尚未完成 worker 處理。" />
        <Metric label="異常項" value={failedCount} hint="上傳或分析失敗的 frame 數。" />
      </div>

      {camerasQuery.isLoading ? (
        <Panel>
          <p className="text-sm text-chrome-700">正在讀取攝影機狀態。</p>
        </Panel>
      ) : null}

      {!camerasQuery.isLoading && cameras.length === 0 ? (
        <EmptyState title="尚無攝影機" body="目前沒有可讀取的固定攝影機裝置。" />
      ) : null}

      {selectedCamera ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="space-y-6">
            <Panel className="overflow-hidden p-0">
              <div className="flex flex-col gap-3 border-b border-chrome-200 bg-white/70 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Latest Frame</p>
                  <h2 className="mt-2 break-words font-display text-2xl font-semibold text-chrome-950">
                    {selectedCamera.name}
                  </h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge value={heartbeatLabel(selectedCamera)} />
                  {selectedCamera.latestFrame ? <Badge value={selectedCamera.latestFrame.analysisStatus} /> : null}
                </div>
              </div>
              <div className="bg-chrome-950">
                <div className="flex aspect-video items-center justify-center">
                  {imageUrl ? (
                    <img
                      key={latestFrameId}
                      src={imageUrl}
                      alt={`${selectedCamera.name} latest frame`}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="px-6 text-center text-sm text-chrome-100">
                      {frameImageQuery.isLoading ? '正在載入最新截圖。' : '尚無可顯示截圖。'}
                    </div>
                  )}
                </div>
              </div>
            </Panel>

            <Panel>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Frame Metadata</p>
              <div className="mt-4">
                <DataList
                  rows={[
                    { label: 'Frame', value: selectedCamera.latestFrame?.frameId ?? '無資料' },
                    { label: '擷取時間', value: formatNullableDateTime(selectedCamera.latestFrame?.capturedAt ?? null) },
                    { label: '上傳狀態', value: selectedCamera.latestFrame?.uploadStatus ?? '無資料' },
                    { label: '分析狀態', value: selectedCamera.latestFrame?.analysisStatus ?? '無資料' },
                    { label: '錯誤', value: selectedCamera.latestFrame?.errorMessage ?? selectedCamera.lastError ?? '無' },
                  ]}
                />
              </div>
            </Panel>
          </div>

          <div className="space-y-6">
            <Panel>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Camera List</p>
              <div className="mt-4 grid gap-3">
                {cameras.map((camera) => {
                  const active = camera.cameraId === selectedCamera.cameraId
                  return (
                    <button
                      key={camera.cameraId}
                      type="button"
                      onClick={() => setSelectedCameraId(camera.cameraId)}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                        active
                          ? 'border-ember-300 bg-white'
                          : 'border-chrome-200 bg-white/70 hover:border-chrome-400'
                      }`}
                    >
                      <span className="block break-words text-sm font-medium text-chrome-950">{camera.name}</span>
                      <span className="mt-2 flex flex-wrap gap-2">
                        <Badge value={heartbeatLabel(camera)} />
                        {camera.latestFrame ? <Badge value={camera.latestFrame.analysisStatus} /> : null}
                      </span>
                      <span className="mt-2 block text-xs text-chrome-500">最新畫面 {formatAge(camera.lastFrameAt)}</span>
                    </button>
                  )
                })}
              </div>
            </Panel>

            <Panel>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Camera Health</p>
              <div className="mt-4">
                <DataList
                  rows={[
                    { label: 'Camera', value: selectedCamera.cameraId },
                    { label: 'Site', value: selectedCamera.siteId ?? '未綁定' },
                    { label: '心跳', value: formatNullableDateTime(selectedCamera.lastHeartbeatAt) },
                    { label: '最新畫面', value: formatNullableDateTime(selectedCamera.lastFrameAt) },
                    { label: '間隔', value: `${selectedCamera.samplingIntervalSeconds}s` },
                    { label: '保留', value: `${selectedCamera.retentionDays}d` },
                  ]}
                />
              </div>
            </Panel>
          </div>
        </div>
      ) : null}
    </div>
  )
}
