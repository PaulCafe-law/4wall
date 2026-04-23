import { Link, useParams } from 'react-router-dom'

import { DataList, EmptyState, Panel, ShellSection, StatusBadge, formatDate } from '../../components/ui'
import { absoluteArtifactUrl, api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAuthedQuery } from '../../lib/auth-query'
import {
  formatCameraStreamState,
  formatExecutionMode,
  formatExecutionState,
  formatLandingPhase,
  formatOperatingProfile,
  formatRecordingState,
  formatUploadState,
} from '../../lib/presentation'
import type { ArtifactDescriptor, LaunchPointSummary, MissionDetail } from '../../lib/types'

function readArtifacts(record: Record<string, unknown>): {
  missionKmz?: ArtifactDescriptor
  missionMeta?: ArtifactDescriptor
} {
  const artifacts = record.artifacts as Record<string, ArtifactDescriptor> | undefined
  return {
    missionKmz: artifacts?.missionKmz,
    missionMeta: artifacts?.missionMeta,
  }
}

function formatLaunchPoint(launchPoint: LaunchPointSummary | null): string {
  if (!launchPoint) {
    return 'No launch point'
  }

  const location = launchPoint.location ?? launchPoint
  const lat = typeof location.lat === 'number' ? location.lat : null
  const lng = typeof location.lng === 'number' ? location.lng : null
  const label = launchPoint.label

  if (lat === null || lng === null) {
    return label ?? 'No launch point'
  }

  return `${label ? `${label} / ` : ''}${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

function DebugContractPanel({ mission }: { mission: MissionDetail }) {
  return (
    <Panel>
      <details className="group">
        <summary className="cursor-pointer list-none font-medium text-chrome-950">
          Raw Contract Debug
          <span className="ml-2 text-sm text-chrome-500 group-open:hidden">Open request / response</span>
          <span className="ml-2 hidden text-sm text-chrome-500 group-open:inline">Collapse</span>
        </summary>
        <div className="mt-4 space-y-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">request</p>
            <pre className="mt-3 overflow-x-auto rounded-2xl bg-chrome-950 p-4 text-xs text-chrome-50">
              {JSON.stringify(mission.request, null, 2)}
            </pre>
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">response</p>
            <pre className="mt-3 overflow-x-auto rounded-2xl bg-chrome-950 p-4 text-xs text-chrome-50">
              {JSON.stringify(mission.response, null, 2)}
            </pre>
          </div>
        </div>
      </details>
    </Panel>
  )
}

export function MissionDetailPage() {
  const { missionId = '' } = useParams()
  const auth = useAuth()

  const missionQuery = useAuthedQuery({
    queryKey: ['mission', missionId],
    queryFn: (token) => api.getMission(token, missionId),
    enabled: Boolean(missionId),
  })

  if (!missionId) {
    return <EmptyState title="Missing mission id" body="Open this page from the mission list or live ops." />
  }

  if (missionQuery.isLoading) {
    return (
      <Panel>
        <p className="text-sm text-chrome-700">Loading mission detail…</p>
      </Panel>
    )
  }

  if (!missionQuery.data) {
    return <EmptyState title="Mission not found" body="Check the mission id and try again from the mission workspace." />
  }

  const mission = missionQuery.data
  const artifacts = readArtifacts(mission.response)
  const execution = mission.executionSummary
  const executionProgress =
    execution?.executionMode === 'manual_pilot'
      ? 'Manual pilot active / waypoint progress hidden'
      : execution?.waypointProgress ?? 'No waypoint progress'

  const artifactsRail = (
    <Panel>
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Artifacts</p>
      <h2 className="mt-3 font-display text-2xl font-semibold text-chrome-950">Mission Bundle</h2>
      <div className="mt-4 space-y-3">
        {artifacts.missionKmz ? (
          <a
            className="block rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4 transition hover:border-ember-300"
            href={absoluteArtifactUrl(artifacts.missionKmz.downloadUrl)}
            target="_blank"
            rel="noreferrer"
          >
            <p className="font-medium text-chrome-950">mission.kmz</p>
            <p className="mt-1 text-sm text-chrome-700">DJI waypoint mission artifact</p>
            <p className="mt-2 text-xs text-chrome-600">sha256 {artifacts.missionKmz.checksumSha256}</p>
          </a>
        ) : (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
            mission.kmz is missing
          </div>
        )}

        {artifacts.missionMeta ? (
          <a
            className="block rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4 transition hover:border-ember-300"
            href={absoluteArtifactUrl(artifacts.missionMeta.downloadUrl)}
            target="_blank"
            rel="noreferrer"
          >
            <p className="font-medium text-chrome-950">mission_meta.json</p>
            <p className="mt-1 text-sm text-chrome-700">Patrol route metadata and landing policy</p>
            <p className="mt-2 text-xs text-chrome-600">sha256 {artifacts.missionMeta.checksumSha256}</p>
          </a>
        ) : null}
      </div>
    </Panel>
  )

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="Mission Detail"
        title={mission.missionName}
        subtitle="Mission planning, Android execution summary, and bundle artifacts for patrol route and manual pilot flows."
        action={<StatusBadge status={mission.status} />}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Patrol Route</p>
            <div className="mt-4">
              <DataList
                rows={[
                  { label: 'Mission ID', value: mission.missionId },
                  { label: 'Organization', value: mission.organizationId ?? 'No organization' },
                  { label: 'Site', value: mission.siteId ?? 'No site' },
                  { label: 'Route Mode', value: mission.routeMode },
                  { label: 'Profile', value: formatOperatingProfile(mission.operatingProfile) },
                  { label: 'Bundle', value: mission.bundleVersion },
                  { label: 'Launch', value: formatLaunchPoint(mission.launchPoint) },
                  { label: 'Waypoint Count', value: mission.waypointCount },
                  { label: 'Implicit RTL', value: mission.implicitReturnToLaunch ? 'Yes' : 'No' },
                  { label: 'Created At', value: formatDate(mission.createdAt) },
                ]}
              />
            </div>
          </Panel>

          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Execution</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">Android Runtime</h2>
            {execution ? (
              <div className="mt-4">
                <DataList
                  rows={[
                    { label: 'Flight', value: execution.flightId ?? 'No flight session' },
                    {
                      label: 'Planned Profile',
                      value: formatOperatingProfile(execution.plannedOperatingProfile ?? mission.operatingProfile),
                    },
                    {
                      label: 'Executed Profile',
                      value: formatOperatingProfile(execution.executedOperatingProfile ?? mission.operatingProfile),
                    },
                    { label: 'Mode', value: formatExecutionMode(execution.executionMode) },
                    { label: 'Upload', value: formatUploadState(execution.uploadState) },
                    { label: 'State', value: formatExecutionState(execution.executionState) },
                    { label: 'Progress', value: executionProgress },
                    { label: 'Camera', value: formatCameraStreamState(execution.cameraStreamState) },
                    { label: 'Recording', value: formatRecordingState(execution.recordingState) },
                    { label: 'Landing', value: formatLandingPhase(execution.landingPhase) },
                    { label: 'Fallback', value: execution.fallbackReason ?? 'None' },
                    { label: 'Last Event', value: execution.lastEventType ?? 'None' },
                    { label: 'Status Note', value: execution.statusNote ?? 'None' },
                  ]}
                />
              </div>
            ) : (
              <p className="mt-4 text-sm text-chrome-700">No Android execution summary has been reported yet.</p>
            )}
          </Panel>

          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Notes</p>
            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                <h3 className="font-medium text-chrome-950">Outdoor Patrol</h3>
                <p className="mt-2 text-sm text-chrome-700">
                  Outdoor patrol keeps route authority in the mission bundle: launch point, ordered waypoints, and implicit return-to-launch.
                </p>
              </div>
              <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                <h3 className="font-medium text-chrome-950">Manual Pilot</h3>
                <p className="mt-2 text-sm text-chrome-700">
                  Manual pilot is an Android-local execution mode. It does not rewrite planner route geometry or move stick control into web.
                </p>
              </div>
            </div>
          </Panel>

          {auth.isInternal ? <DebugContractPanel mission={mission} /> : null}

          <div className="xl:hidden">{artifactsRail}</div>

          <div className="flex justify-end">
            <Link to="/missions" className="rounded-full border border-chrome-300 px-4 py-2 text-sm text-chrome-800">
              Back to Missions
            </Link>
          </div>
        </div>

        <div className="hidden xl:block">{artifactsRail}</div>
      </div>
    </div>
  )
}
