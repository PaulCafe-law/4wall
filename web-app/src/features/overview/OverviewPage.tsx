import { Link } from 'react-router-dom'

import { EmptyState, Metric, Panel, ShellSection, StatusBadge, formatCurrency, formatDate } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAuthedQuery } from '../../lib/auth-query'
import { useOrganizationChoices } from '../../lib/organization-choices'

function sortByNewest<T extends { createdAt: string }>(items: T[]) {
  return [...items].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export function OverviewPage() {
  const auth = useAuth()
  const { choices } = useOrganizationChoices('read')

  const sitesQuery = useAuthedQuery({
    queryKey: ['sites'],
    queryFn: api.listSites,
    staleTime: 15_000,
  })

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

  const sites = sitesQuery.data ?? []
  const missions = missionsQuery.data ?? []
  const invoices = invoicesQuery.data ?? []

  const recentMissions = sortByNewest(missions).slice(0, 4)
  const recentOutputs = sortByNewest(missions.filter((mission) => mission.status === 'ready')).slice(0, 3)
  const failedCount = missions.filter((mission) => mission.status === 'failed').length
  const planningCount = missions.filter((mission) => mission.status === 'planning').length
  const overdueInvoices = invoices.filter((invoice) => invoice.status === 'overdue')
  const pendingCount = failedCount + planningCount + overdueInvoices.length

  const isLoading = sitesQuery.isLoading || missionsQuery.isLoading || invoicesQuery.isLoading

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow={auth.isInternal ? '內部支援視角' : '客戶工作區'}
        title="總覽"
        subtitle={
          auth.isInternal
            ? '用同一個客戶主控台檢視任務、場址、帳務與待處理事項。這裡維持客戶語境，但保留跨組織支援能力。'
            : '從這裡查看今天需要處理的任務、最近交付的成果，以及需要留意的帳務狀態。'
        }
        action={
          <Link to="/missions/new" className="inline-flex rounded-full bg-chrome-950 px-4 py-2 text-sm text-white">
            新增任務請求
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="可查看場址" value={sites.length} hint="包含你目前有權限的場址。" />
        <Metric label="規劃中任務" value={planningCount} hint="仍在等待規劃完成的工作。" />
        <Metric label="已就緒成果" value={recentOutputs.length} hint="可直接進入任務詳情下載成果。" />
        <Metric
          label="待處理項目"
          value={pendingCount}
          hint={pendingCount > 0 ? '包含失敗任務、規劃中任務與逾期帳單。' : '目前沒有需要特別跟進的項目。'}
        />
      </div>

      {isLoading ? (
        <Panel>
          <p className="text-sm text-chrome-700">正在整理總覽資料…</p>
        </Panel>
      ) : null}

      {!isLoading && missions.length === 0 && sites.length === 0 && invoices.length === 0 ? (
        <EmptyState
          title="還沒有可顯示的工作資料"
          body="先建立場址或送出第一筆任務請求，之後就能在這裡追蹤進度、成果與帳務。"
          action={
            <Link to="/missions/new" className="rounded-full bg-chrome-950 px-4 py-2 text-sm text-white">
              前往新增任務請求
            </Link>
          }
        />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="space-y-6">
          <Panel>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">待處理</p>
                <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">今天需要留意的事項</h2>
              </div>
              {auth.isInternal ? (
                <Link to="/support" className="text-sm text-ember-500 underline">
                  前往支援佇列
                </Link>
              ) : null}
            </div>
            <div className="mt-4 grid gap-3">
              {pendingCount === 0 ? (
                <p className="text-sm text-chrome-700">目前沒有失敗任務、長時間規劃中任務或逾期帳單。</p>
              ) : (
                <>
                  {failedCount > 0 ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
                      目前有 {failedCount} 筆任務未成功完成，請進入任務詳情查看狀態與成果區。
                    </div>
                  ) : null}
                  {planningCount > 0 ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
                      目前有 {planningCount} 筆任務仍在規劃中。
                    </div>
                  ) : null}
                  {overdueInvoices.length > 0 ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
                      目前有 {overdueInvoices.length} 張帳單已逾期。
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </Panel>

          <Panel>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">最近任務</p>
                <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">最近的任務進度</h2>
              </div>
              <Link to="/missions" className="text-sm text-ember-500 underline">
                查看全部任務
              </Link>
            </div>
            <div className="mt-4 grid gap-3">
              {recentMissions.length === 0 ? (
                <p className="text-sm text-chrome-700">目前還沒有任務紀錄。</p>
              ) : (
                recentMissions.map((mission) => (
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
                      建立於 {formatDate(mission.createdAt)} · 成果版本 {mission.bundleVersion}
                    </p>
                  </Link>
                ))
              )}
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">最近成果</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">可交付的任務成果</h2>
            <div className="mt-4 grid gap-3">
              {recentOutputs.length === 0 ? (
                <p className="text-sm text-chrome-700">目前還沒有已就緒的任務成果。</p>
              ) : (
                recentOutputs.map((mission) => (
                  <Link
                    key={mission.missionId}
                    to={`/missions/${mission.missionId}`}
                    className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4 transition hover:border-chrome-400"
                  >
                    <p className="font-medium text-chrome-950">{mission.missionName}</p>
                    <p className="mt-2 text-sm text-chrome-700">進入任務詳情下載 `mission.kmz` 與 `mission_meta.json`。</p>
                  </Link>
                ))
              )}
            </div>
          </Panel>

          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">帳務提醒</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">最近的帳單狀態</h2>
            <div className="mt-4 grid gap-3">
              {invoices.length === 0 ? (
                <p className="text-sm text-chrome-700">目前沒有帳單資料。</p>
              ) : (
                sortByNewest(invoices.map((invoice) => ({ ...invoice, createdAt: invoice.createdAt }))).slice(0, 3).map((invoice) => (
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
                      到期日 {formatDate(invoice.dueDate)} · {formatCurrency(invoice.currency, invoice.total)}
                    </p>
                  </Link>
                ))
              )}
            </div>
          </Panel>

          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">存取範圍</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">你目前可查看的組織</h2>
            <p className="mt-3 text-sm text-chrome-700">
              {auth.isInternal
                ? `你目前以內部角色登入，可跨組織查看 ${choices.length} 個組織。`
                : `你目前可查看 ${choices.length} 個組織。`}
            </p>
          </Panel>
        </div>
      </div>
    </div>
  )
}
