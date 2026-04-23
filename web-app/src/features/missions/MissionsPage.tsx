import { Link } from 'react-router-dom'

import { EmptyState, Metric, Panel, ShellSection, StatusBadge, formatDate } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuthedQuery } from '../../lib/auth-query'
import { formatOperatingProfile } from '../../lib/presentation'
import type { LaunchPointSummary, MissionSummary } from '../../lib/types'

function formatLaunchPoint(launchPoint: LaunchPointSummary | null): string {
  if (!launchPoint) {
    return '未設定 launch point'
  }

  const location = launchPoint.location ?? launchPoint
  const lat = typeof location.lat === 'number' ? location.lat : null
  const lng = typeof location.lng === 'number' ? location.lng : null
  const label = launchPoint.label

  if (lat === null || lng === null) {
    return label ?? '未設定 launch point'
  }

  return `${label ? `${label} / ` : ''}${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

function routeSummary(mission: MissionSummary): string {
  return `Launch ${formatLaunchPoint(mission.launchPoint)} / ${mission.waypointCount} 個 waypoint / ${
    mission.implicitReturnToLaunch ? '含隱含返航' : '未設定返航'
  }`
}

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
        eyebrow="Mission Workspace"
        title="任務"
        subtitle="集中檢視 patrol-route、operating profile、bundle 版本與 route 摘要。"
        action={
          <Link to="/missions/new" className="inline-flex rounded-full bg-chrome-950 px-4 py-2 text-sm text-white">
            建立任務
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="任務總數" value={missions.length} />
        <Metric label="規劃中" value={planningCount} hint="等待 bundle 與 artifact 產出" />
        <Metric label="已就緒" value={readyCount} hint="任務已可交由 Android 下載" />
        <Metric label="失敗" value={failedCount} hint="請回到 Support / Live Ops 追蹤" />
      </div>

      {missionsQuery.isLoading ? (
        <Panel>
          <p className="text-sm text-chrome-700">正在載入任務資料。</p>
        </Panel>
      ) : null}

      {!missionsQuery.isLoading && missions.length === 0 ? (
        <EmptyState
          title="目前沒有任務"
          body="建立第一筆 patrol-route 任務後，這裡會顯示 launch point、waypoint 數量與 operating profile。"
          action={
            <Link to="/missions/new" className="rounded-full bg-chrome-950 px-4 py-2 text-sm text-white">
              建立任務
            </Link>
          }
        />
      ) : null}

      <div className="grid gap-4">
        {missions.map((mission) => (
          <Link key={mission.missionId} to={`/missions/${mission.missionId}`}>
            <Panel className="transition hover:border-chrome-400 hover:bg-white">
              <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="break-words font-display text-2xl font-semibold text-chrome-950">
                      {mission.missionName}
                    </h2>
                    <StatusBadge status={mission.status} />
                    <span className="rounded-full bg-chrome-100 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-chrome-700">
                      {formatOperatingProfile(mission.operatingProfile)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-chrome-700">{routeSummary(mission)}</p>
                  <p className="mt-2 text-xs text-chrome-500">
                    任務版本 {mission.bundleVersion} / 建立於 {formatDate(mission.createdAt)}
                  </p>
                </div>
                <span className="max-w-full break-all font-mono text-[11px] uppercase tracking-[0.24em] text-chrome-500 md:max-w-xs md:text-right">
                  {mission.organizationId ?? '無組織'}
                </span>
              </div>
            </Panel>
          </Link>
        ))}
      </div>
    </div>
  )
}
