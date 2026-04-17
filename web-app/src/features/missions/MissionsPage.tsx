import { Link } from 'react-router-dom'

import { EmptyState, Metric, Panel, ShellSection, StatusBadge, formatDateTime } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuthedQuery } from '../../lib/auth-query'
import type { MissionSummary } from '../../lib/types'

function describeMission(mission: MissionSummary) {
  if (mission.reportStatus === 'ready') {
    return `${mission.eventCount} 筆事件已記錄，報表已完成${
      mission.reportGeneratedAt ? `｜${formatDateTime(mission.reportGeneratedAt)}` : ''
    }。`
  }
  if (mission.reportStatus === 'failed') {
    return mission.failureReason ?? '任務成果已完成，但報表產生失敗。'
  }
  if (mission.deliveryStatus === 'failed') {
    return mission.failureReason ?? '任務在成果或報表完成前就已失敗。'
  }
  if (mission.deliveryStatus === 'published') {
    return mission.publishedAt
      ? `核心成果已於 ${formatDateTime(mission.publishedAt)} 發布，報表流程尚未開始。`
      : '核心成果已發布，報表流程尚未開始。'
  }
  if (mission.deliveryStatus === 'ready') {
    return '任務封裝已就緒，但發布步驟尚未完成。'
  }
  return '任務仍在規劃中。'
}

function sortByPriority(missions: MissionSummary[]) {
  const deliveryOrder: Record<MissionSummary['deliveryStatus'], number> = {
    failed: 0,
    ready: 1,
    planning: 2,
    published: 3,
  }

  return [...missions].sort((left, right) => {
    if (left.reportStatus === 'failed' && right.reportStatus !== 'failed') {
      return -1
    }
    if (right.reportStatus === 'failed' && left.reportStatus !== 'failed') {
      return 1
    }
    if (deliveryOrder[left.deliveryStatus] !== deliveryOrder[right.deliveryStatus]) {
      return deliveryOrder[left.deliveryStatus] - deliveryOrder[right.deliveryStatus]
    }
    return right.createdAt.localeCompare(left.createdAt)
  })
}

export function MissionsPage() {
  const missionsQuery = useAuthedQuery({
    queryKey: ['missions'],
    queryFn: api.listMissions,
    staleTime: 15_000,
  })

  const missions = missionsQuery.data ?? []
  const orderedMissions = sortByPriority(missions)
  const planningCount = missions.filter((mission) => mission.deliveryStatus === 'planning').length
  const readyCount = missions.filter((mission) => mission.deliveryStatus === 'ready').length
  const publishedCount = missions.filter((mission) => mission.deliveryStatus === 'published').length
  const failedCount = missions.filter(
    (mission) => mission.deliveryStatus === 'failed' || mission.reportStatus === 'failed',
  ).length
  const reportReadyCount = missions.filter((mission) => mission.reportStatus === 'ready').length

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="任務交付"
        title="任務"
        subtitle="在任務清單中直接追蹤交付狀態、巡檢事件與報表產出，不需要離開任務索引頁。"
        action={
          <Link to="/missions/new" className="inline-flex rounded-full bg-chrome-950 px-4 py-2 text-sm text-white">
            建立任務
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-5">
        <Metric label="任務總數" value={missions.length} />
        <Metric label="規劃中" value={planningCount} hint="仍在產生航線或封裝成果。" />
        <Metric label="已就緒" value={readyCount} hint="規劃完成，等待發布或派工。" />
        <Metric label="報表已完成" value={reportReadyCount} hint="事件分析與報表匯出都已可用。" />
        <Metric label="待檢查" value={failedCount} hint="交付或報表流程仍需追蹤處理。" />
      </div>

      {publishedCount > 0 ? (
        <Panel className="border border-moss-200 bg-moss-50/60">
          <p className="font-medium text-chrome-950">已有 {publishedCount} 筆任務成果完成發布。</p>
          <p className="mt-2 text-sm text-chrome-700">
            開啟任務即可查看事件、證據檔案與可下載的巡檢報表。
          </p>
        </Panel>
      ) : null}

      {missionsQuery.isLoading ? (
        <Panel>
          <p className="text-sm text-chrome-700">正在載入任務交付紀錄…</p>
        </Panel>
      ) : null}

      {!missionsQuery.isLoading && missions.length === 0 ? (
        <EmptyState
          title="目前還沒有任務"
          body="建立第一筆任務後，才能串起航線規劃、派工資料、證據檔案與巡檢報表。"
          action={
            <Link to="/missions/new" className="rounded-full bg-chrome-950 px-4 py-2 text-sm text-white">
              建立任務
            </Link>
          }
        />
      ) : null}

      <div className="grid gap-4">
        {orderedMissions.map((mission) => (
          <Link key={mission.missionId} to={`/missions/${mission.missionId}`}>
            <Panel className="transition hover:border-chrome-400 hover:bg-white">
              <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="break-words font-display text-2xl font-semibold text-chrome-950">
                      {mission.missionName}
                    </h2>
                    <StatusBadge status={mission.deliveryStatus} />
                    <StatusBadge status={mission.reportStatus} />
                    {mission.deliveryStatus !== mission.status ? <StatusBadge status={mission.status} /> : null}
                  </div>
                  <p className="mt-2 text-sm text-chrome-700">{describeMission(mission)}</p>
                  <p className="mt-2 text-xs text-chrome-500">
                    建立於 {formatDateTime(mission.createdAt)}｜封裝版本 {mission.bundleVersion}｜事件 {mission.eventCount}
                  </p>
                </div>
                <span className="max-w-full break-all font-mono text-[11px] uppercase tracking-[0.24em] text-chrome-500 md:max-w-xs md:text-right">
                  {mission.missionId}
                </span>
              </div>
            </Panel>
          </Link>
        ))}
      </div>
    </div>
  )
}
