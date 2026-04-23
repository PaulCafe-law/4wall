import { Link } from 'react-router-dom'

import { EmptyState, Metric, Panel, ShellSection, formatDate } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuthedQuery } from '../../lib/auth-query'
import { formatOperatingProfile, formatSupportSeverity } from '../../lib/presentation'

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
        eyebrow="Support"
        title="Support Queue"
        subtitle="Internal support surface for mission failures, bridge alerts, low battery, telemetry stale conditions, and landing fallbacks."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Queue Items" value={items.length} />
        <Metric label="Critical" value={criticalCount} hint="Needs immediate operator or platform action" />
        <Metric label="Warning" value={warningCount} hint="Needs review but not immediate takeover" />
      </div>

      {supportQuery.isLoading ? (
        <Panel>
          <p className="text-sm text-chrome-700">Loading support queue…</p>
        </Panel>
      ) : null}

      {!supportQuery.isLoading && items.length === 0 ? (
        <EmptyState
          title="No support items"
          body="Mission failures, bridge alerts, telemetry stale events, and landing fallbacks will appear here when Android or planner-server surfaces them."
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
                  <span>Organization: {item.organizationId}</span>
                  {item.missionId ? <span>Mission: {item.missionId}</span> : null}
                  {item.flightId ? <span>Flight: {item.flightId}</span> : null}
                  {item.operatingProfile ? (
                    <span>Profile: {formatOperatingProfile(item.operatingProfile)}</span>
                  ) : null}
                  <span>Created: {formatDate(item.createdAt)}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                {item.flightId ? (
                  <Link
                    to="/live-ops"
                    className="inline-flex rounded-full border border-chrome-300 bg-white px-4 py-2 text-sm text-chrome-950"
                  >
                    Open Live Ops
                  </Link>
                ) : null}
                {item.missionId ? (
                  <Link
                    to={`/missions/${item.missionId}`}
                    className="inline-flex rounded-full bg-chrome-950 px-4 py-2 text-sm text-white"
                  >
                    Open Mission
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
