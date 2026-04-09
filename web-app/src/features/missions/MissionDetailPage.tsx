import { Link, useParams } from 'react-router-dom'

import { DataList, EmptyState, Panel, ShellSection, StatusBadge, formatDate } from '../../components/ui'
import { absoluteArtifactUrl, api } from '../../lib/api'
import { useAuthedQuery } from '../../lib/auth-query'
import type { ArtifactDescriptor } from '../../lib/types'

function readArtifacts(record: Record<string, unknown>): { missionKmz?: ArtifactDescriptor; missionMeta?: ArtifactDescriptor } {
  const artifacts = record.artifacts as Record<string, ArtifactDescriptor> | undefined
  return {
    missionKmz: artifacts?.missionKmz,
    missionMeta: artifacts?.missionMeta,
  }
}

export function MissionDetailPage() {
  const { missionId = '' } = useParams()

  const missionQuery = useAuthedQuery({
    queryKey: ['mission', missionId],
    queryFn: (token) => api.getMission(token, missionId),
    enabled: Boolean(missionId),
  })

  if (!missionId) {
    return (
      <EmptyState
        title="Mission not selected"
        body="Pick a mission from the mission index to inspect request payload, bundle result, and artifacts."
      />
    )
  }

  if (missionQuery.isLoading) {
    return (
      <Panel>
        <p className="text-sm text-chrome-700">Loading mission detail…</p>
      </Panel>
    )
  }

  if (!missionQuery.data) {
    return (
      <EmptyState
        title="Mission unavailable"
        body="The selected mission could not be loaded with the current role and org scope."
      />
    )
  }

  const mission = missionQuery.data
  const artifacts = readArtifacts(mission.response)

  const rail = (
    <Panel>
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Artifact panel</p>
      <h2 className="mt-3 font-display text-2xl font-semibold text-chrome-950">Bundle outputs</h2>
      <div className="mt-4 space-y-3">
        {artifacts.missionKmz ? (
          <a
            className="block rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4 transition hover:border-ember-300"
            href={absoluteArtifactUrl(artifacts.missionKmz.downloadUrl)}
            target="_blank"
            rel="noreferrer"
          >
            <p className="font-medium text-chrome-950">mission.kmz</p>
            <p className="mt-2 text-xs text-chrome-600">sha256 {artifacts.missionKmz.checksumSha256}</p>
          </a>
        ) : (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
            Artifact generation failed or is not yet available.
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
            <p className="mt-2 text-xs text-chrome-600">sha256 {artifacts.missionMeta.checksumSha256}</p>
          </a>
        ) : null}
      </div>
    </Panel>
  )

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="Mission detail"
        title={mission.missionName}
        subtitle="Review planner inputs, org association, status, and published artifacts from one screen."
        action={<StatusBadge status={mission.status} />}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Panel>
            <div className="grid gap-4 md:grid-cols-2">
              <DataList
                rows={[
                  { label: 'Mission ID', value: mission.missionId },
                  { label: 'Organization', value: mission.organizationId ?? 'Internal only' },
                  { label: 'Site', value: mission.siteId ?? 'Not linked' },
                  { label: 'Bundle', value: mission.bundleVersion },
                  { label: 'Created', value: formatDate(mission.createdAt) },
                ]}
              />
            </div>
          </Panel>

          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Request payload</p>
            <pre className="mt-4 overflow-x-auto rounded-2xl bg-chrome-950 p-4 text-xs text-chrome-50">
              {JSON.stringify(mission.request, null, 2)}
            </pre>
          </Panel>

          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Response payload</p>
            <pre className="mt-4 overflow-x-auto rounded-2xl bg-chrome-950 p-4 text-xs text-chrome-50">
              {JSON.stringify(mission.response, null, 2)}
            </pre>
          </Panel>

          <div className="xl:hidden">{rail}</div>

          <div className="flex justify-end">
            <Link to="/missions" className="rounded-full border border-chrome-300 px-4 py-2 text-sm text-chrome-800">
              Back to missions
            </Link>
          </div>
        </div>

        <div className="hidden xl:block">{rail}</div>
      </div>
    </div>
  )
}
