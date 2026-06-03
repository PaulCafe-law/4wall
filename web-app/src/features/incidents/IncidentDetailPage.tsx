import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, useParams } from 'react-router-dom'

import {
  ActionButton,
  DataList,
  Field,
  Input,
  Metric,
  Panel,
  Select,
  ShellSection,
  TextArea,
  formatDateTime,
} from '../../components/ui'
import { ApiError, api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAuthedMutation, useAuthedQuery } from '../../lib/auth-query'
import type { IncidentSeverity, IncidentStatus } from '../../lib/types'
import { incidentSiteMapLink } from '../site-map/site-map-config'
import {
  INCIDENT_SEVERITY_OPTIONS,
  formatIncidentDisplayText,
  formatIncidentEvidenceType,
  formatIncidentHistoryAction,
  formatIncidentHistoryValue,
  formatIncidentLineNotificationAction,
  formatIncidentLineNotificationMessage,
  formatIncidentLineNotificationStatus,
  formatIncidentSeverity,
  formatIncidentSource,
  formatIncidentStatus,
  incidentLocationLabel,
  incidentSeverityBadgeClass,
  incidentStatusBadgeClass,
  nextStatusActions,
} from './incident-labels'

function badgeClass(className: string) {
  return `inline-flex rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] ${className}`
}

export function IncidentDetailPage() {
  const { incidentId } = useParams()
  const auth = useAuth()
  const queryClient = useQueryClient()
  const [assigneeName, setAssigneeName] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [evidenceText, setEvidenceText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const incidentQuery = useAuthedQuery({
    queryKey: ['incidents', incidentId],
    queryFn: (token) => api.getIncident(token, incidentId ?? ''),
    enabled: Boolean(incidentId),
    staleTime: 10_000,
  })

  const incident = incidentQuery.data
  const canWrite = incident ? auth.canWriteOrganization(incident.organizationId) : false
  const actions = useMemo(() => (incident ? nextStatusActions(incident.status) : []), [incident])

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['incidents'] }),
      queryClient.invalidateQueries({ queryKey: ['incidents', incidentId] }),
    ])
  }

  const statusMutation = useAuthedMutation({
    mutationKey: ['incidents', incidentId, 'status'],
    mutationFn: ({ token, payload }: { token: string; payload: IncidentStatus }) =>
      api.updateIncidentStatus(token, incidentId ?? '', payload),
    onSuccess: invalidate,
    onError: handleMutationError,
  })
  const reopenMutation = useAuthedMutation({
    mutationKey: ['incidents', incidentId, 'reopen'],
    mutationFn: ({ token }: { token: string; payload: void }) => api.reopenIncident(token, incidentId ?? ''),
    onSuccess: invalidate,
    onError: handleMutationError,
  })
  const severityMutation = useAuthedMutation({
    mutationKey: ['incidents', incidentId, 'severity'],
    mutationFn: ({ token, payload }: { token: string; payload: IncidentSeverity }) =>
      api.updateIncidentSeverity(token, incidentId ?? '', payload),
    onSuccess: invalidate,
    onError: handleMutationError,
  })
  const assignMutation = useAuthedMutation({
    mutationKey: ['incidents', incidentId, 'assignee'],
    mutationFn: ({ token, payload }: { token: string; payload: string | null }) =>
      api.assignIncident(token, incidentId ?? '', payload),
    onSuccess: async () => {
      setAssigneeName(null)
      await invalidate()
    },
    onError: handleMutationError,
  })
  const commentMutation = useAuthedMutation({
    mutationKey: ['incidents', incidentId, 'comment'],
    mutationFn: ({ token, payload }: { token: string; payload: string }) =>
      api.addIncidentComment(token, incidentId ?? '', payload),
    onSuccess: async () => {
      setComment('')
      await invalidate()
    },
    onError: handleMutationError,
  })
  const evidenceMutation = useAuthedMutation({
    mutationKey: ['incidents', incidentId, 'evidence'],
    mutationFn: ({ token, payload }: { token: string; payload: { url?: string; text?: string } }) =>
      api.addIncidentEvidence(token, incidentId ?? '', {
        type: payload.url ? 'link' : 'text',
        url: payload.url,
        text: payload.text,
      }),
    onSuccess: async () => {
      setEvidenceUrl('')
      setEvidenceText('')
      await invalidate()
    },
    onError: handleMutationError,
  })

  function handleMutationError(mutationError: unknown) {
    setError(mutationError instanceof ApiError ? mutationError.detail : '操作失敗')
  }

  if (!incidentId) return <Navigate to="/incidents" replace />

  if (incidentQuery.isLoading) {
    return <Panel><p className="text-sm text-chrome-700">載入事件詳情中...</p></Panel>
  }

  if (!incident) {
    return (
      <Panel>
        <p className="text-sm text-chrome-700">找不到這筆異常事件。</p>
        <Link className="mt-4 inline-flex rounded-full bg-chrome-950 px-4 py-2 text-sm text-white" to="/incidents">
          返回列表
        </Link>
      </Panel>
    )
  }

  const siteMapLink = incidentSiteMapLink(incident)
  const displayTitle = formatIncidentDisplayText(incident.title, '現場異常事件')
  const displayDescription = formatIncidentDisplayText(
    incident.description || incident.aiSummary,
    '此事件已建立，等待現場人員補齊說明。',
  )
  const displayAssignee = formatIncidentDisplayText(incident.assigneeName, '尚未指派')
  const displayReporter = formatIncidentDisplayText(incident.reporterName, '未記錄')

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="Incident Detail"
        title={displayTitle}
        subtitle={displayDescription}
        action={<Link className="inline-flex rounded-full border border-chrome-300 bg-white px-4 py-2 text-sm text-chrome-950" to="/incidents">返回事件中心</Link>}
      />

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <Panel>
            <div className="flex flex-wrap gap-2">
              <span className={badgeClass(incidentStatusBadgeClass(incident.status))}>
                {formatIncidentStatus(incident.status)}
              </span>
              <span className={badgeClass(incidentSeverityBadgeClass(incident.severity))}>
                {formatIncidentSeverity(incident.severity)}
              </span>
              <span className="inline-flex rounded-full bg-chrome-100 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-chrome-700">
                {formatIncidentSource(incident.source)}
              </span>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <Metric label="負責人" value={displayAssignee} />
              <Metric label="回報人" value={displayReporter} />
              <Metric label="建立時間" value={formatDateTime(incident.createdAt)} />
              <Metric label="更新時間" value={formatDateTime(incident.updatedAt)} />
            </div>
          </Panel>

          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">位置資訊</p>
            <DataList
              rows={[
                { label: '位置', value: formatIncidentDisplayText(incidentLocationLabel(incident), '未指定位置') },
                { label: '場域', value: formatIncidentDisplayText(incident.location.siteName || incident.siteId, '未指定') },
                { label: '區域', value: formatIncidentDisplayText(incident.location.areaName, '未指定') },
                { label: '樓層', value: formatIncidentDisplayText(incident.location.floor, '未指定') },
                { label: '設備', value: formatIncidentDisplayText(incident.location.equipmentName, '未指定') },
                {
                  label: '場域錨點',
                  value: formatIncidentDisplayText(
                    incident.location.anchorId || incident.location.revitElementId || incident.location.ifcGuid,
                    '尚未綁定',
                  ),
                },
                { label: '3D 物件', value: formatIncidentDisplayText(incident.location.modelObjectId, '尚未綁定') },
              ]}
            />
            <Link
              className="mt-4 inline-flex rounded-full border border-chrome-300 bg-white px-4 py-2 text-sm font-medium text-chrome-950 transition hover:border-chrome-500"
              to={siteMapLink}
            >
              在 3D 場域中查看
            </Link>
          </Panel>

          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">AI 摘要</p>
            <p className="mt-3 text-sm leading-6 text-chrome-700">
              {formatIncidentDisplayText(incident.aiSummary, '尚未提供 AI 摘要。')}
            </p>
            <p className="mt-2 text-xs text-chrome-500">
              信心分數：{incident.aiConfidence === null ? '未提供' : `${Math.round(incident.aiConfidence * 100)}%`}
            </p>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">處理動作</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {actions.map((action) => (
                <ActionButton
                  key={action.label}
                  disabled={!canWrite || statusMutation.isPending || reopenMutation.isPending}
                  onClick={() => action.reopen ? reopenMutation.mutate() : statusMutation.mutate(action.status!)}
                >
                  {action.label}
                </ActionButton>
              ))}
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="嚴重程度">
                <Select
                  value={incident.severity}
                  disabled={!canWrite || severityMutation.isPending}
                  onChange={(event) => severityMutation.mutate(event.target.value as IncidentSeverity)}
                >
                  {INCIDENT_SEVERITY_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="指派負責人">
                <div className="flex gap-2">
                  <Input
                    value={assigneeName ?? incident.assigneeName ?? ''}
                    disabled={!canWrite}
                    onChange={(event) => setAssigneeName(event.target.value)}
                  />
                  <ActionButton
                    variant="secondary"
                    disabled={!canWrite || assignMutation.isPending}
                    onClick={() => {
                      const nextAssignee = (assigneeName ?? incident.assigneeName ?? '').trim() || null
                      assignMutation.mutate(nextAssignee)
                    }}
                  >
                    指派
                  </ActionButton>
                </div>
              </Field>
            </div>
          </Panel>

          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">新增備註</p>
            <div className="mt-4 grid gap-3">
              <TextArea
                aria-label="新增備註"
                value={comment}
                disabled={!canWrite}
                onChange={(event) => setComment(event.target.value)}
              />
              <div className="flex justify-end">
                <ActionButton disabled={!canWrite || !comment.trim() || commentMutation.isPending} onClick={() => commentMutation.mutate(comment)}>
                  新增備註
                </ActionButton>
              </div>
            </div>
          </Panel>

          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">證據</p>
            <div className="mt-4 grid gap-3">
              {incident.evidence.length === 0 ? <p className="text-sm text-chrome-600">尚未新增證據。</p> : null}
              {incident.evidence.map((item) => (
                <div key={item.evidenceId} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-3 text-sm text-chrome-700">
                  <p className="font-medium text-chrome-950">{formatIncidentEvidenceType(item.type)}</p>
                  {item.url ? <a className="break-all text-ember-600" href={item.url} target="_blank" rel="noreferrer">{item.url}</a> : null}
                  {item.text ? (
                    <p className="mt-2 whitespace-pre-wrap">
                      {formatIncidentDisplayText(item.text, '現場證據文字待補。')}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-chrome-500">{formatDateTime(item.createdAt)}</p>
                </div>
              ))}
              <Field label="新增證據連結">
                <Input value={evidenceUrl} disabled={!canWrite} onChange={(event) => setEvidenceUrl(event.target.value)} placeholder="https://..." />
              </Field>
              <Field label="新增證據文字">
                <TextArea value={evidenceText} disabled={!canWrite} onChange={(event) => setEvidenceText(event.target.value)} />
              </Field>
              <div className="flex justify-end">
                <ActionButton
                  disabled={!canWrite || evidenceMutation.isPending || (!evidenceUrl.trim() && !evidenceText.trim())}
                  onClick={() => evidenceMutation.mutate({ url: evidenceUrl.trim() || undefined, text: evidenceText.trim() || undefined })}
                >
                  新增證據
                </ActionButton>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">處理紀錄</p>
          <div className="mt-4 space-y-3">
            {incident.history.map((item) => (
              <div key={item.historyId} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-3">
                <p className="text-sm font-medium text-chrome-950">{formatIncidentHistoryAction(item.action)}</p>
                <p className="mt-1 text-sm text-chrome-700">
                  {formatIncidentHistoryValue(item.fromValue)} → {formatIncidentHistoryValue(item.toValue)}
                </p>
                <p className="mt-1 text-xs text-chrome-500">{item.actorName} / {formatDateTime(item.createdAt)}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">LINE 推播紀錄</p>
          <div className="mt-4 space-y-3">
            {incident.lineNotifications.length === 0 ? <p className="text-sm text-chrome-600">尚未產生 LINE 推播。</p> : null}
            {incident.lineNotifications.map((item) => (
              <div key={item.notificationId} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-chrome-950">{formatIncidentLineNotificationAction(item.action)}</p>
                  <span className="rounded-full bg-chrome-100 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-chrome-700">
                    {formatIncidentLineNotificationStatus(item.status)}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-chrome-700">
                  {formatIncidentLineNotificationMessage(item.message, incident)}
                </p>
                {item.errorMessage ? <p className="mt-2 text-xs text-red-700">{item.errorMessage}</p> : null}
                <p className="mt-2 text-xs text-chrome-500">{formatDateTime(item.createdAt)}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">備註紀錄</p>
        <div className="mt-4 space-y-3">
          {incident.comments.length === 0 ? <p className="text-sm text-chrome-600">尚未新增備註。</p> : null}
          {incident.comments.map((item) => (
            <div key={item.commentId} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-3">
              <p className="whitespace-pre-wrap text-sm text-chrome-800">
                {formatIncidentDisplayText(item.content, '處理備註文字待補。')}
              </p>
              <p className="mt-2 text-xs text-chrome-500">{item.authorName} / {formatDateTime(item.createdAt)}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}
