import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'

import {
  ActionButton,
  DataList,
  EmptyState,
  Panel,
  ShellSection,
  StatusBadge,
  formatDateTime,
} from '../../components/ui'
import { ApiError, api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAuthedMutation, useAuthedQuery } from '../../lib/auth-query'
import { formatApiError, formatSupportSeverity } from '../../lib/presentation'
import type { InspectionEvent, MissionArtifactDownload, MissionDetail } from '../../lib/types'

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`
  }
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
}

function deliveryHeadline(state: MissionDetail['delivery']['state']) {
  if (state === 'published') {
    return '任務成果已發布'
  }
  if (state === 'ready') {
    return '任務封裝已就緒'
  }
  if (state === 'failed') {
    return '任務交付失敗'
  }
  return '任務仍在規劃中'
}

function deliveryMessage(mission: MissionDetail) {
  if (mission.delivery.state === 'published') {
    return '核心任務成果已發布，可供授權使用者下載。'
  }
  if (mission.delivery.state === 'ready') {
    return '規劃已完成，但成果發布交接尚未執行。'
  }
  if (mission.delivery.state === 'failed') {
    return mission.delivery.failureReason ?? '這筆任務在成果封裝發布前就已失敗。'
  }
  return '路徑規劃器仍在產生任務封裝。'
}

function reportStatusMessage(mission: MissionDetail) {
  if (mission.reportStatus === 'ready') {
    if (mission.eventCount === 0) {
      return (
        mission.latestReport?.summary ?? '巡檢分析已完成，未偵測到異常事件。這份報表可作為無異常交付版本。'
      )
    }
    return mission.latestReport?.summary ?? '巡檢分析已完成，且已有可下載的報表檔案。'
  }
  if (mission.reportStatus === 'failed') {
    return mission.latestReport?.summary ?? '分析流程未能產生可用的巡檢報表。'
  }
  if (mission.reportStatus === 'generating' || mission.reportStatus === 'queued') {
    return '分析已開始，但報表產生尚未完成。'
  }
  return '這筆任務目前尚未產生巡檢報表。'
}

function nextStepSummary(mission: MissionDetail) {
  if (mission.reportStatus === 'ready') {
    if (mission.eventCount === 0) {
      return '請將 HTML 報表作為無異常交付版本，並保留這筆任務作為 clean-pass demo 範例。'
    }
    return '請檢視事件清單、開啟證據檔案，並匯出 HTML 報表供利害關係人交付使用。'
  }
  if (mission.reportStatus === 'failed') {
    return '請使用內部重跑控制重新產生 demo 報表，或切換成無異常版本。'
  }
  if (mission.delivery.state === 'published') {
    return '成果已就緒，下一步是產生或檢視巡檢報表。'
  }
  if (mission.delivery.state === 'failed') {
    return '請先解決任務交付問題，在任務封裝可用前不應信任報表流程。'
  }
  return '請等待規劃與發布步驟完成，再進行報表產生。'
}

function eventCardClass(severity: InspectionEvent['severity']) {
  if (severity === 'critical') {
    return 'rounded-2xl border border-red-200 bg-red-50/80 px-4 py-4'
  }
  if (severity === 'warning') {
    return 'rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-4'
  }
  return 'rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4'
}

export function MissionDetailPage() {
  const { missionId = '' } = useParams()
  const auth = useAuth()
  const queryClient = useQueryClient()
  const [analysisNotice, setAnalysisNotice] = useState<string | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [artifactError, setArtifactError] = useState<string | null>(null)

  const missionQuery = useAuthedQuery({
    queryKey: ['mission', missionId],
    queryFn: (token) => api.getMission(token, missionId),
    enabled: Boolean(missionId),
  })

  const reprocessAnalysis = useAuthedMutation({
    mutationKey: ['mission', missionId, 'analysis', 'reprocess'],
    mutationFn: ({ token, payload }: { token: string; payload: Parameters<typeof api.reprocessMissionAnalysis>[2] }) =>
      api.reprocessMissionAnalysis(token, missionId, payload),
    onSuccess: async (_report, payload) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mission', missionId] }),
        queryClient.invalidateQueries({ queryKey: ['missions'] }),
        queryClient.invalidateQueries({ queryKey: ['missions', 'control-plane'] }),
        queryClient.invalidateQueries({ queryKey: ['web-overview'] }),
      ])
      setAnalysisError(null)
      setAnalysisNotice(
        payload.mode === 'analysis_failed'
          ? '已將這筆任務切換成 demo 用的分析失敗狀態。'
          : payload.mode === 'no_findings'
            ? '已產生無異常的 demo 報表。'
            : '已產生 demo 事件、證據檔案與巡檢報表。',
      )
    },
  })

  async function openArtifact(
    artifact: MissionArtifactDownload | { artifactName: string; downloadUrl: string },
    mode: 'open' | 'download',
  ) {
    if (!auth.session?.accessToken) {
      setArtifactError('工作階段已過期，無法發送成果檔案請求。')
      return
    }

    try {
      setArtifactError(null)
      const blob = await api.fetchArtifactBlob(auth.session.accessToken, artifact.downloadUrl)
      const objectUrl = window.URL.createObjectURL(blob)
      if (mode === 'download') {
        const link = document.createElement('a')
        link.href = objectUrl
        link.download = artifact.artifactName
        link.click()
      } else {
        window.open(objectUrl, '_blank', 'noopener,noreferrer')
      }
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60_000)
    } catch (error) {
      const detail = error instanceof ApiError ? error.detail : undefined
      setArtifactError(formatApiError(detail, `無法${mode === 'download' ? '下載' : '開啟'}成果檔案。`))
    }
  }

  async function handleReprocess(mode: 'normal' | 'no_findings' | 'analysis_failed') {
    try {
      setAnalysisNotice(null)
      setAnalysisError(null)
      await reprocessAnalysis.mutateAsync({ mode })
    } catch (error) {
      const detail = error instanceof ApiError ? error.detail : undefined
      setAnalysisError(formatApiError(detail, '無法重新產生任務分析結果。'))
    }
  }

  if (!missionId) {
    return (
      <EmptyState
        title="缺少任務編號"
        body="請從任務清單開啟此頁，才能一次載入任務、報表與成果檔案資料。"
      />
    )
  }

  if (missionQuery.isLoading) {
    return (
      <Panel>
        <p className="text-sm text-chrome-700">正在載入任務詳情與報表脈絡…</p>
      </Panel>
    )
  }

  if (!missionQuery.data) {
    return (
      <EmptyState
        title="目前無法載入任務詳情"
        body="找不到這筆任務，請確認任務編號與目前組織範圍。"
      />
    )
  }

  const mission = missionQuery.data
  const coreArtifacts = mission.artifacts.filter((artifact) =>
    ['mission.kmz', 'mission_meta.json', 'inspection_report.html'].includes(artifact.artifactName),
  )
  const latestReportArtifact = mission.latestReport?.downloadArtifact ?? null

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="任務詳情"
        title={mission.missionName}
        subtitle="從單一任務頁面檢視規劃資料、demo 分析輸出、證據檔案，以及可下載的巡檢報表。"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={mission.status} />
            <StatusBadge status={mission.delivery.state} />
            <StatusBadge status={mission.reportStatus} />
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Panel>
            <DataList
              rows={[
                { label: '任務編號', value: mission.missionId },
                { label: '組織', value: mission.organizationId ?? '尚未掛接' },
                { label: '場域', value: mission.siteId ?? '尚未掛接' },
                { label: '封裝版本', value: mission.bundleVersion },
                { label: '建立時間', value: formatDateTime(mission.createdAt) },
                { label: '事件數量', value: mission.eventCount },
              ]}
            />
          </Panel>

          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">報表流程</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">巡檢分析與報表</h2>
            <p className="mt-2 text-sm text-chrome-700">{reportStatusMessage(mission)}</p>
            <div className="mt-4">
              <DataList
                rows={[
                  { label: '報表狀態', value: <StatusBadge status={mission.reportStatus} /> },
                  {
                    label: '產生時間',
                    value: mission.reportGeneratedAt ? formatDateTime(mission.reportGeneratedAt) : '尚未產生',
                  },
                  { label: '事件數量', value: mission.eventCount },
                  {
                    label: '報表檔案',
                    value: mission.latestReport?.downloadArtifact?.artifactName ?? '目前沒有報表檔案',
                  },
                ]}
              />
            </div>

            {analysisNotice ? (
              <div className="mt-4 rounded-2xl border border-moss-200 bg-moss-50/70 px-4 py-3 text-sm text-moss-900">
                {analysisNotice}
              </div>
            ) : null}
            {analysisError ? (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {analysisError}
              </div>
            ) : null}

            {auth.isInternal ? (
              <div className="mt-5 flex flex-wrap gap-2">
                <ActionButton onClick={() => void handleReprocess('normal')} disabled={reprocessAnalysis.isPending}>
                  {reprocessAnalysis.isPending ? '重新產生中…' : '產生 demo 異常'}
                </ActionButton>
                <ActionButton
                  variant="secondary"
                  onClick={() => void handleReprocess('no_findings')}
                  disabled={reprocessAnalysis.isPending}
                >
                  產生無異常報表
                </ActionButton>
                <ActionButton
                  variant="ghost"
                  onClick={() => void handleReprocess('analysis_failed')}
                  disabled={reprocessAnalysis.isPending}
                >
                  模擬分析失敗
                </ActionButton>
              </div>
            ) : null}

            {latestReportArtifact ? (
              <div className="mt-5 flex flex-wrap gap-2">
                <ActionButton variant="secondary" onClick={() => void openArtifact(latestReportArtifact, 'open')}>
                  開啟報表檔案
                </ActionButton>
                <ActionButton variant="ghost" onClick={() => void openArtifact(latestReportArtifact, 'download')}>
                  下載報表
                </ActionButton>
              </div>
            ) : null}
          </Panel>

          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">證據圖庫</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">偵測到的事件</h2>
            <div className="mt-4 grid gap-4">
              {mission.events.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-chrome-300 bg-chrome-50/70 px-4 py-6">
                  <p className="font-medium text-chrome-950">目前沒有巡檢事件</p>
                  <p className="mt-2 text-sm text-chrome-700">
                    {mission.reportStatus === 'ready'
                      ? '這筆任務目前代表無異常巡檢，可直接用報表作為 clean-pass 交付版本。'
                      : mission.reportStatus === 'failed'
                        ? '報表流程在產生證據檔案前失敗了，請從內部控制重跑 demo 分析。'
                        : '可以產生 demo 報表建立異常事件與證據檔案，或保留這筆任務作為無異常版本。'}
                  </p>
                </div>
              ) : (
                mission.events.map((event) => (
                  <div key={event.eventId} className={eventCardClass(event.severity)}>
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="font-medium capitalize text-chrome-950">{event.category.replaceAll('_', ' ')}</p>
                      <StatusBadge status={event.status} />
                      <span className="rounded-full bg-white/80 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-chrome-700">
                        {formatSupportSeverity(event.severity)}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-chrome-800">{event.summary}</p>
                    <p className="mt-2 text-xs text-chrome-600">偵測時間 {formatDateTime(event.detectedAt)}</p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {event.evidenceArtifacts.map((artifact) => (
                        <ActionButton
                          key={artifact.artifactName}
                          variant="secondary"
                          onClick={() => void openArtifact(artifact, 'open')}
                        >
                          開啟 {artifact.artifactName}
                        </ActionButton>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Panel>

          {mission.route || mission.template || mission.schedule || mission.dispatch ? (
            <Panel>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">控制平面</p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">掛接中的規劃資料</h2>
              <div className="mt-4">
                <DataList
                  rows={[
                    { label: '航線', value: mission.route?.name ?? '尚未掛接' },
                    { label: '航線點位', value: mission.route ? mission.route.pointCount : '尚未掛接' },
                    { label: '模板', value: mission.template?.name ?? '尚未掛接' },
                    { label: '排程', value: mission.schedule?.status ?? '尚未掛接' },
                    {
                      label: '預定時間',
                      value: mission.schedule?.plannedAt ? formatDateTime(mission.schedule.plannedAt) : '未排程',
                    },
                    { label: '派工', value: mission.dispatch?.status ?? '尚未派工' },
                    { label: '執行人員', value: mission.dispatch?.assignee ?? '未設定' },
                    { label: '執行目標', value: mission.dispatch?.executionTarget ?? '未設定' },
                  ]}
                />
              </div>
            </Panel>
          ) : null}

          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">原始任務契約</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">規劃請求與回應</h2>
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <pre className="overflow-x-auto rounded-2xl bg-chrome-950 p-4 text-xs text-chrome-50">
                {JSON.stringify(mission.request, null, 2)}
              </pre>
              <pre className="overflow-x-auto rounded-2xl bg-chrome-950 p-4 text-xs text-chrome-50">
                {JSON.stringify(mission.response, null, 2)}
              </pre>
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">成果交付</p>
            <h2 className="mt-3 font-display text-2xl font-semibold text-chrome-950">
              {deliveryHeadline(mission.delivery.state)}
            </h2>
            <p className="mt-2 text-sm text-chrome-700">{deliveryMessage(mission)}</p>
            <div className="mt-4">
              <DataList
                rows={[
                  { label: '交付狀態', value: <StatusBadge status={mission.delivery.state} /> },
                  {
                    label: '發布時間',
                    value: mission.delivery.publishedAt ? formatDateTime(mission.delivery.publishedAt) : '尚未發布',
                  },
                  {
                    label: '失敗原因',
                    value: mission.delivery.failureReason ?? '目前沒有任務層級的交付失敗紀錄',
                  },
                ]}
              />
            </div>
            <div className="mt-4 rounded-2xl border border-chrome-200 bg-chrome-50/80 px-4 py-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">下一步</p>
              <p className="mt-2 text-sm text-chrome-700">{nextStepSummary(mission)}</p>
            </div>
          </Panel>

          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">成果檔案</p>
            <div className="mt-4 space-y-3">
              {coreArtifacts.map((artifact) => (
                <div key={artifact.artifactName} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-medium text-chrome-950">{artifact.artifactName}</p>
                    <StatusBadge
                      status={artifact.artifactName === 'inspection_report.html' ? mission.reportStatus : mission.delivery.state}
                    />
                  </div>
                  <p className="mt-2 text-xs text-chrome-600">
                    v{artifact.version}｜{formatBytes(artifact.sizeBytes)}｜{artifact.contentType}
                  </p>
                  <p className="mt-1 text-xs text-chrome-600">發布時間 {formatDateTime(artifact.publishedAt)}</p>
                  <p className="mt-1 break-all text-xs text-chrome-600">sha256 {artifact.checksumSha256}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <ActionButton variant="secondary" onClick={() => void openArtifact(artifact, 'open')}>
                      開啟
                    </ActionButton>
                    <ActionButton variant="ghost" onClick={() => void openArtifact(artifact, 'download')}>
                      下載
                    </ActionButton>
                  </div>
                </div>
              ))}
              {artifactError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {artifactError}
                </div>
              ) : null}
            </div>
          </Panel>

          <div className="flex justify-end">
            <Link to="/missions" className="rounded-full border border-chrome-300 px-4 py-2 text-sm text-chrome-800">
              返回任務清單
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
