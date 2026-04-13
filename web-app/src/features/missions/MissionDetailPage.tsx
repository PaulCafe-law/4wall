import { Link, useParams } from 'react-router-dom'

import { DataList, EmptyState, Panel, ShellSection, StatusBadge, formatDateTime } from '../../components/ui'
import { absoluteArtifactUrl, api } from '../../lib/api'
import { useAuthedQuery } from '../../lib/auth-query'

function readArtifactMessage(state: 'planning' | 'ready' | 'failed' | 'published', failureReason: string | null) {
  if (state === 'published') {
    return '成果已正式發布，可直接下載任務包與說明檔。'
  }
  if (state === 'ready') {
    return '規劃已完成，正在整理交付檔案。若長時間沒有成果，請聯繫支援協助查看。'
  }
  if (state === 'failed') {
    return failureReason ?? '本次任務未成功產生交付檔案，請聯繫支援協助查看原因。'
  }
  return '任務仍在規劃中，成果檔完成後會出現在這裡。'
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
        title="尚未選取任務"
        body="請先從任務列表選取一筆任務，再查看請求內容、狀態與成果下載區。"
      />
    )
  }

  if (missionQuery.isLoading) {
    return (
      <Panel>
        <p className="text-sm text-chrome-700">正在載入任務明細…</p>
      </Panel>
    )
  }

  if (!missionQuery.data) {
    return (
      <EmptyState
        title="無法取得任務"
        body="可能是任務不存在，或你目前沒有檢視這筆任務的權限。"
      />
    )
  }

  const mission = missionQuery.data
  const missionKmz = mission.artifacts.find((artifact) => artifact.artifactName === 'mission.kmz')
  const missionMeta = mission.artifacts.find((artifact) => artifact.artifactName === 'mission_meta.json')
  const deliveryMessage = readArtifactMessage(mission.delivery.state, mission.delivery.failureReason)

  const rail = (
    <Panel>
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">任務交付</p>
      <h2 className="mt-3 font-display text-2xl font-semibold text-chrome-950">成果與發布狀態</h2>
      <p className="mt-2 text-sm text-chrome-700">{deliveryMessage}</p>
      <div className="mt-4">
        <DataList
          rows={[
            { label: '交付狀態', value: <StatusBadge status={mission.delivery.state} /> },
            {
              label: '發布時間',
              value: mission.delivery.publishedAt ? formatDateTime(mission.delivery.publishedAt) : '尚未發布',
            },
            { label: '可下載檔案', value: mission.artifacts.length },
            {
              label: '失敗原因',
              value: mission.delivery.failureReason ?? '無',
            },
          ]}
        />
      </div>
      <div className="mt-4 space-y-3">
        {missionKmz ? (
          <a
            className="block rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4 transition hover:border-ember-300"
            href={absoluteArtifactUrl(missionKmz.downloadUrl)}
            target="_blank"
            rel="noreferrer"
          >
            <p className="font-medium text-chrome-950">mission.kmz</p>
            <p className="mt-2 text-xs text-chrome-600">發布於 {formatDateTime(missionKmz.publishedAt)}</p>
            <p className="mt-1 text-xs text-chrome-600">sha256 {missionKmz.checksumSha256}</p>
          </a>
        ) : (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
            目前還沒有可下載的 mission.kmz。若狀態已失敗或長時間停留在規劃中，請聯繫支援協助查看。
          </div>
        )}

        {missionMeta ? (
          <a
            className="block rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4 transition hover:border-ember-300"
            href={absoluteArtifactUrl(missionMeta.downloadUrl)}
            target="_blank"
            rel="noreferrer"
          >
            <p className="font-medium text-chrome-950">mission_meta.json</p>
            <p className="mt-2 text-xs text-chrome-600">發布於 {formatDateTime(missionMeta.publishedAt)}</p>
            <p className="mt-1 text-xs text-chrome-600">sha256 {missionMeta.checksumSha256}</p>
          </a>
        ) : null}
      </div>
    </Panel>
  )

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="任務明細"
        title={mission.missionName}
        subtitle="在同一個畫面中查看任務狀態、規劃輸入、回應內容與可下載的成果。"
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
                { label: '任務狀態', value: <StatusBadge status={mission.status} /> },
                { label: '任務包版本', value: mission.bundleVersion },
                { label: '建立時間', value: formatDateTime(mission.createdAt) },
              ]}
            />
          </Panel>

          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">任務請求</p>
            <pre className="mt-4 overflow-x-auto rounded-2xl bg-chrome-950 p-4 text-xs text-chrome-50">
              {JSON.stringify(mission.request, null, 2)}
            </pre>
          </Panel>

          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">規劃回應</p>
            <pre className="mt-4 overflow-x-auto rounded-2xl bg-chrome-950 p-4 text-xs text-chrome-50">
              {JSON.stringify(mission.response, null, 2)}
            </pre>
          </Panel>

          <div className="xl:hidden">{rail}</div>

          <div className="flex justify-end">
            <Link to="/missions" className="rounded-full border border-chrome-300 px-4 py-2 text-sm text-chrome-800">
              返回任務列表
            </Link>
          </div>
        </div>

        <div className="hidden xl:block">{rail}</div>
      </div>
    </div>
  )
}
