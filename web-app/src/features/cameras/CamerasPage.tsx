import { useEffect, useMemo, useState } from 'react'

import { DataList, EmptyState, Field, Metric, Panel, Select, ShellSection, formatDateTime } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuthedQuery } from '../../lib/auth-query'
import type { CameraDevice, CameraGaugeReading } from '../../lib/types'

function secondsSince(value: string | null): number | null {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return null
  return Math.max(0, Math.round((Date.now() - timestamp) / 1000))
}

function formatAge(value: string | null): string {
  const seconds = secondsSince(value)
  if (seconds === null) return '尚無'
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  return `${Math.round(minutes / 60)}h`
}

function formatNullableDateTime(value: string | null): string {
  return value ? formatDateTime(value) : '尚無'
}

function heartbeatLabel(camera: CameraDevice): string {
  const age = secondsSince(camera.lastHeartbeatAt)
  if (camera.lastError) return '異常'
  if (age === null) return '未知'
  return age <= 90 ? '連線中' : '逾時'
}

function badgeClass(value: string): string {
  if (value === '連線中' || value === 'uploaded' || value === 'skipped' || value === 'succeeded' || value === 'ok') {
    return 'bg-moss-300/40 text-moss-500'
  }
  if (value === '異常' || value === 'failed') {
    return 'bg-red-100 text-red-700'
  }
  if (value === 'queued' || value === 'pending' || value === '逾時' || value === 'degraded') {
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

type CameraSiteGroup = {
  key: string
  label: string
  cameras: CameraDevice[]
}

const EMPTY_CAMERA_LIST: CameraDevice[] = []

const KNOWN_CAMERA_SITE_LABELS: Record<string, string> = {
  fce8ab62e93843da961bbc751bf79176: '牙醫診所',
  dd6cbdd3aa744736ad96d2791d689fce: '靚程工廠',
}

const CAMERA_SITE_SORT_ORDER: Record<string, number> = {
  靚程工廠: 0,
  牙醫診所: 1,
}

function cameraSiteLabel(camera: CameraDevice): string {
  if (camera.siteId && KNOWN_CAMERA_SITE_LABELS[camera.siteId]) return KNOWN_CAMERA_SITE_LABELS[camera.siteId]
  if (camera.name.includes('牙醫診所') || camera.name.includes('AVTECH')) return '牙醫診所'
  if (camera.name.startsWith('PoE Camera')) return '靚程工廠'
  return camera.siteId ? `場域 ${camera.siteId.slice(0, 8)}` : '未綁定場域'
}

function cameraSiteKey(camera: CameraDevice, label: string): string {
  if (label === '牙醫診所' || label === '靚程工廠') return label
  return camera.siteId ?? label
}

function compareCameraSiteGroups(a: CameraSiteGroup, b: CameraSiteGroup): number {
  const aOrder = CAMERA_SITE_SORT_ORDER[a.label] ?? Number.MAX_SAFE_INTEGER
  const bOrder = CAMERA_SITE_SORT_ORDER[b.label] ?? Number.MAX_SAFE_INTEGER
  if (aOrder !== bOrder) return aOrder - bOrder
  return a.label.localeCompare(b.label, 'zh-Hant')
}

function groupCamerasBySite(cameras: CameraDevice[]): CameraSiteGroup[] {
  const groups = new Map<string, CameraSiteGroup>()

  for (const camera of cameras) {
    const label = cameraSiteLabel(camera)
    const key = cameraSiteKey(camera, label)
    const existing = groups.get(key)
    if (existing) {
      existing.cameras.push(camera)
    } else {
      groups.set(key, { key, label, cameras: [camera] })
    }
  }

  return Array.from(groups.values()).sort(compareCameraSiteGroups)
}

export function CameraFrameImage({ camera }: { camera: CameraDevice }) {
  const latestFrameId = camera.latestFrame?.frameId ?? null
  const frameImageQuery = useAuthedQuery({
    queryKey: ['cameras', camera.cameraId, 'latest-frame-image', latestFrameId],
    queryFn: (token) => api.fetchCameraLatestFrameBlob(token, camera.cameraId),
    enabled: camera.uploadedFrameCount > 0,
    placeholderData: (previousData) => previousData,
    staleTime: 0,
    refetchInterval: 10_000,
  })

  const imageUrl = useMemo(() => {
    if (!frameImageQuery.data) return null
    return URL.createObjectURL(frameImageQuery.data)
  }, [frameImageQuery.data])

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl)
    }
  }, [imageUrl])

  return (
    <div className="flex aspect-video items-center justify-center bg-chrome-950">
      {imageUrl ? (
        <img
          key={latestFrameId ?? camera.cameraId}
          src={imageUrl}
          alt={`${camera.name} latest frame`}
          className="h-full w-full object-contain"
        />
      ) : (
        <div className="px-6 text-center text-sm text-chrome-100">
          {frameImageQuery.isLoading ? '載入最新截圖中' : '尚無可顯示截圖。'}
        </div>
      )}
    </div>
  )
}

function GaugeReadingList({ readings }: { readings: CameraGaugeReading[] }) {
  if (readings.length === 0) {
    return <p className="text-sm text-chrome-600">尚無儀表讀值。</p>
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {readings.map((reading) => (
        <div key={reading.gaugeId} className="rounded-2xl border border-chrome-200 bg-white/75 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold text-chrome-950">{reading.label || reading.gaugeId}</p>
              <p className="mt-1 text-xs text-chrome-500">{formatNullableDateTime(reading.capturedAt)}</p>
            </div>
            <Badge value={reading.status} />
          </div>
          <p className="mt-4 font-display text-3xl font-semibold tracking-[-0.035em] text-chrome-950">
            {reading.value === null ? 'N/A' : reading.value.toFixed(2)}
            <span className="ml-2 text-base font-medium text-chrome-500">{reading.unit}</span>
          </p>
          <p className="mt-2 text-xs text-chrome-500">confidence {(reading.confidence * 100).toFixed(0)}%</p>
        </div>
      ))}
    </div>
  )
}

export function CamerasPage() {
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null)
  const [selectedSiteKey, setSelectedSiteKey] = useState('')

  const camerasQuery = useAuthedQuery({
    queryKey: ['cameras'],
    queryFn: api.listCameras,
    staleTime: 5_000,
    refetchInterval: 10_000,
  })

  const cameras = camerasQuery.data?.cameras ?? EMPTY_CAMERA_LIST
  const cameraGroups = useMemo(() => groupCamerasBySite(cameras), [cameras])
  const effectiveSiteKey =
    cameraGroups.find((group) => group.key === selectedSiteKey)?.key ?? cameraGroups[0]?.key ?? ''
  const selectedCameraGroup = cameraGroups.find((group) => group.key === effectiveSiteKey) ?? null
  const visibleCameras = selectedCameraGroup?.cameras ?? EMPTY_CAMERA_LIST
  const selectedCamera =
    visibleCameras.find((camera) => camera.cameraId === selectedCameraId) ?? visibleCameras[0] ?? null

  const onlineCount = visibleCameras.filter((camera) => heartbeatLabel(camera) === '連線中').length
  const queuedCount = visibleCameras.reduce((sum, camera) => sum + camera.queuedFrameCount, 0)
  const failedCount = visibleCameras.reduce((sum, camera) => sum + camera.failedFrameCount, 0)

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="Factory Camera"
        title="即時截圖總覽"
        subtitle="依場域切換固定攝影機，只載入目前場域的最新截圖與儀表讀值。"
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="攝影機" value={visibleCameras.length} />
        <Metric label="連線中" value={onlineCount} hint="最近 90 秒內有 heartbeat" />
        <Metric label="待分析" value={queuedCount} hint="已上傳、等待 worker 消化" />
        <Metric label="異常" value={failedCount} hint="上傳或分析失敗的 frame" />
      </div>

      {camerasQuery.isLoading ? (
        <Panel>
          <p className="text-sm text-chrome-700">載入攝影機清單中。</p>
        </Panel>
      ) : null}

      {!camerasQuery.isLoading && cameras.length === 0 ? (
        <EmptyState title="尚無攝影機" body="目前帳號沒有可讀取的固定攝影機。" />
      ) : null}

      {cameras.length > 0 ? (
        <Panel>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Camera Overview</p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">場域攝影機</h2>
              <p className="mt-2 max-w-2xl text-sm text-chrome-600">
                每次只載入選中場域的攝影機畫面，避免牙醫診所與工廠畫面一起刷新造成頁面變慢。
              </p>
            </div>
            <div className="w-full max-w-sm">
              <Field label="場域">
                <Select
                  value={effectiveSiteKey}
                  onChange={(event) => {
                    setSelectedSiteKey(event.target.value)
                    setSelectedCameraId(null)
                  }}
                >
                  {cameraGroups.map((group) => (
                    <option key={group.key} value={group.key}>
                      {group.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>

          <div className="mt-5 space-y-8">
            {selectedCameraGroup ? (
              <section key={selectedCameraGroup.key} aria-labelledby={`camera-site-${selectedCameraGroup.key}`} className="space-y-3">
                <div className="flex flex-col gap-1 border-b border-chrome-200 pb-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Site</p>
                    <h3
                      id={`camera-site-${selectedCameraGroup.key}`}
                      className="font-display text-xl font-semibold text-chrome-950"
                    >
                      {selectedCameraGroup.label}
                    </h3>
                  </div>
                  <p className="text-sm text-chrome-600">{selectedCameraGroup.cameras.length} 支攝影機</p>
                </div>
                <div className="grid gap-4 lg:grid-cols-3">
                  {selectedCameraGroup.cameras.map((camera) => {
                    const active = selectedCamera?.cameraId === camera.cameraId
                    return (
                      <button
                        key={camera.cameraId}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setSelectedCameraId(camera.cameraId)}
                        className={`overflow-hidden rounded-lg border bg-white text-left transition ${
                          active ? 'border-ember-300 shadow-sm' : 'border-chrome-200 hover:border-chrome-400'
                        }`}
                      >
                        <CameraFrameImage camera={camera} />
                        <div className="space-y-3 px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Badge value={heartbeatLabel(camera)} />
                            {camera.latestFrame ? <Badge value={camera.latestFrame.analysisStatus} /> : null}
                          </div>
                          <div>
                            <p className="break-words text-sm font-semibold text-chrome-950">{camera.name}</p>
                            <p className="mt-1 text-xs text-chrome-500">最新畫面 {formatAge(camera.lastFrameAt)}</p>
                          </div>
                          {camera.latestGaugeReadings.length > 0 ? (
                            <div className="grid gap-2 text-xs text-chrome-700">
                              {camera.latestGaugeReadings.map((reading) => (
                                <div key={reading.gaugeId} className="flex items-center justify-between gap-2">
                                  <span className="truncate">{reading.label || reading.gaugeId}</span>
                                  <span className="font-mono">
                                    {reading.value === null ? 'N/A' : reading.value.toFixed(2)} {reading.unit}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>
            ) : null}
          </div>
        </Panel>
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
                <CameraFrameImage camera={selectedCamera} />
              </div>
            </Panel>

            <Panel>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Gauge Readings</p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">機台儀表讀值</h2>
              <div className="mt-4">
                <GaugeReadingList readings={selectedCamera.latestGaugeReadings} />
              </div>
            </Panel>

            <Panel>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Frame Metadata</p>
              <div className="mt-4">
                <DataList
                  rows={[
                    { label: 'Frame', value: selectedCamera.latestFrame?.frameId ?? '尚無' },
                    { label: '擷取時間', value: formatNullableDateTime(selectedCamera.latestFrame?.capturedAt ?? null) },
                    { label: '上傳狀態', value: selectedCamera.latestFrame?.uploadStatus ?? '尚無' },
                    { label: '分析狀態', value: selectedCamera.latestFrame?.analysisStatus ?? '尚無' },
                    { label: '錯誤', value: selectedCamera.latestFrame?.errorMessage ?? selectedCamera.lastError ?? '無' },
                  ]}
                />
              </div>
            </Panel>
          </div>

          <div className="space-y-6">
            <Panel>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Camera List</p>
              <div className="mt-4 space-y-5">
                {selectedCameraGroup ? (
                  <section key={selectedCameraGroup.key} className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-chrome-950">{selectedCameraGroup.label}</p>
                      <p className="text-xs text-chrome-500">{selectedCameraGroup.cameras.length} 支</p>
                    </div>
                    <div className="grid gap-3">
                      {selectedCameraGroup.cameras.map((camera) => {
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
                  </section>
                ) : null}
              </div>
            </Panel>

            <Panel>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Camera Health</p>
              <div className="mt-4">
                <DataList
                  rows={[
                    { label: 'Camera', value: selectedCamera.cameraId },
                    { label: 'Site', value: selectedCamera.siteId ?? '未綁定' },
                    { label: 'Heartbeat', value: formatNullableDateTime(selectedCamera.lastHeartbeatAt) },
                    { label: '最新畫面', value: formatNullableDateTime(selectedCamera.lastFrameAt) },
                    { label: '間隔', value: `${selectedCamera.samplingIntervalSeconds}s` },
                    { label: '保存', value: `${selectedCamera.retentionDays}d` },
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
