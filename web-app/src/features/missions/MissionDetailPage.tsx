import { Link, useParams } from 'react-router-dom'

import { DataList, EmptyState, Panel, ShellSection, StatusBadge, formatDateTime } from '../../components/ui'
import { absoluteArtifactUrl, api } from '../../lib/api'
import { useAuthedQuery } from '../../lib/auth-query'

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`
  }
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
}

function deliveryHeadline(state: 'planning' | 'ready' | 'failed' | 'published') {
  if (state === 'published') {
    return '成果已可交付'
  }
  if (state === 'ready') {
    return '任務已規劃完成'
  }
  if (state === 'failed') {
    return '交付流程失敗'
  }
  return '任務仍在規劃中'
}

function deliveryMessage(state: 'planning' | 'ready' | 'failed' | 'published', failureReason: string | null) {
  if (state === 'published') {
    return '最新成果檔已完成發布，可直接下載 mission.kmz 與 metadata。'
  }
  if (state === 'ready') {
    return '任務已完成規劃，但成果檔尚未正式發布。'
  }
  if (state === 'failed') {
    return failureReason ?? '系統未提供更詳細的失敗原因，請聯絡內部支援。'
  }
  return '任務仍在規劃中，請稍後再查看交付狀態。'
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
        title="找不到指定的任務"
        body="請從任務清單重新打開這筆任務，避免使用已過期或不完整的連結。"
      />
    )
  }

  if (missionQuery.isLoading) {
    return (
      <Panel>
        <p className="text-sm text-chrome-700">正在載入任務詳情…</p>
      </Panel>
    )
  }

  if (!missionQuery.data) {
    return (
      <EmptyState
        title="目前無法取得任務詳情"
        body="請重新整理頁面；如果問題持續存在，再檢查任務是否仍屬於你的組織。"
      />
    )
  }

  const mission = missionQuery.data
  const missionKmz = mission.artifacts.find((artifact) => artifact.artifactName === 'mission.kmz')
  const missionMeta = mission.artifacts.find((artifact) => artifact.artifactName === 'mission_meta.json')

  const rail = (
    <Panel>
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Delivery</p>
      <h2 className="mt-3 font-display text-2xl font-semibold text-chrome-950">
        {deliveryHeadline(mission.delivery.state)}
      </h2>
      <p className="mt-2 text-sm text-chrome-700">{deliveryMessage(mission.delivery.state, mission.delivery.failureReason)}</p>
      <div className="mt-4">
        <DataList
          rows={[
            { label: '交付狀態', value: <StatusBadge status={mission.delivery.state} /> },
            {
              label: '發布時間',
              value: mission.delivery.publishedAt ? formatDateTime(mission.delivery.publishedAt) : '尚未發布',
            },
            { label: '成果檔數量', value: mission.artifacts.length },
            { label: '失敗原因', value: mission.delivery.failureReason ?? '—' },
          ]}
        />
      </div>
      <div className="mt-4 space-y-3">
        {[missionKmz, missionMeta].filter(Boolean).map((artifact) => (
          <a
            key={artifact!.artifactName}
            className="block rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4 transition hover:border-ember-300"
            href={absoluteArtifactUrl(artifact!.downloadUrl)}
            target="_blank"
            rel="noreferrer"
          >
            <div className="flex items-center justify-between gap-4">
              <p className="font-medium text-chrome-950">{artifact!.artifactName}</p>
              <span className="text-xs text-chrome-500">下載</span>
            </div>
            <p className="mt-2 text-xs text-chrome-600">
              版本 {artifact!.version} · {formatBytes(artifact!.sizeBytes)} · {artifact!.contentType}
            </p>
            <p className="mt-1 text-xs text-chrome-600">發布於 {formatDateTime(artifact!.publishedAt)}</p>
            <p className="mt-1 break-all text-xs text-chrome-600">sha256 {artifact!.checksumSha256}</p>
          </a>
        ))}

        {!missionKmz ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
            目前還沒有 mission.kmz，請先確認任務是否已經完成發布。
          </div>
        ) : null}
      </div>
    </Panel>
  )

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="Mission detail"
        title={mission.missionName}
        subtitle="查看任務基本資料、交付狀態、下載檔案與規劃輸入輸出。"
        action={<StatusBadge status={mission.status} />}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Panel>
            <DataList
              rows={[
                { label: '任務 ID', value: mission.missionId },
                { label: '組織', value: mission.organizationId ?? '未指定' },
                { label: '場址', value: mission.siteId ?? '未指定' },
                { label: '任務狀態', value: <StatusBadge status={mission.status} /> },
                { label: 'Bundle', value: mission.bundleVersion },
                { label: '建立時間', value: formatDateTime(mission.createdAt) },
              ]}
            />
          </Panel>

          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Request</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">任務請求內容</h2>
            <pre className="mt-4 overflow-x-auto rounded-2xl bg-chrome-950 p-4 text-xs text-chrome-50">
              {JSON.stringify(mission.request, null, 2)}
            </pre>
          </Panel>

          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Response</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">系統回應摘要</h2>
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
