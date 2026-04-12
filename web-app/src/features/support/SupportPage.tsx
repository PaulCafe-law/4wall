import { Link } from 'react-router-dom'

import { EmptyState, Metric, Panel, ShellSection, StatusBadge, formatCurrency, formatDate } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuthedQuery } from '../../lib/auth-query'

export function SupportPage() {
  const missionsQuery = useAuthedQuery({
    queryKey: ['missions'],
    queryFn: api.listMissions,
    staleTime: 15_000,
  })

  const invoicesQuery = useAuthedQuery({
    queryKey: ['billing', 'invoices'],
    queryFn: api.listInvoices,
    staleTime: 15_000,
  })

  const organizationsQuery = useAuthedQuery({
    queryKey: ['organizations'],
    queryFn: api.listOrganizations,
    staleTime: 30_000,
  })

  const organizations = organizationsQuery.data ?? []
  const organizationNames = new Map(organizations.map((organization) => [organization.organizationId, organization.name]))

  const missions = missionsQuery.data ?? []
  const invoices = invoicesQuery.data ?? []

  const failedMissions = missions.filter((mission) => mission.status === 'failed')
  const planningMissions = missions.filter((mission) => mission.status === 'planning')
  const overdueInvoices = invoices.filter((invoice) => invoice.status === 'overdue')

  const isLoading = missionsQuery.isLoading || invoicesQuery.isLoading || organizationsQuery.isLoading

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="內部支援"
        title="支援佇列"
        subtitle="集中查看需要跟進的任務與帳務例外，讓跨客戶支援有固定入口，不必只靠稽核記錄排查。"
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="失敗任務" value={failedMissions.length} hint="優先確認成果是否可交付，或是否需要重新送單。" />
        <Metric label="規劃中任務" value={planningMissions.length} hint="需要跟進是否長時間停留在規劃中。" />
        <Metric label="逾期帳單" value={overdueInvoices.length} hint="可回到帳務頁面查看付款說明與備註。" />
      </div>

      {isLoading ? (
        <Panel>
          <p className="text-sm text-chrome-700">正在整理支援佇列…</p>
        </Panel>
      ) : null}

      {!isLoading && failedMissions.length === 0 && planningMissions.length === 0 && overdueInvoices.length === 0 ? (
        <EmptyState
          title="目前沒有需要支援的工作"
          body="任務與帳務目前看起來都在正常軌道上。若需要追溯操作紀錄，可前往稽核記錄。"
        />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">任務支援</p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">需要跟進的任務</h2>
            </div>
            <Link to="/missions" className="text-sm text-ember-500 underline">
              查看全部任務
            </Link>
          </div>
          <div className="mt-4 grid gap-3">
            {[...failedMissions, ...planningMissions]
              .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
              .slice(0, 8)
              .map((mission) => (
                <Link
                  key={mission.missionId}
                  to={`/missions/${mission.missionId}`}
                  className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4 transition hover:border-chrome-400"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="font-medium text-chrome-950">{mission.missionName}</p>
                    <StatusBadge status={mission.status} />
                  </div>
                  <p className="mt-2 text-sm text-chrome-700">
                    {organizationNames.get(mission.organizationId ?? '') ?? mission.organizationId ?? '未指定組織'} · 建立於{' '}
                    {formatDate(mission.createdAt)}
                  </p>
                </Link>
              ))}
            {failedMissions.length === 0 && planningMissions.length === 0 ? (
              <p className="text-sm text-chrome-700">目前沒有需要支援的任務。</p>
            ) : null}
          </div>
        </Panel>

        <Panel>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">帳務支援</p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">需要跟進的帳單</h2>
            </div>
            <Link to="/billing" className="text-sm text-ember-500 underline">
              前往帳務
            </Link>
          </div>
          <div className="mt-4 grid gap-3">
            {overdueInvoices.slice(0, 8).map((invoice) => (
              <Link
                key={invoice.invoiceId}
                to="/billing"
                className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4 transition hover:border-chrome-400"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <p className="font-medium text-chrome-950">{invoice.invoiceNumber}</p>
                  <StatusBadge status={invoice.status} />
                </div>
                <p className="mt-2 text-sm text-chrome-700">
                  {organizationNames.get(invoice.organizationId) ?? invoice.organizationId} · 到期日 {formatDate(invoice.dueDate)} ·{' '}
                  {formatCurrency(invoice.currency, invoice.total)}
                </p>
              </Link>
            ))}
            {overdueInvoices.length === 0 ? (
              <p className="text-sm text-chrome-700">目前沒有逾期帳單。</p>
            ) : null}
          </div>
        </Panel>
      </div>
    </div>
  )
}
