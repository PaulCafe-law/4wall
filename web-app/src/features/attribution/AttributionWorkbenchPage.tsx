import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import {
  ActionButton,
  EmptyState,
  Field,
  Input,
  Metric,
  Panel,
  Select,
  ShellSection,
  formatDateTime,
} from '../../components/ui'
import {
  ApiError,
  api,
  type DecisionPointAttributionReason,
  type DecisionPointFilters,
} from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAuthedMutation, useAuthedQuery } from '../../lib/auth-query'
import {
  ATTRIBUTION_REASON_OPTIONS,
  DECISION_EVENT_TYPE_OPTIONS,
  consistentMark,
  decisionActualLabel,
  decisionEventTypeBadgeClass,
  formatAttributionReason,
  formatDecisionEventType,
  formatDecisionStatus,
  isDecisionPointAttributed,
} from './attribution-labels'

const EVENT_TYPE_FILTER_OPTIONS = DECISION_EVENT_TYPE_OPTIONS.filter(
  (item) => item.value !== 'anomaly_response',
)

function badgeClass(className: string) {
  return `inline-flex rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] ${className}`
}

export function AttributionWorkbenchPage() {
  const auth = useAuth()
  const queryClient = useQueryClient()
  const [mismatchOnly, setMismatchOnly] = useState(true)
  const [unattributedOnly, setUnattributedOnly] = useState(true)
  const [eventTypeFilter, setEventTypeFilter] = useState('')
  const [organizationFilter, setOrganizationFilter] = useState('')
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})
  const [attributeError, setAttributeError] = useState<string | null>(null)

  const organizationsQuery = useAuthedQuery({
    queryKey: ['organizations', 'attribution-workbench'],
    queryFn: api.listOrganizations,
    enabled: auth.isInternal,
    staleTime: 60_000,
  })

  const organizationOptions = useMemo(() => {
    if (auth.isInternal) {
      return (organizationsQuery.data ?? []).map((org) => ({
        organizationId: org.organizationId,
        label: org.name,
        canWrite: true,
      }))
    }
    return (auth.user?.memberships ?? [])
      .filter((membership) => membership.organizationId)
      .map((membership) => ({
        organizationId: membership.organizationId!,
        label: membership.organizationId!,
        canWrite: auth.canWriteOrganization(membership.organizationId!),
      }))
  }, [auth, organizationsQuery.data])

  const organizationId = organizationFilter || organizationOptions[0]?.organizationId || ''

  const filters: DecisionPointFilters = {
    organizationId: organizationId || undefined,
    eventType: eventTypeFilter || undefined,
    mismatchOnly,
    unattributedOnly,
    limit: 100,
  }

  const decisionPointsQuery = useAuthedQuery({
    queryKey: ['decision-points', filters],
    queryFn: (token) => api.listDecisionPoints(token, filters),
    enabled: Boolean(organizationId),
    staleTime: 10_000,
  })
  const statsQuery = useAuthedQuery({
    queryKey: ['decision-points', 'stats', organizationId],
    queryFn: (token) => api.getDecisionPointStats(token, { organizationId, days: 14 }),
    enabled: Boolean(organizationId),
    staleTime: 10_000,
  })

  const attributePoint = useAuthedMutation({
    mutationKey: ['decision-points', 'attribute'],
    mutationFn: ({
      token,
      payload,
    }: {
      token: string
      payload: {
        decisionPointId: string
        attribution: DecisionPointAttributionReason
        note: string | null
      }
    }) =>
      api.attributeDecisionPoint(token, payload.decisionPointId, {
        attribution: payload.attribution,
        note: payload.note,
      }),
    onSuccess: async (point) => {
      setAttributeError(null)
      setNoteDrafts((drafts) => {
        const next = { ...drafts }
        delete next[point.decisionPointId]
        return next
      })
      await queryClient.invalidateQueries({ queryKey: ['decision-points'] })
    },
    onError: (error) => {
      setAttributeError(error instanceof ApiError ? error.detail : '歸因失敗')
    },
  })

  const decisionPoints = decisionPointsQuery.data?.decisionPoints ?? []
  const stats = statsQuery.data
  const mismatchedUnattributed = stats?.mismatchedUnattributed ?? 0

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="決策帳本"
        title="歸因工作台"
        subtitle="把引擎預測與現場實際的落差，一鍵歸因成可累積的領域知識。"
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Metric
          label="累積決策點"
          value={stats?.totalPoints ?? '—'}
          hint={stats ? `${stats.windowDays} 天視窗` : undefined}
        />
        <Metric
          label="一致率"
          value={
            stats
              ? stats.consistencyRate == null
                ? '實驗中'
                : `${Math.round(stats.consistencyRate * 100)}%`
              : '—'
          }
        />
        <Metric label="已歸因" value={stats?.attributedPoints ?? '—'} />
        <div
          className={`min-w-0 rounded-2xl border p-4 ${
            mismatchedUnattributed > 0
              ? 'border-amber-300 bg-amber-50/80'
              : 'border-chrome-200 bg-chrome-50/80'
          }`}
        >
          <p
            className={`font-mono text-[11px] uppercase tracking-[0.22em] ${
              mismatchedUnattributed > 0 ? 'text-amber-700' : 'text-chrome-500'
            }`}
          >
            待歸因不一致
          </p>
          <p
            className={`mt-3 break-words font-display text-2xl font-semibold leading-tight tracking-[-0.035em] sm:text-3xl ${
              mismatchedUnattributed > 0 ? 'text-amber-700' : 'text-chrome-950'
            }`}
          >
            {stats?.mismatchedUnattributed ?? '—'}
          </p>
        </div>
      </div>

      <Panel>
        <div className="grid gap-4 lg:grid-cols-4">
          <Field label="組織">
            <Select
              value={organizationId}
              onChange={(event) => setOrganizationFilter(event.target.value)}
            >
              {organizationOptions.length === 0 ? <option value="">尚無可讀組織</option> : null}
              {organizationOptions.map((item) => (
                <option key={item.organizationId} value={item.organizationId}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="只看不一致">
            <Select
              value={mismatchOnly ? 'on' : 'off'}
              onChange={(event) => setMismatchOnly(event.target.value === 'on')}
            >
              <option value="on">開啟</option>
              <option value="off">關閉</option>
            </Select>
          </Field>
          <Field label="只看未歸因">
            <Select
              value={unattributedOnly ? 'on' : 'off'}
              onChange={(event) => setUnattributedOnly(event.target.value === 'on')}
            >
              <option value="on">開啟</option>
              <option value="off">關閉</option>
            </Select>
          </Field>
          <Field label="事件類型">
            <Select value={eventTypeFilter} onChange={(event) => setEventTypeFilter(event.target.value)}>
              <option value="">全部類型</option>
              {EVENT_TYPE_FILTER_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Panel>

      <Panel>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">案例佇列</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">待歸因決策點</h2>
          </div>
          <p className="text-sm text-chrome-600">{decisionPoints.length} 件</p>
        </div>

        {decisionPointsQuery.isLoading ? (
          <p className="mt-6 text-sm text-chrome-700">載入決策點中...</p>
        ) : null}
        {decisionPointsQuery.isError ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            無法載入決策點。
          </div>
        ) : null}
        {!decisionPointsQuery.isLoading && !decisionPointsQuery.isError && decisionPoints.length === 0 ? (
          <EmptyState
            title="目前沒有符合條件的決策點"
            body="調整篩選條件，或等引擎與現場對帳後再回來歸因。"
          />
        ) : null}

        {attributeError ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {attributeError}
          </div>
        ) : null}

        <div className="mt-5 grid gap-4">
          {decisionPoints.map((point) => {
            const candidates = point.prediction?.candidates ?? []
            const attributed = isDecisionPointAttributed(point)
            return (
              <div key={point.decisionPointId} className="rounded-2xl border border-chrome-200 bg-white/75 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="break-words font-display text-xl font-semibold text-chrome-950">
                    {point.subjectRef || point.domain}
                  </h3>
                  <span className={badgeClass(decisionEventTypeBadgeClass(point.eventType))}>
                    {formatDecisionEventType(point.eventType)}
                  </span>
                  <span className="text-base">{consistentMark(point.consistent)}</span>
                </div>
                <div className="mt-3 grid gap-2 text-xs text-chrome-500 md:grid-cols-2">
                  <span>發生時間：{formatDateTime(point.occurredAt)}</span>
                  <span>狀態：{formatDecisionStatus(point.status)}</span>
                  <span>
                    引擎預測{point.prediction?.engine ? `（${point.prediction.engine}）` : ''}：
                    {candidates.length > 0
                      ? candidates.map((candidate, index) => (
                          <span key={`${candidate.name}-${index}`} title={candidate.rationale}>
                            {index > 0 ? '、' : ''}
                            {candidate.name}
                          </span>
                        ))
                      : '無候選'}
                  </span>
                  <span>實際：{decisionActualLabel(point)}</span>
                </div>
                {candidates[0]?.rationale ? (
                  <p className="mt-2 text-xs text-chrome-500">預測理由：{candidates[0].rationale}</p>
                ) : null}

                {attributed ? (
                  <div className="mt-3 rounded-2xl border border-moss-300/60 bg-moss-300/20 px-4 py-3 text-sm text-chrome-800">
                    <p>歸因：{formatAttributionReason(point.attribution)}</p>
                    {point.attributionNote ? (
                      <p className="mt-1 text-xs text-chrome-600">備註：{point.attributionNote}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-chrome-500">
                      {point.attributedBy ? `由 ${point.attributedBy} 歸因` : '已歸因'}
                      {point.attributedAt ? `｜${formatDateTime(point.attributedAt)}` : ''}
                    </p>
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {ATTRIBUTION_REASON_OPTIONS.map((reason) => (
                        <ActionButton
                          key={reason.value}
                          variant="secondary"
                          disabled={attributePoint.isPending}
                          onClick={() =>
                            attributePoint.mutate({
                              decisionPointId: point.decisionPointId,
                              attribution: reason.value,
                              note: noteDrafts[point.decisionPointId]?.trim() || null,
                            })
                          }
                        >
                          {reason.label}
                        </ActionButton>
                      ))}
                    </div>
                    <Field label="備註（可選）">
                      <Input
                        value={noteDrafts[point.decisionPointId] ?? ''}
                        onChange={(event) =>
                          setNoteDrafts((drafts) => ({
                            ...drafts,
                            [point.decisionPointId]: event.target.value,
                          }))
                        }
                        placeholder="例如：陳大明當天支援 B 區"
                      />
                    </Field>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Panel>
    </div>
  )
}
