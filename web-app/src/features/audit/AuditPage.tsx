import { useState } from 'react'

import { EmptyState, Panel, Select, ShellSection, formatDate } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuthedQuery } from '../../lib/auth-query'
import { useOrganizationChoices } from '../../lib/organization-choices'

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
        eyebrow="Internal audit"
        title="Audit log"
        subtitle="Track auth events, support access, invite issuance, and billing mutations before release review."
      />

      <Panel>
        <div className="grid gap-4 md:grid-cols-[16rem_minmax(0,1fr)] md:items-center">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Organization filter</p>
            <p className="mt-1 text-sm text-chrome-700">Leave blank to inspect all organizations.</p>
          </div>
          <Select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>
            <option value="">All organizations</option>
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
          <p className="text-sm text-chrome-700">Loading audit log…</p>
        </Panel>
      ) : null}

      {!auditQuery.isLoading && events.length === 0 ? (
        <EmptyState
          title="No audit event"
          body="Once users log in, ops crosses org boundaries, or invoices mutate, records appear here."
        />
      ) : null}

      <div className="grid gap-4">
        {events.map((event) => (
          <Panel key={event.auditEventId}>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ember-500">{event.action}</p>
                <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">
                  {event.targetType ?? 'system'} {event.targetId ?? ''}
                </h2>
                <p className="mt-2 text-sm text-chrome-700">
                  {event.organizationId ?? 'global'} • {formatDate(event.createdAt)}
                </p>
              </div>
              <pre className="overflow-x-auto rounded-2xl bg-chrome-950 p-4 text-xs text-chrome-50">
                {JSON.stringify(event.metadata, null, 2)}
              </pre>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  )
}
