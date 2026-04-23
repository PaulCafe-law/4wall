import { Link, useParams } from 'react-router-dom'
import { clsx } from 'clsx'

import {
  DataList,
  EmptyState,
  Panel,
  ShellSection,
  StatusBadge,
  formatDate,
  formatDateTime,
} from '../../components/ui'
import { absoluteArtifactUrl, api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAuthedQuery } from '../../lib/auth-query'
import {
  formatCameraStreamState,
  formatExecutionMode,
  formatExecutionState,
  formatLandingPhase,
  formatOperatingProfile,
  formatRecordingState,
  formatStatus,
  formatSupportSeverity,
  formatUploadState,
} from '../../lib/presentation'
import type {
  ArtifactDescriptor,
  EvidenceArtifact,
  InspectionEvent,
  InspectionReportSummary,
  LaunchPointSummary,
  MissionDetail,
} from '../../lib/types'

function readArtifacts(record: Record<string, unknown>): {
  missionKmz?: ArtifactDescriptor
  missionMeta?: ArtifactDescriptor
} {
  const artifacts = record.artifacts as Record<string, ArtifactDescriptor> | undefined
  return {
    missionKmz: artifacts?.missionKmz,
    missionMeta: artifacts?.missionMeta,
  }
}

function normalizeLaunchLabel(label: string | null | undefined): string | null {
  if (!label) return null
  return /^L\d+$/i.test(label.trim()) ? 'L' : label
}

function formatLaunchPoint(launchPoint: LaunchPointSummary | null): string {
  if (!launchPoint) {
    return '尚未設定起降點'
  }

  const location = launchPoint.location ?? launchPoint
  const lat = typeof location.lat === 'number' ? location.lat : null
  const lng = typeof location.lng === 'number' ? location.lng : null
  const label = normalizeLaunchLabel(launchPoint.label)

  if (lat === null || lng === null) {
    return label ?? '尚未設定起降點'
  }

  return `${label ? `${label} / ` : ''}${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

function formatExecutionProgress(execution: MissionDetail['executionSummary']): string {
  if (!execution) return '尚未回報'
  if (execution.executionMode === 'manual_pilot') return '手動飛行中，航點進度不適用'
  return execution.waypointProgress ?? '尚無航點進度'
}

const eventCategoryLabels: Record<string, string> = {
  joint_water_ingress_risk: '疑似滲水風險',
  material_discoloration: '材質變色',
  perimeter_breach_risk: '邊界入侵風險',
  low_battery: '低電量',
  telemetry_stale: '遙測逾時',
  analysis_failed: '判讀失敗',
}

const eventStatusLabels: Record<string, string> = {
  open: '待處理',
  reviewed: '已檢視',
  dismissed: '已排除',
  confirmed: '已確認',
}

function formatEventCategory(category: string) {
  return eventCategoryLabels[category] ?? category.replaceAll('_', ' ')
}

function formatEventStatus(status: string) {
  return eventStatusLabels[status] ?? formatStatus(status)
}

function eventToneClass(event: InspectionEvent) {
  if (event.severity === 'critical') return 'border-red-200 bg-red-50/80'
  if (event.severity === 'warning') return 'border-amber-200 bg-amber-50/80'
  return 'border-chrome-200 bg-white/70'
}

function eventEmptyCopy(mission: MissionDetail) {
  if (mission.reportStatus === 'failed') {
    return {
      title: '判讀失敗',
      body: mission.delivery.failureReason ?? '分析流程沒有成功產生事件，請到 Support / Live Ops 追蹤原因。',
    }
  }

  if (mission.reportStatus === 'ready' && mission.eventCount === 0) {
    return {
      title: '目前沒有偵測到異常事件',
      body: '這筆任務已完成判讀，報表可作為 clean-pass 交付紀錄。',
    }
  }

  return {
    title: '判讀尚未完成',
    body: '事件會在影像上傳與分析完成後出現在這裡。',
  }
}

function EvidenceLink({ artifact }: { artifact: EvidenceArtifact }) {
  return (
    <a
      className="inline-flex max-w-full items-center rounded-full border border-chrome-300 bg-white px-3 py-1.5 text-xs font-medium text-chrome-800 transition hover:border-ember-300"
      href={absoluteArtifactUrl(artifact.downloadUrl)}
      target="_blank"
      rel="noreferrer"
    >
      <span className="truncate">{artifact.artifactName}</span>
    </a>
  )
}

function EventPanel({ mission }: { mission: MissionDetail }) {
  const events = mission.events ?? []
  const emptyCopy = eventEmptyCopy(mission)

  return (
    <Panel>
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">事件判讀</p>
      <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold text-chrome-950">偵測的事件</h2>
          <p className="mt-1 text-sm text-chrome-700">由任務影像分析產生，並可回連證據檔與報表。</p>
        </div>
        <span className="w-fit rounded-full bg-chrome-100 px-3 py-1 text-xs font-medium text-chrome-700">
          {events.length} 筆事件
        </span>
      </div>

      <div className="mt-4 grid gap-3">
        {events.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-chrome-300 bg-chrome-50/80 px-4 py-5">
            <p className="font-medium text-chrome-950">{emptyCopy.title}</p>
            <p className="mt-2 text-sm leading-6 text-chrome-700">{emptyCopy.body}</p>
          </div>
        ) : (
          events.map((event) => (
            <article
              key={event.eventId}
              className={clsx('rounded-2xl border px-4 py-4', eventToneClass(event))}
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <h3 className="break-words font-display text-xl font-semibold text-chrome-950">
                    {formatEventCategory(event.category)}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-chrome-800">{event.summary}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <span className="rounded-full bg-white/80 px-3 py-1 text-xs text-chrome-700">
                    {formatEventStatus(event.status)}
                  </span>
                  <span className="rounded-full bg-white/80 px-3 py-1 text-xs text-chrome-700">
                    {formatSupportSeverity(event.severity)}
                  </span>
                </div>
              </div>
              <p className="mt-3 text-xs text-chrome-600">偵測時間：{formatDateTime(event.detectedAt)}</p>
              {event.evidenceArtifacts.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {event.evidenceArtifacts.map((artifact) => (
                    <EvidenceLink key={`${event.eventId}-${artifact.artifactName}`} artifact={artifact} />
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-chrome-600">尚未產生證據檔。</p>
              )}
            </article>
          ))
        )}
      </div>
    </Panel>
  )
}

function ReportPanel({ report }: { report: InspectionReportSummary | null }) {
  return (
    <Panel>
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">證據與報表</p>
      <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">巡檢交付</h2>
      {report ? (
        <div className="mt-4 space-y-4">
          <DataList
            rows={[
              { label: '報表狀態', value: formatStatus(report.status) },
              { label: '事件數', value: report.eventCount },
              { label: '產生時間', value: report.generatedAt ? formatDateTime(report.generatedAt) : '尚未產生' },
            ]}
          />
          <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
            <p className="text-sm leading-6 text-chrome-800">
              {report.summary ?? '目前沒有報表摘要。'}
            </p>
            {report.downloadArtifact ? (
              <div className="mt-3">
                <EvidenceLink artifact={report.downloadArtifact} />
              </div>
            ) : (
              <p className="mt-3 text-xs text-chrome-600">尚未發布可下載的報表檔。</p>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-chrome-300 bg-chrome-50/80 px-4 py-5">
          <p className="font-medium text-chrome-950">尚未產生巡檢報表</p>
          <p className="mt-2 text-sm leading-6 text-chrome-700">
            報表會在影像分析完成後出現在這裡，並與事件與證據檔保持同一個任務脈絡。
          </p>
        </div>
      )}
    </Panel>
  )
}

function DebugContractPanel({ mission }: { mission: MissionDetail }) {
  return (
    <Panel>
      <details className="group">
        <summary className="cursor-pointer list-none font-medium text-chrome-950">
          原始契約（除錯）
          <span className="ml-2 text-sm text-chrome-500 group-open:hidden">展開 request / response</span>
          <span className="ml-2 hidden text-sm text-chrome-500 group-open:inline">收合</span>
        </summary>
        <div className="mt-4 space-y-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">request</p>
            <pre className="mt-3 max-h-[28rem] overflow-auto rounded-2xl bg-chrome-950 p-4 text-xs text-chrome-50">
              {JSON.stringify(mission.request, null, 2)}
            </pre>
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">response</p>
            <pre className="mt-3 max-h-[28rem] overflow-auto rounded-2xl bg-chrome-950 p-4 text-xs text-chrome-50">
              {JSON.stringify(mission.response, null, 2)}
            </pre>
          </div>
        </div>
      </details>
    </Panel>
  )
}

export function MissionDetailPage() {
  const { missionId = '' } = useParams()
  const auth = useAuth()

  const missionQuery = useAuthedQuery({
    queryKey: ['mission', missionId],
    queryFn: (token) => api.getMission(token, missionId),
    enabled: Boolean(missionId),
  })

  if (!missionId) {
    return <EmptyState title="缺少任務 ID" body="請從任務列表或 Live Ops 開啟任務詳情。" />
  }

  if (missionQuery.isLoading) {
    return (
      <Panel>
        <p className="text-sm text-chrome-700">正在載入任務詳情…</p>
      </Panel>
    )
  }

  if (!missionQuery.data) {
    return <EmptyState title="找不到任務" body="請確認任務 ID，或從任務工作區重新開啟。" />
  }

  const mission = missionQuery.data
  const artifacts = readArtifacts(mission.response)
  const execution = mission.executionSummary

  const artifactsRail = (
    <Panel>
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">任務產物</p>
      <h2 className="mt-3 font-display text-2xl font-semibold text-chrome-950">任務包</h2>
      <div className="mt-4 space-y-3">
        {artifacts.missionKmz ? (
          <a
            className="block rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4 transition hover:border-ember-300"
            href={absoluteArtifactUrl(artifacts.missionKmz.downloadUrl)}
            target="_blank"
            rel="noreferrer"
          >
            <p className="font-medium text-chrome-950">mission.kmz</p>
            <p className="mt-1 text-sm text-chrome-700">DJI 航點任務檔案</p>
            <p className="mt-2 break-all text-xs text-chrome-600">
              sha256 {artifacts.missionKmz.checksumSha256}
            </p>
          </a>
        ) : (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
            mission.kmz 尚未產生。
          </div>
        )}

        {artifacts.missionMeta ? (
          <a
            className="block rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4 transition hover:border-ember-300"
            href={absoluteArtifactUrl(artifacts.missionMeta.downloadUrl)}
            target="_blank"
            rel="noreferrer"
          >
            <p className="font-medium text-chrome-950">mission_meta.json</p>
            <p className="mt-1 text-sm text-chrome-700">巡邏航線 metadata 與降落政策</p>
            <p className="mt-2 break-all text-xs text-chrome-600">
              sha256 {artifacts.missionMeta.checksumSha256}
            </p>
          </a>
        ) : null}
      </div>
    </Panel>
  )

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="任務詳情"
        title={mission.missionName}
        subtitle="檢視規劃資料、Android 執行摘要、事件判讀、證據與任務包。"
        action={<StatusBadge status={mission.status} />}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">規劃資訊</p>
            <div className="mt-4">
              <DataList
                rows={[
                  { label: '任務 ID', value: mission.missionId },
                  { label: '組織', value: mission.organizationId ?? '未綁定組織' },
                  { label: '場域', value: mission.siteId ?? '未綁定場域' },
                  { label: '航線模式', value: mission.routeMode },
                  { label: '執行模式', value: formatOperatingProfile(mission.operatingProfile) },
                  { label: '任務包版本', value: mission.bundleVersion },
                  { label: '起降點', value: formatLaunchPoint(mission.launchPoint) },
                  { label: '航點數', value: mission.waypointCount },
                  { label: '隱式返航', value: mission.implicitReturnToLaunch ? '是' : '否' },
                  { label: '建立時間', value: formatDate(mission.createdAt) },
                ]}
              />
            </div>
          </Panel>

          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">執行狀態</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">Android 執行摘要</h2>
            {execution ? (
              <div className="mt-4">
                <DataList
                  rows={[
                    { label: '飛行 Session', value: execution.flightId ?? '尚未建立飛行紀錄' },
                    {
                      label: '規劃模式',
                      value: formatOperatingProfile(execution.plannedOperatingProfile ?? mission.operatingProfile),
                    },
                    {
                      label: '實際模式',
                      value: formatOperatingProfile(execution.executedOperatingProfile ?? mission.operatingProfile),
                    },
                    { label: '執行模式', value: formatExecutionMode(execution.executionMode) },
                    { label: '上傳狀態', value: formatUploadState(execution.uploadState) },
                    { label: '任務狀態', value: formatExecutionState(execution.executionState) },
                    { label: '航點進度', value: formatExecutionProgress(execution) },
                    { label: '影像串流', value: formatCameraStreamState(execution.cameraStreamState) },
                    { label: '錄影狀態', value: formatRecordingState(execution.recordingState) },
                    { label: '降落階段', value: formatLandingPhase(execution.landingPhase) },
                    { label: '備援原因', value: execution.fallbackReason ?? '無' },
                    { label: '最後事件', value: execution.lastEventType ?? '無' },
                    { label: '狀態備註', value: execution.statusNote ?? '無' },
                  ]}
                />
              </div>
            ) : (
              <p className="mt-4 text-sm text-chrome-700">Android 尚未回報執行摘要。</p>
            )}
          </Panel>

          <EventPanel mission={mission} />
          <ReportPanel report={mission.latestReport} />

          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">產品邊界</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                <h3 className="font-medium text-chrome-950">戶外巡邏</h3>
                <p className="mt-2 text-sm leading-6 text-chrome-700">
                  航線權限在任務包內：起降點、巡邏航點與隱式返航都由 Android 執行。
                </p>
              </div>
              <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                <h3 className="font-medium text-chrome-950">手動飛行</h3>
                <p className="mt-2 text-sm leading-6 text-chrome-700">
                  手動飛行是 Android 本地執行模式，不會讓 web 或 server 進入飛控迴路。
                </p>
              </div>
            </div>
          </Panel>

          {auth.isInternal ? <DebugContractPanel mission={mission} /> : null}

          <div className="xl:hidden">{artifactsRail}</div>

          <div className="flex justify-end">
            <Link to="/missions" className="rounded-full border border-chrome-300 px-4 py-2 text-sm text-chrome-800">
              返回任務列表
            </Link>
          </div>
        </div>

        <div className="hidden xl:block">{artifactsRail}</div>
      </div>
    </div>
  )
}
