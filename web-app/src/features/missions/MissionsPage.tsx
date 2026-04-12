import { Link } from 'react-router-dom'

import { EmptyState, Metric, Panel, ShellSection, StatusBadge, formatDate } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuthedQuery } from '../../lib/auth-query'

export function MissionsPage() {
  const missionsQuery = useAuthedQuery({
    queryKey: ['missions'],
    queryFn: api.listMissions,
    staleTime: 15_000,
  })

  const missions = missionsQuery.data ?? []
  const readyCount = missions.filter((mission) => mission.status === 'ready').length
  const planningCount = missions.filter((mission) => mission.status === 'planning').length
  const failedCount = missions.filter((mission) => mission.status === 'failed').length

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="任務總覽"
        title="任務"
        subtitle="追蹤規劃佇列、檢視已產生的任務包，並快速進入場址層級的任務明細。"
        action={
          <Link to="/missions/new" className="inline-flex rounded-full bg-chrome-950 px-4 py-2 text-sm text-white">
            新增任務請求
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="全部" value={missions.length} />
        <Metric label="規劃中" value={planningCount} hint="可用來辨識佇列延遲或產生程序卡住。" />
        <Metric label="已就緒" value={readyCount} hint={failedCount > 0 ? `${failedCount} 筆失敗` : '目前沒有失敗的規劃'} />
      </div>

      {missionsQuery.isLoading ? (
        <Panel>
          <p className="text-sm text-chrome-700">正在載入任務…</p>
        </Panel>
      ) : null}

      {!missionsQuery.isLoading && missions.length === 0 ? (
        <EmptyState
          title="尚無任務"
          body="當客戶或營運人員送出規劃請求後，任務會出現在這裡，並附上任務包狀態與產物連結。"
          action={
            <Link to="/missions/new" className="rounded-full bg-chrome-950 px-4 py-2 text-sm text-white">
              開啟規劃器
            </Link>
          }
        />
      ) : null}

      <div className="grid gap-4">
        {missions.map((mission) => (
          <Link key={mission.missionId} to={`/missions/${mission.missionId}`}>
            <Panel className="transition hover:border-chrome-400 hover:bg-white">
              <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="break-words font-display text-2xl font-semibold text-chrome-950">
                      {mission.missionName}
                    </h2>
                    <StatusBadge status={mission.status} />
                  </div>
                  <p className="mt-2 text-sm text-chrome-700">
                    任務包 {mission.bundleVersion} · 建立於 {formatDate(mission.createdAt)}
                  </p>
                </div>
                <span className="max-w-full break-all font-mono text-[11px] uppercase tracking-[0.24em] text-chrome-500 md:max-w-xs md:text-right">
                  {mission.organizationId ?? '內部'}
                </span>
              </div>
            </Panel>
          </Link>
        ))}
      </div>
    </div>
  )
}
