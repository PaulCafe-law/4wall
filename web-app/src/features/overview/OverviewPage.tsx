import { Link } from 'react-router-dom'

import { EmptyState, Metric, Panel, ShellSection, StatusBadge, formatCurrency, formatDate, formatDateTime } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAuthedQuery } from '../../lib/auth-query'

type ActionItem = {
  key: string
  title: string
  body: string
  to: string
  actionLabel: string
  tone: 'critical' | 'warning' | 'neutral'
}

function buildActionItems({
  failedMissionCount,
  planningMissionCount,
  overdueInvoiceCount,
  pendingInviteCount,
  isInternal,
}: {
  failedMissionCount: number
  planningMissionCount: number
  overdueInvoiceCount: number
  pendingInviteCount: number
  isInternal: boolean
}): ActionItem[] {
  const items: ActionItem[] = []

  if (failedMissionCount > 0) {
    items.push({
      key: 'failed',
      title: `${failedMissionCount} 筆任務需要立即處理`,
      body: isInternal
        ? '支援佇列中已有失敗任務，請先確認任務詳情、交付狀態與下一步處理方式。'
        : '有任務未能完成交付，請先查看任務詳情中的失敗原因與後續動作。',
      to: isInternal ? '/support' : '/missions',
      actionLabel: isInternal ? '前往支援佇列' : '查看任務',
      tone: 'critical',
    })
  }

  if (planningMissionCount > 0) {
    items.push({
      key: 'planning',
      title: `${planningMissionCount} 筆任務仍在規劃中`,
      body: '這些任務尚未進入交付完成狀態，建議優先確認規劃進度與產物發布情況。',
      to: '/missions',
      actionLabel: '查看任務',
      tone: 'warning',
    })
  }

  if (overdueInvoiceCount > 0) {
    items.push({
      key: 'overdue',
      title: `${overdueInvoiceCount} 筆帳單已逾期`,
      body: '請確認付款狀態、備註與收據資訊，避免影響後續交付與營運安排。',
      to: '/billing',
      actionLabel: '查看帳務',
      tone: 'critical',
    })
  }

  if (pendingInviteCount > 0) {
    items.push({
      key: 'invite',
      title: `${pendingInviteCount} 封團隊邀請尚未接受`,
      body: '如果這些成員需要立即使用系統，請提醒對方完成開通，或重新整理邀請流程。',
      to: '/team',
      actionLabel: '查看團隊',
      tone: 'neutral',
    })
  }

  return items
}

function actionCardClass(tone: ActionItem['tone']) {
  if (tone === 'critical') {
    return 'rounded-2xl border border-red-200 bg-red-50 px-4 py-4'
  }
  if (tone === 'warning') {
    return 'rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4'
  }
  return 'rounded-2xl border border-chrome-200 bg-chrome-50/80 px-4 py-4'
}

export function OverviewPage() {
  const auth = useAuth()
  const overviewQuery = useAuthedQuery({
    queryKey: ['web-overview'],
    queryFn: api.getOverview,
    staleTime: 15_000,
  })

  if (overviewQuery.isLoading) {
    return (
      <Panel>
        <p className="text-sm text-chrome-700">正在整理工作區摘要…</p>
      </Panel>
    )
  }

  if (!overviewQuery.data) {
    return (
      <EmptyState
        title="無法載入總覽"
        body="目前還無法讀取工作區摘要，請稍後再試，或重新整理頁面。"
      />
    )
  }

  const overview = overviewQuery.data
  const actionItems = buildActionItems({
    failedMissionCount: overview.failedMissionCount,
    planningMissionCount: overview.planningMissionCount,
    overdueInvoiceCount: overview.overdueInvoiceCount,
    pendingInviteCount: overview.pendingInviteCount,
    isInternal: auth.isInternal,
  })
  const customerPendingCount =
    overview.failedMissionCount +
    overview.planningMissionCount +
    overview.overdueInvoiceCount +
    overview.pendingInviteCount
  const hasAnyData =
    overview.siteCount > 0 ||
    overview.missionCount > 0 ||
    overview.recentInvoices.length > 0 ||
    overview.pendingInvites.length > 0

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow={auth.isInternal ? '內部營運' : '客戶工作區'}
        title="總覽"
        subtitle={
          auth.isInternal
            ? '集中查看任務交付、帳務提醒與內部支援狀態。這個首頁應該讓你一眼知道今天先處理什麼。'
            : '從這裡快速掌握任務進度、最新交付、團隊邀請與帳務提醒，不必再逐頁搜尋。'
        }
        action={
          <Link to="/missions/new" className="inline-flex rounded-full bg-chrome-950 px-4 py-2 text-sm text-white">
            新增任務請求
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Metric label="場址數" value={overview.siteCount} hint="目前可用的場址與作業地點數量。" />
        <Metric label="規劃中任務" value={overview.planningMissionCount} hint="尚未進入交付完成狀態的任務。" />
        <Metric label="已發布成果" value={overview.publishedMissionCount} hint="最近已完成交付且可下載成果的任務。" />
        <Metric label="待接受邀請" value={overview.pendingInviteCount} hint="尚未完成開通的團隊成員邀請。" />
        {auth.isInternal ? (
          <Metric
            label="支援佇列"
            value={overview.supportSummary?.openCount ?? 0}
            hint={
              overview.supportSummary
                ? `${overview.supportSummary.criticalCount} 筆 critical / ${overview.supportSummary.warningCount} 筆 warning`
                : '目前沒有需要處理的支援項目。'
            }
          />
        ) : (
          <Metric
            label="待處理項目"
            value={customerPendingCount}
            hint={customerPendingCount > 0 ? '首頁已彙整目前需要你先處理的項目。' : '目前沒有待處理例外。'}
          />
        )}
      </div>

      {!hasAnyData ? (
        <EmptyState
          title="這個工作區還沒有資料"
          body="先建立場址與任務請求，之後總覽會自動顯示交付、帳務與團隊狀態。"
          action={
            <Link to="/missions/new" className="rounded-full bg-chrome-950 px-4 py-2 text-sm text-white">
              先建立第一筆任務
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
                <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">今天先處理這些事</h2>
              </div>
              {auth.isInternal ? (
                <Link to="/support" className="text-sm text-ember-500 underline">
                  打開支援佇列
                </Link>
              ) : null}
            </div>
            <div className="mt-4 grid gap-3">
              {actionItems.length === 0 ? (
                <p className="text-sm text-chrome-700">目前沒有需要優先處理的例外。你可以直接查看任務或團隊頁面。</p>
              ) : (
                actionItems.map((item) => (
                  <div key={item.key} className={actionCardClass(item.tone)}>
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
                <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">最近任務</h2>
              </div>
              <Link to="/missions" className="text-sm text-ember-500 underline">
                查看全部任務
              </Link>
            </div>
            <div className="mt-4 grid gap-3">
              {overview.recentMissions.length === 0 ? (
                <p className="text-sm text-chrome-700">目前還沒有任務資料。</p>
              ) : (
                overview.recentMissions.map((mission) => (
                  <Link
                    key={mission.missionId}
                    to={`/missions/${mission.missionId}`}
                    className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4 transition hover:border-chrome-400"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="font-medium text-chrome-950">{mission.missionName}</p>
                      <StatusBadge status={mission.deliveryStatus} />
                    </div>
                    <p className="mt-2 text-sm text-chrome-700">建立時間：{formatDateTime(mission.createdAt)}</p>
                    <p className="mt-1 text-sm text-chrome-700">Bundle：{mission.bundleVersion}</p>
                    {mission.deliveryStatus === 'failed' && mission.failureReason ? (
                      <p className="mt-2 text-sm text-red-700">失敗原因：{mission.failureReason}</p>
                    ) : null}
                    {mission.deliveryStatus === 'published' && mission.publishedAt ? (
                      <p className="mt-2 text-sm text-moss-700">已發布於 {formatDateTime(mission.publishedAt)}</p>
                    ) : null}
                  </Link>
                ))
              )}
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">最新交付</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">最新交付</h2>
            <div className="mt-4 grid gap-3">
              {overview.recentDeliveries.length === 0 ? (
                <p className="text-sm text-chrome-700">目前還沒有已發布的成果。</p>
              ) : (
                overview.recentDeliveries.map((mission) => (
                  <Link
                    key={mission.missionId}
                    to={`/missions/${mission.missionId}`}
                    className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4 transition hover:border-chrome-400"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="font-medium text-chrome-950">{mission.missionName}</p>
                      <StatusBadge status={mission.deliveryStatus} />
                    </div>
                    <p className="mt-2 text-sm text-chrome-700">
                      發布時間：{mission.publishedAt ? formatDateTime(mission.publishedAt) : '尚未發布'}
                    </p>
                    <p className="mt-1 text-sm text-chrome-700">進入任務詳情即可下載 `mission.kmz` 與 `mission_meta.json`。</p>
                  </Link>
                ))
              )}
            </div>
          </Panel>

          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">最近帳務</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">最近帳務</h2>
            <div className="mt-4 grid gap-3">
              {overview.recentInvoices.length === 0 ? (
                <p className="text-sm text-chrome-700">目前沒有帳單資料。</p>
              ) : (
                overview.recentInvoices.map((invoice) => (
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
                      到期日：{formatDate(invoice.dueDate)}，金額：{formatCurrency(invoice.currency, invoice.total)}
                    </p>
                    {invoice.paymentNote ? (
                      <p className="mt-1 text-sm text-chrome-700">付款備註：{invoice.paymentNote}</p>
                    ) : null}
                  </Link>
                ))
              )}
            </div>
          </Panel>

          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">待接受邀請</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">待接受邀請</h2>
            <div className="mt-4 grid gap-3">
              {overview.pendingInvites.length === 0 ? (
                <p className="text-sm text-chrome-700">目前沒有尚未接受的邀請。</p>
              ) : (
                overview.pendingInvites.map((invite) => (
                  <Link
                    key={invite.inviteId}
                    to="/team"
                    className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4 transition hover:border-chrome-400"
                  >
                    <p className="font-medium text-chrome-950">{invite.email}</p>
                    <p className="mt-2 text-sm text-chrome-700">
                      {invite.organizationName ?? '未命名組織'} · 到期日 {formatDate(invite.expiresAt)}
                    </p>
                  </Link>
                ))
              )}
            </div>
          </Panel>

          {auth.isInternal && overview.supportSummary ? (
            <Panel>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">內部支援</p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">今日支援摘要</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <Metric label="待處理" value={overview.supportSummary.openCount} />
                <Metric label="高風險" value={overview.supportSummary.criticalCount} />
                <Metric label="提醒" value={overview.supportSummary.warningCount} />
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link to="/support" className="rounded-full border border-chrome-300 px-4 py-2 text-sm text-chrome-900">
                  前往支援佇列
                </Link>
                <Link to="/live-ops" className="rounded-full border border-chrome-300 px-4 py-2 text-sm text-chrome-900">
                  前往 Live Ops
                </Link>
              </div>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  )
}
