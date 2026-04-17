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
        title="稽核紀錄"
        subtitle="集中檢視登入、邀請、組織設定、支援流程與任務相關操作，方便追蹤實際發生了哪些變更。"
      />

      <Panel>
        <div className="grid gap-4 md:grid-cols-[16rem_minmax(0,1fr)] md:items-center">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">組織篩選</p>
            <p className="mt-1 text-sm text-chrome-700">可選擇單一組織，或直接檢視全部內部可見紀錄。</p>
          </div>
          <Select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>
            <option value="">所有組織</option>
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
          <p className="text-sm text-chrome-700">正在載入稽核紀錄…</p>
        </Panel>
      ) : null}

      {!auditQuery.isLoading && events.length === 0 ? (
        <EmptyState
          title="目前沒有稽核紀錄"
          body="系統會在登入、邀請、支援流程與任務相關動作發生後，自動寫入稽核紀錄。"
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
                  {event.organizationId ?? '系統'}｜{formatDate(event.createdAt)}
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
