import { Link } from 'react-router-dom'

import { EmptyState, Metric, Panel, ShellSection, formatDate } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuthedQuery } from '../../lib/auth-query'
import { formatSupportSeverity } from '../../lib/presentation'

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
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="break-words font-display text-2xl font-semibold text-chrome-950">
                    {item.title}
                  </h2>
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
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-chrome-500">
                  <span>組織：{item.organizationId}</span>
                  {item.missionId ? <span>任務：{item.missionId}</span> : null}
                  {item.flightId ? <span>飛行：{item.flightId}</span> : null}
                  <span>建立時間：{formatDate(item.createdAt)}</span>
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
