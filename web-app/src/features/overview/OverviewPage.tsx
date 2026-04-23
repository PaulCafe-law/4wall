import { Link } from 'react-router-dom'

import { EmptyState, Metric, Panel, ShellSection, StatusBadge, formatDate } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAuthedQuery } from '../../lib/auth-query'
import {
  formatExecutionMode,
  formatLandingPhase,
  formatOperatingProfile,
} from '../../lib/presentation'

function recentMissionHint(waypointCount: number, implicitReturnToLaunch: boolean) {
  return `${waypointCount} 個航點 / ${implicitReturnToLaunch ? '隱式返航' : '開放路徑'}`
}

export function OverviewPage() {
  const auth = useAuth()
  const missionsQuery = useAuthedQuery({
    queryKey: ['missions'],
    queryFn: api.listMissions,
    staleTime: 15_000,
  })
  const sitesQuery = useAuthedQuery({
    queryKey: ['sites'],
    queryFn: api.listSites,
    staleTime: 15_000,
  })
  const liveFlightsQuery = useAuthedQuery({
    queryKey: ['live-ops', 'flights'],
    queryFn: api.listLiveFlights,
    enabled: auth.isInternal,
    staleTime: 5_000,
    refetchInterval: 5_000,
  })

  const missions = missionsQuery.data ?? []
  const sites = sitesQuery.data ?? []
  const liveFlights = liveFlightsQuery.data ?? []
  const readyCount = missions.filter((mission) => mission.status === 'ready').length
  const failedCount = missions.filter((mission) => mission.status === 'failed').length
  const indoorCount = missions.filter((mission) => mission.operatingProfile === 'indoor_no_gps').length
  const manualPilotFlights = liveFlights.filter(
    (flight) => flight.executionSummary?.executionMode === 'manual_pilot',
  ).length
  const recentMissions = [...missions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5)
  const activeLandingFallbacks = liveFlights.filter(
    (flight) => flight.executionSummary?.landingPhase === 'rc_only_fallback',
  )

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="總覽"
        title="營運總覽"
        subtitle="檢視任務覆蓋、執行 profile 分布與 Sprint 4 的即時執行狀態。"
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="場域" value={sites.length} hint="目前角色可見的場域" />
        <Metric label="任務" value={missions.length} hint="可存取組織中的規劃任務" />
        <Metric label="已就緒" value={readyCount} hint="可由 Android 同步的任務包" />
        <Metric label="失敗" value={failedCount} hint="目前標示為失敗的任務" />
      </div>

      {missionsQuery.isLoading || sitesQuery.isLoading ? (
        <Panel>
          <p className="text-sm text-chrome-700">正在載入總覽…</p>
        </Panel>
      ) : null}

      {!missionsQuery.isLoading && missions.length === 0 ? (
        <EmptyState
          title="目前沒有任務"
          body="建立第一筆巡邏任務後，這裡會顯示任務覆蓋、profile 分布與 Live Ops 狀態。"
          action={
            <Link to="/missions/new" className="rounded-full bg-chrome-950 px-4 py-2 text-sm text-white">
              建立任務
            </Link>
          }
        />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Panel>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">任務動態</p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">最近任務</h2>
            </div>
            <Link to="/missions" className="text-sm text-ember-600 underline underline-offset-4">
              查看全部任務
            </Link>
          </div>
          <div className="mt-4 grid gap-3">
            {recentMissions.map((mission) => (
              <Link key={mission.missionId} to={`/missions/${mission.missionId}`}>
                <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4 transition hover:border-chrome-400">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="font-medium text-chrome-950">{mission.missionName}</h3>
                    <StatusBadge status={mission.status} />
                    <span className="rounded-full bg-chrome-100 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-chrome-700">
                      {formatOperatingProfile(mission.operatingProfile)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-chrome-700">
                    {recentMissionHint(mission.waypointCount, mission.implicitReturnToLaunch)}
                  </p>
                  <p className="mt-2 text-xs text-chrome-500">建立時間 {formatDate(mission.createdAt)}</p>
                </div>
              </Link>
            ))}
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Profile 分布</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">執行 Profile</h2>
            <div className="mt-4 grid gap-4">
              <Metric
                label="戶外巡邏"
                value={missions.length - indoorCount}
                hint="起降點、排序航點與隱式返航"
              />
              <Metric
                label="室內手動"
                value={indoorCount}
                hint="保守手動模式，只保留 HOLD / LAND / TAKEOVER"
              />
            </div>
          </Panel>

          {auth.isInternal ? (
            <Panel>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Live Ops 摘要</p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">即時飛行狀態</h2>
              <div className="mt-4 grid gap-4">
                <Metric label="飛行 Session" value={liveFlights.length} hint="Android 回報中的飛行紀錄" />
                <Metric label="手動飛行" value={manualPilotFlights} hint="操作員正在使用雙搖桿控制的 session" />
                <Metric
                  label="遙控器備援"
                  value={activeLandingFallbacks.length}
                  hint="降落流程已降級到遙控器保底"
                />
              </div>
              <div className="mt-4 space-y-3">
                {liveFlights.slice(0, 4).map((flight) => (
                  <div key={flight.flightId} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="font-medium text-chrome-950">{flight.missionName}</h3>
                      <span className="rounded-full bg-chrome-100 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-chrome-700">
                        {formatOperatingProfile(flight.executionSummary?.executedOperatingProfile ?? flight.operatingProfile)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-chrome-700">
                      {formatExecutionMode(flight.executionSummary?.executionMode)}
                    </p>
                    <p className="mt-1 text-sm text-chrome-700">
                      降落：{formatLandingPhase(flight.executionSummary?.landingPhase)}
                    </p>
                    <p className="mt-1 text-xs text-chrome-500">
                      {flight.executionSummary?.executionMode === 'manual_pilot'
                        ? '手動飛行中'
                        : flight.executionSummary?.waypointProgress ?? '尚無航點進度'}
                    </p>
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  )
}
