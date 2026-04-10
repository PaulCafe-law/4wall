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
        eyebrow="Mission index"
        title="Missions"
        subtitle="Track the planning queue, review generated bundles, and jump into site-scoped mission detail."
        action={
          <Link to="/missions/new" className="inline-flex rounded-full bg-chrome-950 px-4 py-2 text-sm text-white">
            New Mission Request
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Total" value={missions.length} />
        <Metric label="Planning" value={planningCount} hint="Use this state to flag queue lag or stalled generation." />
        <Metric label="Ready" value={readyCount} hint={failedCount > 0 ? `${failedCount} failed` : 'No failed plans'} />
      </div>

      {missionsQuery.isLoading ? (
        <Panel>
          <p className="text-sm text-chrome-700">Loading missions…</p>
        </Panel>
      ) : null}

      {!missionsQuery.isLoading && missions.length === 0 ? (
        <EmptyState
          title="No mission yet"
          body="Once a customer or ops user submits a planner request, missions land here with bundle status and artifact links."
          action={
            <Link to="/missions/new" className="rounded-full bg-chrome-950 px-4 py-2 text-sm text-white">
              Open Planner Workspace
            </Link>
          }
        />
      ) : null}

      <div className="grid gap-4">
        {missions.map((mission) => (
          <Link key={mission.missionId} to={`/missions/${mission.missionId}`}>
            <Panel className="transition hover:border-chrome-400 hover:bg-white">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="font-display text-2xl font-semibold text-chrome-950">
                      {mission.missionName}
                    </h2>
                    <StatusBadge status={mission.status} />
                  </div>
                  <p className="mt-2 text-sm text-chrome-700">
                    Bundle {mission.bundleVersion} • Created {formatDate(mission.createdAt)}
                  </p>
                </div>
                <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-chrome-500">
                  {mission.organizationId ?? 'internal'}
                </span>
              </div>
            </Panel>
          </Link>
        ))}
      </div>
    </div>
  )
}
