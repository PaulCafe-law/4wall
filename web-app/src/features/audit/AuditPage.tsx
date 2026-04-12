import { useState } from 'react'

import { EmptyState, Panel, Select, ShellSection, formatDate } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuthedQuery } from '../../lib/auth-query'
import { useOrganizationChoices } from '../../lib/organization-choices'
import { formatAuditAction, formatAuditTargetType } from '../../lib/presentation'

export function AuditPage() {
  const [organizationId, setOrganizationId] = useState('')
  const { choices } = useOrganizationChoices('read')
  const auditQuery = useAuthedQuery({
    queryKey: ['audit', organizationId],
    queryFn: (token) => api.listAuditLog(token, organizationId || undefined),
  })

  const events = auditQuery.data ?? []

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="內部支援"
        title="稽核記錄"
        subtitle="查看登入、邀請、帳務與成果相關的操作紀錄。可先選擇組織，再聚焦到單一客戶的歷史事件。"
      />

      <Panel>
        <div className="grid gap-4 md:grid-cols-[16rem_minmax(0,1fr)] md:items-center">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">組織篩選</p>
            <p className="mt-1 text-sm text-chrome-700">若不選擇組織，會顯示全部可查看的事件。</p>
          </div>
          <Select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>
            <option value="">全部組織</option>
            {choices.map((choice) => (
              <option key={choice.organizationId} value={choice.organizationId}>
                {choice.name}
              </option>
            ))}
          </Select>
        </div>
      </Panel>

      {auditQuery.isLoading ? (
        <Panel>
          <p className="text-sm text-chrome-700">正在讀取稽核記錄…</p>
        </Panel>
      ) : null}

      {!auditQuery.isLoading && events.length === 0 ? (
        <EmptyState
          title="目前沒有稽核事件"
          body="請調整組織篩選條件，或稍後再查看新的登入、邀請、任務與帳務紀錄。"
        />
      ) : null}

      <div className="grid gap-4">
        {events.map((event) => (
          <Panel key={event.auditEventId}>
            <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ember-500">
                  {formatAuditAction(event.action)}
                </p>
                <h2 className="mt-2 break-words font-display text-2xl font-semibold text-chrome-950">
                  {formatAuditTargetType(event.targetType)} {event.targetId ?? ''}
                </h2>
                <p className="mt-2 text-sm text-chrome-700">
                  {event.organizationId ?? '系統層級'} · {formatDate(event.createdAt)}
                </p>
              </div>
              <pre className="max-w-full overflow-x-auto rounded-2xl bg-chrome-950 p-4 text-xs text-chrome-50 md:max-w-lg">
                {JSON.stringify(event.metadata, null, 2)}
              </pre>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  )
}
