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
        eyebrow="內部稽核"
        title="稽核記錄"
        subtitle="在發佈檢查前追蹤驗證事件、支援存取、邀請發送與帳務異動。"
      />

      <Panel>
        <div className="grid gap-4 md:grid-cols-[16rem_minmax(0,1fr)] md:items-center">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">組織篩選</p>
            <p className="mt-1 text-sm text-chrome-700">留空即可查看全部組織。</p>
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
          <p className="text-sm text-chrome-700">正在載入稽核記錄…</p>
        </Panel>
      ) : null}

      {!auditQuery.isLoading && events.length === 0 ? (
        <EmptyState
          title="尚無稽核事件"
          body="當使用者登入、營運人員跨組織存取或帳單資料異動後，紀錄就會出現在這裡。"
        />
      ) : null}

      <div className="grid gap-4">
        {events.map((event) => (
          <Panel key={event.auditEventId}>
            <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ember-500">{formatAuditAction(event.action)}</p>
                <h2 className="mt-2 break-words font-display text-2xl font-semibold text-chrome-950">
                  {formatAuditTargetType(event.targetType)} {event.targetId ?? ''}
                </h2>
                <p className="mt-2 text-sm text-chrome-700">
                  {event.organizationId ?? '全域'} · {formatDate(event.createdAt)}
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
