import { Link } from 'react-router-dom'

import { EmptyState, Metric, Panel, ShellSection, StatusBadge, formatDateTime } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuthedQuery } from '../../lib/auth-query'
import type { MissionSummary } from '../../lib/types'

function describeMissionDelivery(mission: MissionSummary) {
  if (mission.deliveryStatus === 'published') {
    return mission.publishedAt
      ? `成果已於 ${formatDateTime(mission.publishedAt)} 發布，可前往詳情下載。`
      : '成果已發布，可前往詳情頁下載。'
  }
  if (mission.deliveryStatus === 'failed') {
    return mission.failureReason ?? '交付失敗，請查看任務詳情中的失敗原因。'
  }
  if (mission.deliveryStatus === 'ready') {
    return '規劃已完成，系統正在等待交付產物或下一步發布。'
  }
  return '任務仍在規劃中，尚未進入交付完成狀態。'
}

function sortByPriority(missions: MissionSummary[]) {
  const order: Record<MissionSummary['deliveryStatus'], number> = {
    failed: 0,
    planning: 1,
    ready: 2,
    published: 3,
  }
  return [...missions].sort((left, right) => {
    if (order[left.deliveryStatus] !== order[right.deliveryStatus]) {
      return order[left.deliveryStatus] - order[right.deliveryStatus]
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
  const publishedCount = missions.filter((mission) => mission.deliveryStatus === 'published').length
  const failedCount = missions.filter((mission) => mission.deliveryStatus === 'failed').length

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="任務工作區"
        title="任務"
        subtitle="這裡集中管理所有任務請求、規劃狀態與交付結果。你現在可以直接從列表分辨哪些任務還在規劃、哪些已發布、哪些需要補救。"
        action={
          <Link to="/missions/new" className="inline-flex rounded-full bg-chrome-950 px-4 py-2 text-sm text-white">
            新增任務請求
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="全部任務" value={missions.length} />
        <Metric label="規劃中" value={planningCount} hint="仍需等待規劃完成或交付產物發布。" />
        <Metric label="已發布" value={publishedCount} hint="成果已完成交付，可直接下載。" />
        <Metric
          label="失敗"
          value={failedCount}
          hint={failedCount > 0 ? '請優先查看失敗原因與下一步處理方式。' : '目前沒有交付失敗的任務。'}
        />
      </div>

      {missionsQuery.isLoading ? (
        <Panel>
          <p className="text-sm text-chrome-700">正在載入任務列表…</p>
        </Panel>
      ) : null}

      {!missionsQuery.isLoading && missions.length === 0 ? (
        <EmptyState
          title="目前還沒有任務"
          body="先建立第一筆任務請求，之後這裡會顯示規劃、交付與失敗狀態。"
          action={
            <Link to="/missions/new" className="rounded-full bg-chrome-950 px-4 py-2 text-sm text-white">
              建立第一筆任務
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
                    {mission.deliveryStatus !== mission.status ? <StatusBadge status={mission.status} /> : null}
                  </div>
                  <p className="mt-2 text-sm text-chrome-700">建立時間：{formatDateTime(mission.createdAt)}</p>
                  <p className="mt-1 text-sm text-chrome-700">Bundle：{mission.bundleVersion}</p>
                  <p className="mt-2 text-sm text-chrome-700">{describeMissionDelivery(mission)}</p>
                </div>
                <span className="max-w-full break-all font-mono text-[11px] uppercase tracking-[0.24em] text-chrome-500 md:max-w-xs md:text-right">
                  {mission.organizationId ?? '未綁定組織'}
                </span>
              </div>
            </Panel>
          </Link>
        ))}
      </div>
    </div>
  )
}
