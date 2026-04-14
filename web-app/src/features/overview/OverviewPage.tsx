import { useQueries } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { EmptyState, Metric, Panel, ShellSection, StatusBadge, formatCurrency, formatDate } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAuthedQuery } from '../../lib/auth-query'
import { useOrganizationChoices } from '../../lib/organization-choices'

function sortByNewest<T extends { createdAt: string }>(items: T[]) {
  return [...items].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

function buildActionItems({
  failedCount,
  planningCount,
  overdueInvoices,
  pendingInvites,
  isInternal,
}: {
  failedCount: number
  planningCount: number
  overdueInvoices: number
  pendingInvites: number
  isInternal: boolean
}) {
  const items: Array<{
    key: string
    title: string
    body: string
    to: string
    actionLabel: string
    tone: 'critical' | 'warning' | 'neutral'
  }> = []

  if (failedCount > 0) {
    items.push({
      key: 'failed',
      title: `有 ${failedCount} 筆任務未成功完成`,
      body: isInternal
        ? '先從任務詳情或支援佇列確認失敗原因，避免交付卡住。'
        : '請先進入任務詳情查看失敗原因與目前的成果狀態。',
      to: isInternal ? '/support' : '/missions',
      actionLabel: isInternal ? '前往支援佇列' : '查看任務',
      tone: 'critical',
    })
  }

  if (planningCount > 0) {
    items.push({
      key: 'planning',
      title: `有 ${planningCount} 筆任務仍在規劃中`,
      body: '如果任務停留太久，請確認是否需要調整輸入資料或請支援協助查看。',
      to: '/missions',
      actionLabel: '查看任務',
      tone: 'warning',
    })
  }

  if (overdueInvoices > 0) {
    items.push({
      key: 'billing',
      title: `有 ${overdueInvoices} 張帳單已逾期`,
      body: '請確認付款進度、付款說明與是否需要補上付款備註。',
      to: '/billing',
      actionLabel: '查看帳務',
      tone: 'critical',
    })
  }

  if (pendingInvites > 0) {
    items.push({
      key: 'invites',
      title: `有 ${pendingInvites} 份邀請尚未接受`,
      body: '確認團隊成員是否已收到邀請，並在必要時重新發送或追蹤進度。',
      to: '/team',
      actionLabel: '查看團隊',
      tone: 'neutral',
    })
  }

  return items
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

  const organizationDetailQueries = useQueries({
    queries: auth.status === 'authenticated' && auth.session?.accessToken
      ? choices.map((choice) => ({
          queryKey: ['organization', choice.organizationId, 'overview'],
          queryFn: () => api.getOrganization(auth.session!.accessToken, choice.organizationId),
          staleTime: 30_000,
          enabled: Boolean(choice.organizationId),
        }))
      : [],
  })

  const sites = sitesQuery.data ?? []
  const missions = missionsQuery.data ?? []
  const invoices = invoicesQuery.data ?? []
  const organizationDetails = organizationDetailQueries
    .map((query) => query.data)
    .filter((detail): detail is NonNullable<typeof detail> => Boolean(detail))

  const recentMissions = sortByNewest(missions).slice(0, 4)
  const recentOutputs = sortByNewest(missions.filter((mission) => mission.status === 'ready')).slice(0, 3)
  const failedCount = missions.filter((mission) => mission.status === 'failed').length
  const planningCount = missions.filter((mission) => mission.status === 'planning').length
  const overdueInvoices = invoices.filter((invoice) => invoice.status === 'overdue')
  const pendingInviteCount = organizationDetails.reduce((count, organization) => count + organization.pendingInvites.length, 0)
  const pendingCount = failedCount + planningCount + overdueInvoices.length + pendingInviteCount
  const actionItems = buildActionItems({
    failedCount,
    planningCount,
    overdueInvoices: overdueInvoices.length,
    pendingInvites: pendingInviteCount,
    isInternal: auth.isInternal,
  })

  const isLoading =
    sitesQuery.isLoading ||
    missionsQuery.isLoading ||
    invoicesQuery.isLoading ||
    organizationDetailQueries.some((query) => query.isLoading)

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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Metric label="可查看場址" value={sites.length} hint="包含你目前有權限的場址。" />
        <Metric label="規劃中任務" value={planningCount} hint="仍在等待規劃完成的工作。" />
        <Metric label="已就緒成果" value={recentOutputs.length} hint="可直接進入任務詳情下載成果。" />
        <Metric label="待接受邀請" value={pendingInviteCount} hint="團隊成員尚未接受的邀請。" />
        <Metric
          label="待處理項目"
          value={pendingCount}
          hint={pendingCount > 0 ? '包含失敗任務、規劃中任務、逾期帳單與待接受邀請。' : '目前沒有需要特別跟進的項目。'}
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
              {actionItems.length === 0 ? (
                <p className="text-sm text-chrome-700">目前沒有失敗任務、長時間規劃中任務、逾期帳單或待接受邀請。</p>
              ) : (
                actionItems.map((item) => (
                  <div
                    key={item.key}
                    className={
                      item.tone === 'critical'
                        ? 'rounded-2xl border border-red-200 bg-red-50 px-4 py-4'
                        : item.tone === 'warning'
                          ? 'rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4'
                          : 'rounded-2xl border border-chrome-200 bg-chrome-50/80 px-4 py-4'
                    }
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <p className="font-medium text-chrome-950">{item.title}</p>
                        <p className="mt-1 text-sm text-chrome-700">{item.body}</p>
                      </div>
                      <Link
                        to={item.to}
                        className="inline-flex rounded-full border border-chrome-300 bg-white px-4 py-2 text-sm text-chrome-950"
                      >
                        {item.actionLabel}
                      </Link>
                    </div>
                  </div>
                ))
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
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">團隊提醒</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">待接受的邀請</h2>
            <div className="mt-4 grid gap-3">
              {pendingInviteCount === 0 ? (
                <p className="text-sm text-chrome-700">目前沒有待接受的團隊邀請。</p>
              ) : (
                organizationDetails
                  .filter((organization) => organization.pendingInvites.length > 0)
                  .flatMap((organization) =>
                    organization.pendingInvites.map((invite) => (
                      <Link
                        key={invite.inviteId}
                        to="/team"
                        className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4 transition hover:border-chrome-400"
                      >
                        <p className="font-medium text-chrome-950">{invite.email}</p>
                        <p className="mt-2 text-sm text-chrome-700">
                          {organization.name} · 截止於 {formatDate(invite.expiresAt)}
                        </p>
                      </Link>
                    )),
                  )
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
