import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { ActionButton, EmptyState, Metric, Panel, ShellSection, formatDateTime } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuthedQuery } from '../../lib/auth-query'
import { formatSupportCategory, formatSupportSeverity } from '../../lib/presentation'
import type { SupportCategory, SupportQueueItem, SupportSeverity } from '../../lib/types'

const EMPTY_SUPPORT_ITEMS: SupportQueueItem[] = []

const severityOrder: Record<SupportSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

const categoryOptions: Array<{ value: 'all' | SupportCategory; label: string }> = [
  { value: 'all', label: '全部類型' },
  { value: 'mission_failed', label: '任務失敗' },
  { value: 'telemetry_stale', label: '遙測過時' },
  { value: 'bridge_alert', label: 'Bridge 告警' },
  { value: 'battery_low', label: '低電量' },
]

const severityOptions: Array<{ value: 'all' | SupportSeverity; label: string }> = [
  { value: 'all', label: '全部等級' },
  { value: 'critical', label: '高風險' },
  { value: 'warning', label: '提醒' },
  { value: 'info', label: '資訊' },
]

function severityBadgeClass(severity: SupportSeverity) {
  if (severity === 'critical') {
    return 'rounded-full bg-red-100 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-red-700'
  }
  if (severity === 'warning') {
    return 'rounded-full bg-amber-100 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-amber-800'
  }
  return 'rounded-full bg-chrome-100 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-chrome-700'
}

function categoryCount(items: SupportQueueItem[], category: SupportCategory) {
  return items.filter((item) => item.category === category).length
}

function byPriority(items: SupportQueueItem[]) {
  return [...items].sort((left, right) => {
    if (severityOrder[left.severity] !== severityOrder[right.severity]) {
      return severityOrder[left.severity] - severityOrder[right.severity]
    }
    const leftTimestamp = left.lastObservedAt ?? left.createdAt
    const rightTimestamp = right.lastObservedAt ?? right.createdAt
    return rightTimestamp.localeCompare(leftTimestamp)
  })
}

export function SupportPage() {
  const supportQuery = useAuthedQuery({
    queryKey: ['support', 'queue'],
    queryFn: api.listSupportQueue,
    staleTime: 10_000,
    refetchInterval: 15_000,
  })
  const [severityFilter, setSeverityFilter] = useState<'all' | SupportSeverity>('all')
  const [categoryFilter, setCategoryFilter] = useState<'all' | SupportCategory>('all')

  const items = supportQuery.data ?? EMPTY_SUPPORT_ITEMS
  const filteredItems = useMemo(() => {
    const filtered = items.filter((item) => {
      if (severityFilter !== 'all' && item.severity !== severityFilter) {
        return false
      }
      if (categoryFilter !== 'all' && item.category !== categoryFilter) {
        return false
      }
      return true
    })
    return byPriority(filtered)
  }, [categoryFilter, items, severityFilter])

  const criticalCount = items.filter((item) => item.severity === 'critical').length
  const warningCount = items.filter((item) => item.severity === 'warning').length

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="Internal Support"
        title="支援佇列"
        subtitle="這裡是內部營運的 triage 工作台。先看風險等級，再看 mission / org / site context，最後決定要打開任務明細還是 Live Ops。"
      />

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="待處理總數" value={items.length} />
        <Metric label="高風險" value={criticalCount} hint="優先處理立即影響交付或現場狀態的項目。" />
        <Metric label="提醒" value={warningCount} hint="需要跟進，但不一定要立刻中斷現場。" />
        <Metric label="任務失敗" value={categoryCount(items, 'mission_failed')} />
        <Metric label="遙測過時" value={categoryCount(items, 'telemetry_stale')} />
        <Metric label="Bridge 告警" value={categoryCount(items, 'bridge_alert')} />
      </div>

      <Panel>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Filters</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">先縮小到今天要處理的範圍</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {severityOptions.map((option) => (
              <ActionButton
                key={option.value}
                type="button"
                variant={severityFilter === option.value ? 'primary' : 'secondary'}
                onClick={() => setSeverityFilter(option.value)}
              >
                {option.label}
              </ActionButton>
            ))}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {categoryOptions.map((option) => (
            <ActionButton
              key={option.value}
              type="button"
              variant={categoryFilter === option.value ? 'primary' : 'ghost'}
              onClick={() => setCategoryFilter(option.value)}
            >
              {option.label}
            </ActionButton>
          ))}
        </div>
      </Panel>

      {supportQuery.isLoading ? (
        <Panel>
          <p className="text-sm text-chrome-700">正在載入支援佇列。</p>
        </Panel>
      ) : null}

      {!supportQuery.isLoading && items.length === 0 ? (
        <EmptyState
          title="目前沒有待處理支援項目"
          body="沒有 mission 失敗、bridge 告警、低電量或遙測過時的項目。"
        />
      ) : null}

      {!supportQuery.isLoading && items.length > 0 && filteredItems.length === 0 ? (
        <EmptyState
          title="目前篩選條件下沒有項目"
          body="可以放寬等級或類型，重新查看全部支援佇列。"
        />
      ) : null}

      <div className="grid gap-4">
        {filteredItems.map((item) => (
          <Panel key={item.itemId}>
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="break-words font-display text-2xl font-semibold text-chrome-950">{item.title}</h2>
                  <span className="rounded-full bg-chrome-100 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-chrome-700">
                    {formatSupportCategory(item.category)}
                  </span>
                  <span className={severityBadgeClass(item.severity)}>{formatSupportSeverity(item.severity)}</span>
                </div>

                <p className="mt-2 text-sm text-chrome-700">{item.summary}</p>

                <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="rounded-2xl border border-chrome-200 bg-chrome-50/80 px-4 py-4">
                    <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Context</p>
                    <div className="mt-3 space-y-2 text-sm text-chrome-700">
                      <p>組織：{item.organizationName ?? item.organizationId}</p>
                      {item.missionId ? <p>任務：{item.missionName ?? item.missionId}</p> : null}
                      {item.siteName ? <p>場址：{item.siteName}</p> : null}
                      {item.flightId ? <p>飛行：{item.flightId}</p> : null}
                      <p>建立時間：{formatDateTime(item.createdAt)}</p>
                      {item.lastObservedAt ? <p>最近觀測：{formatDateTime(item.lastObservedAt)}</p> : null}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-ember-200 bg-ember-50/70 px-4 py-4">
                    <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ember-500">Next Step</p>
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
                    打開 Live Ops
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
