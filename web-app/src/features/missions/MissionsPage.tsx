import { Link } from 'react-router-dom'

import { EmptyState, Metric, Panel, ShellSection, StatusBadge, formatDateTime } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuthedQuery } from '../../lib/auth-query'
import type { MissionSummary } from '../../lib/types'

function describeMission(mission: MissionSummary) {
  if (mission.reportStatus === 'ready') {
    return `${mission.eventCount} event${mission.eventCount === 1 ? '' : 's'} recorded. Report ready${
      mission.reportGeneratedAt ? ` | ${formatDateTime(mission.reportGeneratedAt)}` : ''
    }.`
  }
  if (mission.reportStatus === 'failed') {
    return mission.failureReason ?? 'Mission delivery succeeded, but report generation failed.'
  }
  if (mission.deliveryStatus === 'failed') {
    return mission.failureReason ?? 'Mission delivery failed before artifacts or reporting could finish.'
  }
  if (mission.deliveryStatus === 'published') {
    return mission.publishedAt
      ? `Core artifacts published ${formatDateTime(mission.publishedAt)}. Reporting has not started yet.`
      : 'Core artifacts are published. Reporting has not started yet.'
  }
  if (mission.deliveryStatus === 'ready') {
    return 'Mission bundle is ready, but the publish step has not run yet.'
  }
  return 'Mission is still in planning.'
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
        eyebrow="Mission delivery"
        title="Missions"
        subtitle="Track delivery state, inspection events, and generated reports without leaving the mission index."
        action={
          <Link to="/missions/new" className="inline-flex rounded-full bg-chrome-950 px-4 py-2 text-sm text-white">
            Create mission
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-5">
        <Metric label="Total missions" value={missions.length} />
        <Metric label="Planning" value={planningCount} hint="Still building route or bundle artifacts." />
        <Metric label="Ready" value={readyCount} hint="Planning finished, waiting for publish or dispatch." />
        <Metric label="Report ready" value={reportReadyCount} hint="Event analysis and report export are available." />
        <Metric label="Needs review" value={failedCount} hint="Delivery or reporting requires follow-up." />
      </div>

      {publishedCount > 0 ? (
        <Panel className="border border-moss-200 bg-moss-50/60">
          <p className="font-medium text-chrome-950">{publishedCount} mission artifact bundle(s) are published.</p>
          <p className="mt-2 text-sm text-chrome-700">
            Open a mission to review events, evidence artifacts, and downloadable inspection reports.
          </p>
        </Panel>
      ) : null}

      {missionsQuery.isLoading ? (
        <Panel>
          <p className="text-sm text-chrome-700">Loading mission delivery records...</p>
        </Panel>
      ) : null}

      {!missionsQuery.isLoading && missions.length === 0 ? (
        <EmptyState
          title="No missions yet"
          body="Create the first mission to connect route planning, dispatch metadata, evidence artifacts, and inspection reports."
          action={
            <Link to="/missions/new" className="rounded-full bg-chrome-950 px-4 py-2 text-sm text-white">
              Create mission
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
                    Created {formatDateTime(mission.createdAt)} | Bundle {mission.bundleVersion} | Events {mission.eventCount}
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
