import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'

import {
  ActionButton,
  DataList,
  EmptyState,
  Modal,
  Panel,
  ShellSection,
  StatusBadge,
  formatDateTime,
} from '../../components/ui'
import { ApiError, api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAuthedMutation, useAuthedQuery } from '../../lib/auth-query'
import { formatApiError, formatStatus } from '../../lib/presentation'
import type { InspectionEvent, MissionArtifactDownload, MissionDetail } from '../../lib/types'

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
}

function deliveryHeadline(state: MissionDetail['delivery']['state']) {
  if (state === 'published') return '任務成果已發布'
  if (state === 'ready') return '任務成果已就緒'
  if (state === 'failed') return '任務交付失敗'
  return '任務仍在規劃中'
}

function reportStatusMessage(mission: MissionDetail) {
  if (mission.reportStatus === 'ready') {
    return mission.eventCount === 0
      ? mission.latestReport?.summary ?? '目前已產生無異常巡檢報表，可作為無異常版本交付。'
      : mission.latestReport?.summary ?? '目前已產生含異常事件的巡檢報表。'
  }
  if (mission.reportStatus === 'failed') {
    return mission.latestReport?.summary ?? '分析或報表流程失敗，可由 internal user 重新產生。'
  }
  if (mission.reportStatus === 'queued' || mission.reportStatus === 'generating') {
    return '分析與報表流程執行中，稍後可回來查看事件與證據。'
  }
  return '報表流程尚未開始，現在可先檢查規劃、派工與交付資訊。'
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

function severityLabel(severity: InspectionEvent['severity']) {
  if (severity === 'critical') return '嚴重'
  if (severity === 'warning') return '警示'
  return '資訊'
}

export function MissionDetailPage() {
  const { missionId = '' } = useParams()
  const auth = useAuth()
  const queryClient = useQueryClient()
  const [analysisNotice, setAnalysisNotice] = useState<string | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [artifactError, setArtifactError] = useState<string | null>(null)
  const [debugOpen, setDebugOpen] = useState(false)

  const missionQuery = useAuthedQuery({
    queryKey: ['mission', missionId],
    queryFn: (token) => api.getMission(token, missionId),
    enabled: Boolean(missionId),
  })

  const reprocessAnalysis = useAuthedMutation({
    mutationKey: ['mission', missionId, 'analysis', 'reprocess'],
    mutationFn: ({
      token,
      payload,
    }: {
      token: string
      payload: Parameters<typeof api.reprocessMissionAnalysis>[2]
    }) => api.reprocessMissionAnalysis(token, missionId, payload),
    onSuccess: async (_report, payload) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mission', missionId] }),
        queryClient.invalidateQueries({ queryKey: ['missions'] }),
        queryClient.invalidateQueries({ queryKey: ['missions', 'control-plane'] }),
        queryClient.invalidateQueries({ queryKey: ['web-overview'] }),
        queryClient.invalidateQueries({ queryKey: ['control-plane-dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['control-plane-alerts'] }),
        queryClient.invalidateQueries({ queryKey: ['support', 'queue'] }),
        queryClient.invalidateQueries({ queryKey: ['live-ops', 'flights'] }),
      ])
      setAnalysisError(null)
      setAnalysisNotice(
        payload.mode === 'analysis_failed'
          ? '已切換成示範失敗版本，可用於展示分析與報表失敗的營運故事。'
          : payload.mode === 'no_findings'
            ? '已切換成無異常版本，可用於展示無異常巡檢報表。'
            : '已產生示範異常版本，事件、證據與報表會同步更新。',
      )
    },
  })

  async function openArtifact(
    artifact: MissionArtifactDownload | { artifactName: string; downloadUrl: string },
    mode: 'open' | 'download',
  ) {
    if (!auth.session?.accessToken) {
      setArtifactError('目前沒有可用的登入工作階段，無法開啟成果檔案。')
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
      setArtifactError(
        formatApiError(detail, `${mode === 'download' ? '下載' : '開啟'}成果檔案失敗。`),
      )
    }
  }

  async function handleReprocess(mode: 'normal' | 'no_findings' | 'analysis_failed') {
    try {
      setAnalysisNotice(null)
      setAnalysisError(null)
      await reprocessAnalysis.mutateAsync({ mode })
    } catch (error) {
      const detail = error instanceof ApiError ? error.detail : undefined
      setAnalysisError(formatApiError(detail, '觸發示範分析流程失敗。'))
    }
  }

  if (missionQuery.isPending) {
    return (
      <EmptyState
        title="任務詳情載入中"
        body="正在整理規劃、派工、事件與報表資料。"
      />
    )
  }

  if (missionQuery.isError || !missionQuery.data) {
    return (
      <EmptyState
        title="目前無法載入任務詳情"
        body="找不到這筆任務，請確認任務編號與目前組織範圍。"
      />
    )
  }

  const mission = missionQuery.data
  const latestReportArtifact = mission.latestReport?.downloadArtifact ?? null
  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="任務詳情"
        title={mission.missionName}
        subtitle="從單一任務頁面檢視規劃資料、派工責任、執行狀態、示範分析輸出、證據檔案，以及可下載的巡檢報表。"
        action={
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={mission.status} />
            <StatusBadge status={mission.delivery.state} />
            <StatusBadge status={mission.reportStatus} />
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="space-y-6">
          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">任務背景</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">規劃與任務背景</h2>
            <div className="mt-4">
              <DataList
                rows={[
                  { label: '任務編號', value: mission.missionId },
                  { label: '組織', value: mission.organizationId ?? '目前沒有組織識別碼' },
                  { label: '場域', value: mission.siteId ?? '目前沒有場域識別碼' },
                  { label: '封裝版本', value: mission.bundleVersion },
                  { label: '建立時間', value: formatDateTime(mission.createdAt) },
                  { label: '事件數量', value: mission.eventCount },
                ]}
              />
            </div>
          </Panel>

          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">控制平面串接</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">控制平面規劃串接</h2>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                <p className="font-medium text-chrome-950">航線</p>
                {mission.route ? (
                  <div className="mt-3 space-y-2 text-sm text-chrome-700">
                    <p>{mission.route.name}</p>
                    <p>v{mission.route.version} / {mission.route.pointCount} 個點位</p>
                    <p>預估時間 {Math.round(mission.route.estimatedDurationSec / 60)} 分鐘</p>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-chrome-700">目前沒有綁定航線。</p>
                )}
              </div>
              <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                <p className="font-medium text-chrome-950">模板</p>
                {mission.template ? (
                  <div className="mt-3 space-y-2 text-sm text-chrome-700">
                    <p>{mission.template.name}</p>
                    <p>證據政策 {mission.template.evidencePolicy}</p>
                    <p>報表模式 {mission.template.reportMode}</p>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-chrome-700">目前沒有綁定模板。</p>
                )}
              </div>
              <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                <p className="font-medium text-chrome-950">排程</p>
                {mission.schedule ? (
                  <div className="mt-3 space-y-2 text-sm text-chrome-700">
                    <p>{mission.schedule.recurrence ?? '單次排程'}</p>
                    <p>下次執行 {mission.schedule.nextRunAt ? formatDateTime(mission.schedule.nextRunAt) : '尚未設定'}</p>
                    <p>最近執行 {mission.schedule.lastRunAt ? formatDateTime(mission.schedule.lastRunAt) : '尚未執行'}</p>
                    <p>
                      最近派工 {mission.schedule.lastDispatchedAt ? formatDateTime(mission.schedule.lastDispatchedAt) : '尚未派工'}
                    </p>
                    <p>暫停原因 {mission.schedule.pauseReason ?? '無'}</p>
                    <p>最近結果 {mission.schedule.lastOutcome ?? '尚未執行'}</p>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-chrome-700">目前沒有綁定排程。</p>
                )}
              </div>
            </div>
          </Panel>

          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">派工責任</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">派工與執行責任</h2>
            {mission.dispatch ? (
              <div className="mt-4">
                <DataList
                  rows={[
                    { label: '派工編號', value: mission.dispatch.dispatchId },
                    { label: '派工狀態', value: <StatusBadge status={mission.dispatch.status} /> },
                    { label: '執行對象', value: mission.dispatch.executionTarget ?? '尚未指定' },
                    { label: '負責人', value: mission.dispatch.assignee ?? '尚未指定' },
                    {
                      label: '建立時間',
                      value: formatDateTime(mission.dispatch.dispatchedAt),
                    },
                    {
                      label: '接受時間',
                      value: mission.dispatch.acceptedAt ? formatDateTime(mission.dispatch.acceptedAt) : '尚未接受',
                    },
                    {
                      label: '關閉時間',
                      value: mission.dispatch.closedAt ? formatDateTime(mission.dispatch.closedAt) : '尚未關閉',
                    },
                    {
                      label: '最後更新',
                      value: formatDateTime(mission.dispatch.lastUpdatedAt),
                    },
                    { label: '派工備註', value: mission.dispatch.note ?? '目前沒有交接備註' },
                  ]}
                />
              </div>
            ) : (
              <div className="mt-4">
                  <EmptyState
                    title="目前沒有派工紀錄"
                    body="派工工作區建立派工後，這裡會顯示執行對象、責任人與交接備註。"
                  />
                </div>
              )}
          </Panel>

          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">執行與報表</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">執行與報表狀態</h2>
            <div className="mt-4 space-y-4">
              {mission.executionSummary ? (
                <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                  <p className="font-medium text-chrome-950">執行摘要</p>
                  <div className="mt-3">
                    <DataList
                      rows={[
                        { label: '執行階段', value: <StatusBadge status={mission.executionSummary.phase} /> },
                        {
                          label: '遙測新鮮度',
                          value: <StatusBadge status={mission.executionSummary.telemetryFreshness} />,
                        },
                        {
                          label: '最近一次遙測',
                          value: mission.executionSummary.lastTelemetryAt
                            ? formatDateTime(mission.executionSummary.lastTelemetryAt)
                            : '尚未收到遙測',
                        },
                        {
                          label: '最近一次影像',
                          value: mission.executionSummary.lastImageryAt
                            ? formatDateTime(mission.executionSummary.lastImageryAt)
                            : '尚未收到影像',
                        },
                        { label: '報表狀態', value: <StatusBadge status={mission.executionSummary.reportStatus} /> },
                        { label: '事件數量', value: mission.executionSummary.eventCount },
                        {
                          label: '失敗原因',
                          value: mission.executionSummary.failureReason ?? '目前沒有執行層級的失敗原因',
                        },
                      ]}
                    />
                  </div>
                </div>
              ) : null}

              <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                <p className="font-medium text-chrome-950">巡檢分析與報表</p>
                <p className="mt-2 text-sm text-chrome-700">{reportStatusMessage(mission)}</p>
              </div>

              {analysisNotice ? (
                <div className="rounded-2xl border border-moss-200 bg-moss-50 px-4 py-3 text-sm text-moss-700">
                  {analysisNotice}
                </div>
              ) : null}
              {analysisError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {analysisError}
                </div>
              ) : null}
              {artifactError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {artifactError}
                </div>
              ) : null}

              {auth.isInternal ? (
                <div className="flex flex-wrap gap-3">
                  <ActionButton
                    disabled={reprocessAnalysis.isPending}
                    onClick={() => void handleReprocess('normal')}
                  >
                    {reprocessAnalysis.isPending ? '處理中…' : '產生 demo 異常'}
                  </ActionButton>
                  <ActionButton
                    variant="secondary"
                    disabled={reprocessAnalysis.isPending}
                    onClick={() => void handleReprocess('no_findings')}
                  >
                    產生無異常報表
                  </ActionButton>
                  <ActionButton
                    variant="secondary"
                    disabled={reprocessAnalysis.isPending}
                    onClick={() => void handleReprocess('analysis_failed')}
                  >
                    模擬分析失敗
                  </ActionButton>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3">
                {latestReportArtifact ? (
                  <>
                    <ActionButton
                      variant="secondary"
                      onClick={() => void openArtifact(latestReportArtifact, 'open')}
                    >
                      開啟報表檔案
                    </ActionButton>
                    <ActionButton
                      variant="secondary"
                      onClick={() => void openArtifact(latestReportArtifact, 'download')}
                    >
                      下載報表
                    </ActionButton>
                  </>
                ) : (
                  <span className="text-sm text-chrome-700">目前還沒有可下載的巡檢報表。</span>
                )}
              </div>
            </div>
          </Panel>

          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">事件與證據</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">偵測到的事件</h2>
            <div className="mt-4 space-y-4">
              {mission.events.length === 0 ? (
                <EmptyState
                  title="目前沒有巡檢事件"
                  body="可以產生示範報表建立異常事件與證據檔案，或保留這筆任務作為無異常版本。"
                />
              ) : (
                mission.events.map((event) => (
                  <div key={event.eventId} className={eventCardClass(event.severity)}>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-2xl font-semibold text-chrome-950">{event.category}</p>
                      <span className="rounded-full bg-white px-3 py-1 text-sm text-chrome-700">
                        {formatStatus(event.status)}
                      </span>
                      <span className="rounded-full bg-white px-3 py-1 text-sm text-chrome-700">
                        {severityLabel(event.severity)}
                      </span>
                    </div>
                    <p className="mt-3 text-lg text-chrome-800">{event.summary}</p>
                    <p className="mt-2 text-sm text-chrome-700">偵測時間 {formatDateTime(event.detectedAt)}</p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      {event.evidenceArtifacts.length === 0 ? (
                        <span className="text-sm text-chrome-700">目前沒有證據檔案。</span>
                      ) : (
                        event.evidenceArtifacts.map((artifact) => (
                          <ActionButton
                            key={artifact.artifactName}
                            variant="secondary"
                            onClick={() => void openArtifact(artifact, 'open')}
                          >
                            開啟 {artifact.artifactName}
                          </ActionButton>
                        ))
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Panel>

          {auth.isInternal ? (
            <Panel>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">internal debug</p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">原始契約（除錯）</h2>
              <p className="mt-3 text-sm text-chrome-700">
                預設不在主流程展開，避免 request/response JSON 佔用任務詳情高度。只有 internal user 主動開啟時才載入原始契約。
              </p>
              <div className="mt-4">
                <Modal
                  open={debugOpen}
                  onOpenChange={setDebugOpen}
                  title="規劃請求與回應"
                  description="這個除錯視窗只提供 internal user 檢查 mission request/response contract，不屬於客戶 demo 敘事的一部分。"
                  trigger={<ActionButton variant="secondary">查看原始契約（除錯）</ActionButton>}
                >
                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-2xl border border-chrome-200 bg-chrome-950 px-4 py-4 text-sm text-chrome-50">
                      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-300">請求</p>
                      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all">
                        {JSON.stringify(mission.request ?? {}, null, 2)}
                      </pre>
                    </div>
                    <div className="rounded-2xl border border-chrome-200 bg-chrome-950 px-4 py-4 text-sm text-chrome-50">
                      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-300">回應</p>
                      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all">
                        {JSON.stringify(mission.response ?? {}, null, 2)}
                      </pre>
                    </div>
                  </div>
                </Modal>
              </div>
            </Panel>
          ) : null}
        </div>

        <div className="space-y-6">
          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">成果交付</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">
              {deliveryHeadline(mission.delivery.state)}
            </h2>
            <div className="mt-4">
              <DataList
                rows={[
                  { label: '交付狀態', value: <StatusBadge status={mission.delivery.state} /> },
                  {
                    label: '發布時間',
                    value: mission.delivery.publishedAt ? formatDateTime(mission.delivery.publishedAt) : '尚未發布',
                  },
                  { label: '失敗原因', value: mission.delivery.failureReason ?? '目前沒有任務層級的交付失敗紀錄' },
                  {
                    label: '下一步',
                    value:
                      mission.reportStatus === 'ready'
                        ? '成果與報表都已可供下載。'
                        : '成果已就緒，下一步是產生或檢視巡檢報表。',
                  },
                ]}
              />
            </div>
          </Panel>

          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">最新報表</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">巡檢分析與報表</h2>
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
                    label: '報表摘要',
                    value: mission.latestReport?.summary ?? '目前沒有報表檔案',
                  },
                ]}
              />
            </div>
          </Panel>

          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">成果檔案</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">成果檔案</h2>
            <div className="mt-4 space-y-4">
              {mission.artifacts.length === 0 ? (
                <EmptyState
                  title="目前沒有成果檔案"
                  body="任務 bundle 與巡檢報表產生後，這裡會列出可開啟與下載的 artifact。"
                />
              ) : (
                mission.artifacts.map((artifact) => (
                  <div
                    key={artifact.artifactName}
                    className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-chrome-950">{artifact.artifactName}</p>
                        <p className="mt-1 text-sm text-chrome-700">
                          v{artifact.version} | {formatBytes(artifact.sizeBytes)} | {artifact.contentType}
                        </p>
                        <p className="mt-2 text-xs text-chrome-600">
                          發布時間 {formatDateTime(artifact.publishedAt)}
                        </p>
                      </div>
                      <StatusBadge status="published" />
                    </div>
                    <p className="mt-2 break-all text-xs text-chrome-600">sha256 {artifact.checksumSha256}</p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <ActionButton
                        variant="secondary"
                        onClick={() => void openArtifact(artifact, 'open')}
                      >
                        開啟
                      </ActionButton>
                      <ActionButton
                        variant="secondary"
                        onClick={() => void openArtifact(artifact, 'download')}
                      >
                        下載
                      </ActionButton>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <div className="flex justify-end">
            <Link
              to="/missions"
              className="inline-flex items-center justify-center rounded-full border border-chrome-300 px-4 py-2 text-sm font-medium text-chrome-950 transition hover:border-chrome-500"
            >
              返回任務清單
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
