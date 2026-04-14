import { Link } from 'react-router-dom'

import { EmptyState, Metric, Panel, ShellSection, formatDate } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuthedQuery } from '../../lib/auth-query'
import { formatSupportCategory, formatSupportSeverity } from '../../lib/presentation'

export function SupportPage() {
  const supportQuery = useAuthedQuery({
    queryKey: ['support', 'queue'],
    queryFn: api.listSupportQueue,
    staleTime: 10_000,
    refetchInterval: 15_000,
  })

  const items = supportQuery.data ?? []
  const criticalCount = items.filter((item) => item.severity === 'critical').length
  const warningCount = items.filter((item) => item.severity === 'warning').length

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="內部支援"
        title="支援佇列"
        subtitle="集中查看失敗任務、bridge 告警與需要人工介入的現場狀態。這一頁只給內部營運與管理員使用。"
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="待處理項目" value={items.length} />
        <Metric label="嚴重" value={criticalCount} hint="需要優先處理的項目。" />
        <Metric label="警示" value={warningCount} hint="可持續追蹤，但尚未進入最高優先級。" />
      </div>

      {supportQuery.isLoading ? (
        <Panel>
          <p className="text-sm text-chrome-700">正在讀取支援佇列。</p>
        </Panel>
      ) : null}

      {!supportQuery.isLoading && items.length === 0 ? (
        <EmptyState
          title="目前沒有待處理項目"
          body="failed mission、bridge 告警與遙測中斷會集中出現在這裡。"
        />
      ) : null}

      <div className="grid gap-4">
        {items.map((item) => (
          <Panel key={item.itemId}>
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="break-words font-display text-2xl font-semibold text-chrome-950">
                    {item.title}
                  </h2>
                  <span className="rounded-full bg-chrome-100 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-chrome-700">
                    {formatSupportCategory(item.category)}
                  </span>
                  <span
                    className={
                      item.severity === 'critical'
                        ? 'rounded-full bg-red-100 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-red-700'
                        : item.severity === 'warning'
                          ? 'rounded-full bg-amber-100 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-amber-800'
                          : 'rounded-full bg-chrome-100 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-chrome-700'
                    }
                  >
                    {formatSupportSeverity(item.severity)}
                  </span>
                </div>
                <p className="mt-2 text-sm text-chrome-700">{item.summary}</p>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-chrome-200 bg-chrome-50/80 px-4 py-4">
                    <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">事件 context</p>
                    <div className="mt-3 space-y-2 text-sm text-chrome-700">
                      <p>
                        組織：{item.organizationName ?? '未命名組織'}
                        <span className="ml-2 text-xs text-chrome-500">{item.organizationId}</span>
                      </p>
                      {item.missionId ? (
                        <p>
                          任務：{item.missionName ?? item.missionId}
                          <span className="ml-2 text-xs text-chrome-500">{item.missionId}</span>
                        </p>
                      ) : null}
                      {item.siteName ? <p>場址：{item.siteName}</p> : null}
                      {item.flightId ? <p>飛行：{item.flightId}</p> : null}
                      <p>建立時間：{formatDate(item.createdAt)}</p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-ember-200 bg-ember-50/70 px-4 py-4">
                    <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ember-500">建議下一步</p>
                    <p className="mt-3 text-sm text-chrome-800">{item.recommendedNextStep}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                {item.flightId ? (
                  <Link
                    to="/live-ops"
                    className="inline-flex rounded-full border border-chrome-300 bg-white px-4 py-2 text-sm text-chrome-950"
                  >
                    前往飛行監看
                  </Link>
                ) : null}
                {item.missionId ? (
                  <Link
                    to={`/missions/${item.missionId}`}
                    className="inline-flex rounded-full bg-chrome-950 px-4 py-2 text-sm text-white"
                  >
                    查看任務
                  </Link>
                ) : null}
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  )
}
