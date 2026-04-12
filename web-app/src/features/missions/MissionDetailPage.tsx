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
        title="找不到任務"
        body="請從任務列表重新開啟一筆任務，查看狀態、請求內容與成果下載區。"
      />
    )
  }

  if (missionQuery.isLoading) {
    return (
      <Panel>
        <p className="text-sm text-chrome-700">正在讀取任務詳情…</p>
      </Panel>
    )
  }

  if (!missionQuery.data) {
    return (
      <EmptyState
        title="目前無法讀取這筆任務"
        body="可能是任務不存在，或你目前沒有檢視它的權限。"
      />
    )
  }

  const mission = missionQuery.data
  const artifacts = readArtifacts(mission.response)

  const rail = (
    <Panel>
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">任務成果</p>
      <h2 className="mt-3 font-display text-2xl font-semibold text-chrome-950">下載區</h2>
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
            目前還沒有 mission.kmz 可下載。若任務已失敗，請通知內部支援協助查看。
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
        eyebrow="任務詳情"
        title={mission.missionName}
        subtitle="查看這筆任務的狀態、原始請求內容、規劃回應與成果下載區。"
        action={<StatusBadge status={mission.status} />}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Panel>
            <DataList
              rows={[
                { label: '任務編號', value: mission.missionId },
                { label: '組織', value: mission.organizationId ?? '未指定組織' },
                { label: '場址', value: mission.siteId ?? '未指定場址' },
                { label: '成果版本', value: mission.bundleVersion },
                { label: '建立時間', value: formatDate(mission.createdAt) },
              ]}
            />
          </Panel>

          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">任務請求內容</p>
            <pre className="mt-4 overflow-x-auto rounded-2xl bg-chrome-950 p-4 text-xs text-chrome-50">
              {JSON.stringify(mission.request, null, 2)}
            </pre>
          </Panel>

          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">規劃回應內容</p>
            <pre className="mt-4 overflow-x-auto rounded-2xl bg-chrome-950 p-4 text-xs text-chrome-50">
              {JSON.stringify(mission.response, null, 2)}
            </pre>
          </Panel>

          <div className="xl:hidden">{rail}</div>

          <div className="flex justify-end">
            <Link to="/missions" className="rounded-full border border-chrome-300 px-4 py-2 text-sm text-chrome-800">
              回到任務列表
            </Link>
          </div>
        </div>

        <div className="hidden xl:block">{rail}</div>
      </div>
    </div>
  )
}
