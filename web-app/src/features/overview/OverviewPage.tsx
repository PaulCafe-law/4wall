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
  return `${waypointCount} waypoints / ${implicitReturnToLaunch ? 'implicit return-to-launch' : 'open route'}`
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
        eyebrow="Overview"
        title="Operations Overview"
        subtitle="Mission coverage, profile mix, and live execution status for Sprint 4 patrol-route and manual-pilot flows."
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Sites" value={sites.length} hint="Customer-visible site inventory" />
        <Metric label="Missions" value={missions.length} hint="Planned missions across all accessible organizations" />
        <Metric label="Ready" value={readyCount} hint="Mission bundles ready for Android sync" />
        <Metric label="Failed" value={failedCount} hint="Missions currently surfaced as failed" />
      </div>

      {missionsQuery.isLoading || sitesQuery.isLoading ? (
        <Panel>
          <p className="text-sm text-chrome-700">Loading overview…</p>
        </Panel>
      ) : null}

      {!missionsQuery.isLoading && missions.length === 0 ? (
        <EmptyState
          title="No missions yet"
          body="Plan the first patrol route mission to populate mission coverage, profile mix, and live ops status."
          action={
            <Link to="/missions/new" className="rounded-full bg-chrome-950 px-4 py-2 text-sm text-white">
              Create Mission
            </Link>
          }
        />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Panel>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Mission Feed</p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">Recent Missions</h2>
            </div>
            <Link to="/missions" className="text-sm text-ember-600 underline underline-offset-4">
              View All Missions
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
                  <p className="mt-2 text-xs text-chrome-500">Created {formatDate(mission.createdAt)}</p>
                </div>
              </Link>
            ))}
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Profile Mix</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">Execution Profiles</h2>
            <div className="mt-4 grid gap-4">
              <Metric
                label="Outdoor Patrol"
                value={missions.length - indoorCount}
                hint="Route-owned launch point, waypoints, and implicit RTL"
              />
              <Metric
                label="Indoor Manual"
                value={indoorCount}
                hint="Conservative manual mode with HOLD / LAND / TAKEOVER only"
              />
            </div>
          </Panel>

          {auth.isInternal ? (
            <Panel>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Live Ops Snapshot</p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">Active Flight Status</h2>
              <div className="mt-4 grid gap-4">
                <Metric label="Flight Sessions" value={liveFlights.length} hint="Android flight sessions reporting telemetry" />
                <Metric label="Manual Pilot" value={manualPilotFlights} hint="Sessions currently in operator stick control" />
                <Metric
                  label="RC Fallback"
                  value={activeLandingFallbacks.length}
                  hint="Landing flows that downgraded to RC-only control"
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
                      Landing: {formatLandingPhase(flight.executionSummary?.landingPhase)}
                    </p>
                    <p className="mt-1 text-xs text-chrome-500">
                      {flight.executionSummary?.executionMode === 'manual_pilot'
                        ? 'Manual pilot active'
                        : flight.executionSummary?.waypointProgress ?? 'No waypoint progress'}
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
