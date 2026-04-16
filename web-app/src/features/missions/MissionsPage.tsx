import { Link } from 'react-router-dom'

import { EmptyState, Metric, Panel, ShellSection, StatusBadge, formatDateTime } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuthedQuery } from '../../lib/auth-query'
import type { MissionSummary } from '../../lib/types'

function describeMissionDelivery(mission: MissionSummary) {
  if (mission.deliveryStatus === 'published') {
    return mission.publishedAt
      ? `交付檔已於 ${formatDateTime(mission.publishedAt)} 發布，可前往任務詳情下載。`
      : '交付檔已發布，可前往任務詳情下載。'
  }
  if (mission.deliveryStatus === 'failed') {
    return mission.failureReason ?? '任務交付失敗，請查看任務詳情確認原因。'
  }
  if (mission.deliveryStatus === 'ready') {
    return '任務已規劃完成，等待正式發布成果檔。'
  }
  return '任務仍在規劃中，成果檔尚未可下載。'
}

function sortByPriority(missions: MissionSummary[]) {
  const order: Record<MissionSummary['deliveryStatus'], number> = {
    failed: 0,
    ready: 1,
    planning: 2,
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
  const readyCount = missions.filter((mission) => mission.deliveryStatus === 'ready').length
  const publishedCount = missions.filter((mission) => mission.deliveryStatus === 'published').length
  const failedCount = missions.filter((mission) => mission.deliveryStatus === 'failed').length

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="Mission delivery"
        title="任務"
        subtitle="從同一頁查看規劃進度、交付狀態與失敗原因，快速判斷哪些任務需要優先處理。"
        action={
          <Link to="/missions/new" className="inline-flex rounded-full bg-chrome-950 px-4 py-2 text-sm text-white">
            新增任務請求
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="全部任務" value={missions.length} />
        <Metric label="規劃中" value={planningCount} hint="仍在等待規劃結果或交付檔。" />
        <Metric label="待交付" value={readyCount} hint="任務已規劃完成，等待發布成果。" />
        <Metric
          label="需要關注"
          value={failedCount}
          hint={failedCount > 0 ? '請優先查看失敗原因與後續處理方式。' : '目前沒有失敗任務。'}
        />
      </div>

      {publishedCount > 0 ? (
        <Panel className="border border-moss-200 bg-moss-50/60">
          <p className="font-medium text-chrome-950">{publishedCount} 筆任務已經完成交付</p>
          <p className="mt-2 text-sm text-chrome-700">可從任務詳情下載最新成果檔與 checksum。</p>
        </Panel>
      ) : null}

      {missionsQuery.isLoading ? (
        <Panel>
          <p className="text-sm text-chrome-700">正在載入任務清單…</p>
        </Panel>
      ) : null}

      {!missionsQuery.isLoading && missions.length === 0 ? (
        <EmptyState
          title="目前還沒有任務"
          body="先建立第一筆任務請求，後續的規劃、交付與失敗原因都會在這裡追蹤。"
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
                  <p className="mt-2 text-sm text-chrome-700">{describeMissionDelivery(mission)}</p>
                  <p className="mt-2 text-xs text-chrome-500">
                    建立於 {formatDateTime(mission.createdAt)} · Bundle {mission.bundleVersion}
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
