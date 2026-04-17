import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { ActionButton, EmptyState, Metric, Panel, ShellSection, formatDateTime } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuthedMutation, useAuthedQuery } from '../../lib/auth-query'
import {
  formatSupportCategory,
  formatSupportSeverity,
  formatSupportWorkflowState,
} from '../../lib/presentation'
import type {
  SupportCategory,
  SupportQueueAction,
  SupportQueueItem,
  SupportSeverity,
  SupportWorkflowState,
} from '../../lib/types'

const EMPTY_SUPPORT_ITEMS: SupportQueueItem[] = []

const severityOrder: Record<SupportSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

const workflowOrder: Record<SupportWorkflowState, number> = {
  open: 0,
  claimed: 1,
  acknowledged: 2,
  resolved: 3,
}

const categoryOptions: Array<{ value: 'all' | SupportCategory; label: string }> = [
  { value: 'all', label: '全部類別' },
  { value: 'mission_failed', label: '任務失敗' },
  { value: 'report_generation_failed', label: '報表失敗' },
  { value: 'telemetry_stale', label: '遙測延遲' },
  { value: 'bridge_alert', label: 'Bridge 告警' },
  { value: 'battery_low', label: '低電量' },
]

const severityOptions: Array<{ value: 'all' | SupportSeverity; label: string }> = [
  { value: 'all', label: '全部等級' },
  { value: 'critical', label: '嚴重' },
  { value: 'warning', label: '警告' },
  { value: 'info', label: '資訊' },
]

const workflowOptions: Array<{ value: 'all' | SupportWorkflowState; label: string }> = [
  { value: 'all', label: '全部狀態' },
  { value: 'open', label: '待處理' },
  { value: 'claimed', label: '已認領' },
  { value: 'acknowledged', label: '已確認' },
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

function workflowBadgeClass(state: SupportWorkflowState) {
  if (state === 'claimed') {
    return 'rounded-full bg-sky-100 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-sky-700'
  }
  if (state === 'acknowledged') {
    return 'rounded-full bg-moss-300/40 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-moss-700'
  }
  return 'rounded-full bg-chrome-100 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-chrome-700'
}

function categoryCount(items: SupportQueueItem[], category: SupportCategory) {
  return items.filter((item) => item.category === category).length
}

function workflowCount(items: SupportQueueItem[], workflow: SupportWorkflowState) {
  return items.filter((item) => item.workflow.state === workflow).length
}

function byPriority(items: SupportQueueItem[]) {
  return [...items].sort((left, right) => {
    if (severityOrder[left.severity] !== severityOrder[right.severity]) {
      return severityOrder[left.severity] - severityOrder[right.severity]
    }
    if (workflowOrder[left.workflow.state] !== workflowOrder[right.workflow.state]) {
      return workflowOrder[left.workflow.state] - workflowOrder[right.workflow.state]
    }
    const leftTimestamp = left.lastObservedAt ?? left.createdAt
    const rightTimestamp = right.lastObservedAt ?? right.createdAt
    return rightTimestamp.localeCompare(leftTimestamp)
  })
}

function actionLabel(action: SupportQueueAction) {
  if (action === 'claim') {
    return '認領'
  }
  if (action === 'acknowledge') {
    return '確認'
  }
  if (action === 'resolve') {
    return '結案'
  }
  return '釋出'
}

function availableActions(state: SupportWorkflowState): SupportQueueAction[] {
  if (state === 'open') {
    return ['claim', 'acknowledge', 'resolve']
  }
  if (state === 'claimed') {
    return ['acknowledge', 'resolve', 'release']
  }
  if (state === 'acknowledged') {
    return ['resolve', 'release']
  }
  return []
}

export function SupportPage() {
  const queryClient = useQueryClient()
  const supportQuery = useAuthedQuery({
    queryKey: ['support', 'queue'],
    queryFn: api.listSupportQueue,
    staleTime: 10_000,
    refetchInterval: 15_000,
  })
  const supportAction = useAuthedMutation({
    mutationKey: ['support', 'action'],
    mutationFn: ({ token, payload }: { token: string; payload: { itemId: string; action: SupportQueueAction } }) =>
      api.requestSupportQueueAction(token, payload.itemId, { action: payload.action }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['support', 'queue'] })
    },
  })

  const [severityFilter, setSeverityFilter] = useState<'all' | SupportSeverity>('all')
  const [categoryFilter, setCategoryFilter] = useState<'all' | SupportCategory>('all')
  const [workflowFilter, setWorkflowFilter] = useState<'all' | SupportWorkflowState>('all')

  const items = supportQuery.data ?? EMPTY_SUPPORT_ITEMS
  const filteredItems = useMemo(() => {
    const filtered = items.filter((item) => {
      if (severityFilter !== 'all' && item.severity !== severityFilter) {
        return false
      }
      if (categoryFilter !== 'all' && item.category !== categoryFilter) {
        return false
      }
      if (workflowFilter !== 'all' && item.workflow.state !== workflowFilter) {
        return false
      }
      return true
    })
    return byPriority(filtered)
  }, [categoryFilter, items, severityFilter, workflowFilter])

  const criticalCount = items.filter((item) => item.severity === 'critical').length
  const warningCount = items.filter((item) => item.severity === 'warning').length
  const claimedCount = workflowCount(items, 'claimed')
  const acknowledgedCount = workflowCount(items, 'acknowledged')
  const reportFailureCount = categoryCount(items, 'report_generation_failed')
  const bridgeAlertCount = categoryCount(items, 'bridge_alert')

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="內部支援"
        title="支援工作台"
        subtitle="在內部營運介面中分流任務失敗、報表阻塞、bridge 告警與遙測異常，不必離開支援工作台。"
      />

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="待處理項目" value={items.length} />
        <Metric label="嚴重事件" value={criticalCount} hint="可能阻塞 demo 路徑的最高優先問題。" />
        <Metric label="警告事件" value={warningCount} hint="仍需後續處理的營運問題。" />
        <Metric label="已認領" value={claimedCount} />
        <Metric label="已確認" value={acknowledgedCount} />
        <Metric label="報表阻塞" value={reportFailureCount + bridgeAlertCount} hint="報表失敗與 bridge 告警總和。" />
      </div>

      <Panel>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">篩選器</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">依緊急程度與工作流狀態排序</h2>
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
        <div className="mt-3 flex flex-wrap gap-2">
          {workflowOptions.map((option) => (
            <ActionButton
              key={option.value}
              type="button"
              variant={workflowFilter === option.value ? 'primary' : 'ghost'}
              onClick={() => setWorkflowFilter(option.value)}
            >
              {option.label}
            </ActionButton>
          ))}
        </div>
      </Panel>

      {supportQuery.isLoading ? (
        <Panel>
          <p className="text-sm text-chrome-700">正在載入內部支援佇列…</p>
        </Panel>
      ) : null}

      {!supportQuery.isLoading && items.length === 0 ? (
        <EmptyState
          title="目前沒有待處理的支援項目"
          body="當內部頁面偵測到任務失敗、bridge 告警、遙測飄移或報表失敗時，項目就會出現在這裡。"
        />
      ) : null}

      {!supportQuery.isLoading && items.length > 0 && filteredItems.length === 0 ? (
        <EmptyState
          title="目前沒有符合篩選條件的項目"
          body="請清除部分篩選條件，以查看佇列中的其他項目。"
        />
      ) : null}

      <div className="grid gap-4">
        {filteredItems.map((item) => {
          const isBusy = supportAction.isPending && supportAction.variables?.itemId === item.itemId
          const actions = availableActions(item.workflow.state)

          return (
            <Panel key={item.itemId}>
              <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="break-words font-display text-2xl font-semibold text-chrome-950">{item.title}</h2>
                    <span className="rounded-full bg-chrome-100 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-chrome-700">
                      {formatSupportCategory(item.category)}
                    </span>
                    <span className={severityBadgeClass(item.severity)}>{formatSupportSeverity(item.severity)}</span>
                    <span className={workflowBadgeClass(item.workflow.state)} aria-label={`support-workflow-${item.itemId}`}>
                      {formatSupportWorkflowState(item.workflow.state)}
                    </span>
                  </div>

                  <p className="mt-2 text-sm text-chrome-700">{item.summary}</p>

                  <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="rounded-2xl border border-chrome-200 bg-chrome-50/80 px-4 py-4">
                      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">事件脈絡</p>
                      <div className="mt-3 space-y-2 text-sm text-chrome-700">
                        <p>組織：{item.organizationName ?? item.organizationId}</p>
                        {item.missionId ? <p>任務：{item.missionName ?? item.missionId}</p> : null}
                        {item.siteName ? <p>場域：{item.siteName}</p> : null}
                        {item.flightId ? <p>飛行工作階段：{item.flightId}</p> : null}
                        <p>建立時間：{formatDateTime(item.createdAt)}</p>
                        {item.lastObservedAt ? <p>最近觀測：{formatDateTime(item.lastObservedAt)}</p> : null}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-ember-200 bg-ember-50/70 px-4 py-4">
                      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ember-500">處理狀態</p>
                      <div className="mt-3 space-y-2 text-sm text-chrome-800">
                        <p>{item.recommendedNextStep}</p>
                        {item.workflow.assignedToDisplayName ? <p>負責人：{item.workflow.assignedToDisplayName}</p> : null}
                        {item.workflow.updatedAt ? <p>更新時間：{formatDateTime(item.workflow.updatedAt)}</p> : null}
                        {item.workflow.note ? <p>備註：{item.workflow.note}</p> : null}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  {item.flightId ? (
                    <Link
                      to="/live-ops"
                      className="inline-flex rounded-full border border-chrome-300 bg-white px-4 py-2 text-sm text-chrome-950"
                    >
                      開啟即時營運
                    </Link>
                  ) : null}
                  {item.missionId ? (
                    <Link
                      to={`/missions/${item.missionId}`}
                      className="inline-flex rounded-full border border-chrome-300 bg-white px-4 py-2 text-sm text-chrome-950"
                    >
                      開啟任務
                    </Link>
                  ) : null}
                  {actions.map((action) => (
                    <ActionButton
                      key={action}
                      type="button"
                      variant={action === 'resolve' ? 'primary' : 'secondary'}
                      aria-label={`support-action-${action}-${item.itemId}`}
                      disabled={isBusy}
                      onClick={() => supportAction.mutate({ itemId: item.itemId, action })}
                    >
                      {isBusy ? '處理中…' : actionLabel(action)}
                    </ActionButton>
                  ))}
                </div>
              </div>
            </Panel>
          )
        })}
      </div>
    </div>
  )
}
