import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { ActionButton, EmptyState, Field, Input, Metric, Panel, Select, ShellSection, formatDateTime } from '../../components/ui'
import { ApiError, api, type IncidentFilters, type IncidentPayload } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAuthedMutation, useAuthedQuery } from '../../lib/auth-query'
import type { IncidentSeverity, IncidentSource, IncidentStatus } from '../../lib/types'
import { IncidentCreateModal, type IncidentOrganizationOption } from './IncidentCreateModal'
import {
  INCIDENT_SEVERITY_OPTIONS,
  INCIDENT_SOURCE_OPTIONS,
  INCIDENT_STATUS_OPTIONS,
  formatIncidentSeverity,
  formatIncidentSource,
  formatIncidentStatus,
  incidentLocationLabel,
  incidentSeverityBadgeClass,
  incidentStatusBadgeClass,
} from './incident-labels'

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function badgeClass(className: string) {
  return `inline-flex rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] ${className}`
}

export function IncidentCenterPage() {
  const auth = useAuth()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [severityFilter, setSeverityFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [areaName, setAreaName] = useState('')
  const [organizationFilter, setOrganizationFilter] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const today = todayIsoDate()

  const organizationsQuery = useAuthedQuery({
    queryKey: ['organizations', 'incident-center'],
    queryFn: api.listOrganizations,
    enabled: auth.isInternal,
    staleTime: 60_000,
  })

  const organizationOptions = useMemo<IncidentOrganizationOption[]>(() => {
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

  const filters: IncidentFilters = {
    organizationId: organizationFilter || undefined,
    status: (statusFilter || undefined) as IncidentStatus | undefined,
    severity: (severityFilter || undefined) as IncidentSeverity | undefined,
    source: (sourceFilter || undefined) as IncidentSource | undefined,
    areaName: areaName.trim() || undefined,
  }

  const incidentsQuery = useAuthedQuery({
    queryKey: ['incidents', filters],
    queryFn: (token) => api.listIncidents(token, filters),
    staleTime: 10_000,
  })
  const summaryQuery = useAuthedQuery({
    queryKey: ['incidents', 'summary', today, organizationFilter],
    queryFn: (token) => api.getIncidentSummary(token, today, organizationFilter || undefined),
    staleTime: 10_000,
  })

  const createIncident = useAuthedMutation({
    mutationKey: ['incidents', 'create'],
    mutationFn: ({ token, payload }: { token: string; payload: IncidentPayload }) =>
      api.createIncident(token, payload),
    onSuccess: async (incident) => {
      setCreateOpen(false)
      setCreateError(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['incidents'] }),
        queryClient.invalidateQueries({ queryKey: ['incidents', incident.incidentId] }),
      ])
    },
    onError: (error) => {
      setCreateError(error instanceof ApiError ? error.detail : '建立事件失敗')
    },
  })

  const incidents = incidentsQuery.data ?? []
  const pendingCount = incidents.filter((incident) => incident.status === 'pending_review').length
  const inProgressCount = incidents.filter((incident) => incident.status === 'in_progress').length
  const criticalCount = incidents.filter((incident) => incident.severity === 'critical').length
  const todayCount = summaryQuery.data?.newIncidentCount ?? 0

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="Incident Center"
        title="異常事件中心"
        subtitle="把 AI 與人工回報收斂成可確認、可指派、可追蹤、可結案的現場管理流程。"
        action={
          <ActionButton onClick={() => setCreateOpen(true)}>
            建立事件
          </ActionButton>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="待確認" value={pendingCount} />
        <Metric label="處理中" value={inProgressCount} />
        <Metric label="今日新增" value={todayCount} />
        <Metric label="緊急事件" value={criticalCount} />
      </div>

      <Panel>
        <div className="grid gap-4 lg:grid-cols-5">
          <Field label="組織">
            <Select value={organizationFilter} onChange={(event) => setOrganizationFilter(event.target.value)}>
              <option value="">全部可讀組織</option>
              {organizationOptions.map((item) => (
                <option key={item.organizationId} value={item.organizationId}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="狀態">
            <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">全部狀態</option>
              {INCIDENT_STATUS_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="嚴重程度">
            <Select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}>
              <option value="">全部程度</option>
              {INCIDENT_SEVERITY_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="來源">
            <Select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
              <option value="">全部來源</option>
              {INCIDENT_SOURCE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="場域 / 區域">
            <Input value={areaName} onChange={(event) => setAreaName(event.target.value)} placeholder="例如：A 區" />
          </Field>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">事件列表</p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">現場異常</h2>
            </div>
            <p className="text-sm text-chrome-600">{incidents.length} 件</p>
          </div>

          {incidentsQuery.isLoading ? <p className="mt-6 text-sm text-chrome-700">載入事件中...</p> : null}
          {incidentsQuery.isError ? (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              無法載入異常事件。
            </div>
          ) : null}
          {!incidentsQuery.isLoading && incidents.length === 0 ? (
            <EmptyState title="目前沒有異常事件" body="建立第一筆事件後，這裡會出現狀態、指派、LINE 推播與處理紀錄。" />
          ) : null}

          <div className="mt-5 grid gap-4">
            {incidents.map((incident) => {
              const latestNotification = incident.lineNotifications[0]
              return (
                <div key={incident.incidentId} className="rounded-2xl border border-chrome-200 bg-white/75 p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="break-words font-display text-xl font-semibold text-chrome-950">
                          {incident.title}
                        </h3>
                        <span className={badgeClass(incidentStatusBadgeClass(incident.status))}>
                          {formatIncidentStatus(incident.status)}
                        </span>
                        <span className={badgeClass(incidentSeverityBadgeClass(incident.severity))}>
                          {formatIncidentSeverity(incident.severity)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-chrome-700">{incident.description || incident.aiSummary || '尚未提供描述。'}</p>
                      <div className="mt-3 grid gap-2 text-xs text-chrome-500 md:grid-cols-2">
                        <span>位置：{incidentLocationLabel(incident)}</span>
                        <span>來源：{formatIncidentSource(incident.source)}</span>
                        <span>負責人：{incident.assigneeName || '尚未指派'}</span>
                        <span>LINE：{latestNotification ? `${latestNotification.status} / ${latestNotification.action}` : '尚未推播'}</span>
                        <span>建立：{formatDateTime(incident.createdAt)}</span>
                        <span>更新：{formatDateTime(incident.updatedAt)}</span>
                      </div>
                    </div>
                    <Link
                      to={`/incidents/${incident.incidentId}`}
                      className="inline-flex shrink-0 items-center justify-center rounded-full bg-chrome-950 px-4 py-2 text-sm font-medium text-white"
                    >
                      查看詳情
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">今日摘要</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">LINE 摘要預覽</h2>
            <pre className="mt-4 whitespace-pre-wrap rounded-2xl border border-chrome-200 bg-chrome-50 p-4 text-sm leading-6 text-chrome-800">
              {summaryQuery.data?.lineSummaryMessage ?? '載入摘要中...'}
            </pre>
          </Panel>

          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">優先處理</p>
            <div className="mt-4 space-y-3">
              {(summaryQuery.data?.criticalHighIncidents ?? []).slice(0, 5).map((incident) => (
                <Link
                  key={incident.incidentId}
                  to={`/incidents/${incident.incidentId}`}
                  className="block rounded-2xl border border-chrome-200 bg-white/70 px-4 py-3 text-sm text-chrome-900"
                >
                  {incident.title}
                </Link>
              ))}
              {summaryQuery.data?.criticalHighIncidents.length === 0 ? (
                <p className="text-sm text-chrome-600">目前沒有緊急或高風險事件。</p>
              ) : null}
            </div>
          </Panel>
        </div>
      </div>

      {createError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {createError}
        </div>
      ) : null}
      <IncidentCreateModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        organizations={organizationOptions}
        isSubmitting={createIncident.isPending}
        onSubmit={(payload) => createIncident.mutate(payload)}
      />
    </div>
  )
}
