import { Link } from 'react-router-dom'

import {
  EmptyState,
  Metric,
  Panel,
  ShellSection,
  StatusBadge,
  formatCurrency,
  formatDate,
  formatDateTime,
} from '../../components/ui'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAuthedQuery } from '../../lib/auth-query'
import type { BillingInvoice, MissionSummary, OverviewInvite } from '../../lib/types'

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
  readyMissionCount,
  planningMissionCount,
  overdueInvoiceCount,
  invoiceDueCount,
  pendingInviteCount,
  isInternal,
}: {
  failedMissionCount: number
  readyMissionCount: number
  planningMissionCount: number
  overdueInvoiceCount: number
  invoiceDueCount: number
  pendingInviteCount: number
  isInternal: boolean
}): ActionItem[] {
  const items: ActionItem[] = []

  if (failedMissionCount > 0) {
    items.push({
      key: 'failed',
      title: `${failedMissionCount} 筆任務需要優先處理`,
      body: isInternal
        ? '先確認失敗原因、支援建議與後續處理人，再決定是否要重新規劃或交接。'
        : '這些任務尚未完成交付，請先查看失敗原因並決定是否重新送件。',
      to: isInternal ? '/support' : '/missions',
      actionLabel: isInternal ? '前往支援工作台' : '查看任務',
      tone: 'critical',
    })
  }

  if (readyMissionCount > 0) {
    items.push({
      key: 'ready',
      title: `${readyMissionCount} 筆任務已完成規劃`,
      body: '任務已準備好進入交付階段，請優先檢查內容並確認成果是否已發布。',
      to: '/missions',
      actionLabel: '檢查交付狀態',
      tone: 'warning',
    })
  }

  if (planningMissionCount > 0) {
    items.push({
      key: 'planning',
      title: `${planningMissionCount} 筆任務仍在規劃中`,
      body: '這些任務還在等待規劃結果或成果檔，先確認是否有卡住的地方。',
      to: '/missions',
      actionLabel: '查看規劃進度',
      tone: 'warning',
    })
  }

  if (overdueInvoiceCount > 0) {
    items.push({
      key: 'overdue',
      title: `${overdueInvoiceCount} 筆帳單已逾期`,
      body: '先確認付款安排、匯款資訊與收款回覆，避免交付與帳務狀態脫節。',
      to: '/billing',
      actionLabel: '查看逾期帳單',
      tone: 'critical',
    })
  } else if (invoiceDueCount > 0) {
    items.push({
      key: 'due',
      title: `${invoiceDueCount} 筆帳單即將到期`,
      body: '這些帳單已接近付款期限，適合先提醒客戶或對照付款說明。',
      to: '/billing',
      actionLabel: '查看到期提醒',
      tone: 'warning',
    })
  }

  if (pendingInviteCount > 0) {
    items.push({
      key: 'invite',
      title: `${pendingInviteCount} 筆團隊邀請待開通`,
      body: '確認對方是否已收到邀請連結，必要時重新寄送或撤銷後重建。',
      to: '/team',
      actionLabel: '管理團隊邀請',
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

function deliverySummary(mission: MissionSummary) {
  if (mission.deliveryStatus === 'published') {
    return mission.publishedAt ? `已於 ${formatDateTime(mission.publishedAt)} 發布交付檔。` : '交付檔已發布。'
  }
  if (mission.deliveryStatus === 'failed') {
    return mission.failureReason ?? '交付流程失敗，請查看任務詳情。'
  }
  if (mission.deliveryStatus === 'ready') {
    return '任務已規劃完成，等待發布交付檔。'
  }
  return '任務仍在規劃中，成果檔尚未可下載。'
}

function invoiceSummary(invoice: BillingInvoice) {
  if (invoice.status === 'overdue') {
    return `已逾期，原定付款日為 ${formatDate(invoice.dueDate)}。`
  }
  if (invoice.status === 'invoice_due') {
    return `即將到期，付款日為 ${formatDate(invoice.dueDate)}。`
  }
  if (invoice.status === 'paid') {
    return '已完成付款，可對照收款註記與收據編號。'
  }
  if (invoice.status === 'void') {
    return '這筆帳單已作廢。'
  }
  return `目前狀態為 ${invoice.status}。`
}

function inviteSummary(invite: OverviewInvite) {
  return `建立於 ${formatDateTime(invite.createdAt)}，到期日為 ${formatDate(invite.expiresAt)}。`
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
        <p className="text-sm text-chrome-700">正在載入首頁摘要…</p>
      </Panel>
    )
  }

  if (!overviewQuery.data) {
    return (
      <EmptyState
        title="目前無法取得首頁摘要"
        body="請重新整理頁面；如果問題持續存在，再檢查 API 與登入工作階段是否正常。"
      />
    )
  }

  const overview = overviewQuery.data
  const actionItems = buildActionItems({
    failedMissionCount: overview.failedMissionCount,
    readyMissionCount: overview.readyMissionCount,
    planningMissionCount: overview.planningMissionCount,
    overdueInvoiceCount: overview.overdueInvoiceCount,
    invoiceDueCount: overview.invoiceDueCount,
    pendingInviteCount: overview.pendingInviteCount,
    isInternal: auth.isInternal,
  })
  const customerPendingCount =
    overview.failedMissionCount +
    overview.readyMissionCount +
    overview.planningMissionCount +
    overview.invoiceDueCount +
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
        eyebrow={auth.isInternal ? 'Internal Ops' : 'Customer Portal'}
        title="總覽"
        subtitle={
          auth.isInternal
            ? '先看目前最需要處理的任務、帳務與邀請，再決定要進支援工作台、Live Ops 或個別任務。'
            : '把今天需要注意的任務交付、帳單提醒與團隊邀請收斂在同一頁，方便快速判斷下一步。'
        }
        action={
          <Link to="/missions/new" className="inline-flex rounded-full bg-chrome-950 px-4 py-2 text-sm text-white">
            新增任務請求
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Metric label="場址數" value={overview.siteCount} hint="目前這個工作區可用的場址數量。" />
        <Metric label="規劃中任務" value={overview.planningMissionCount} hint="仍在等待規劃結果或交付檔。" />
        <Metric label="待交付任務" value={overview.readyMissionCount} hint="任務已規劃完成，等待正式發布成果。" />
        <Metric label="已發布交付" value={overview.publishedMissionCount} hint="已有成果檔可供下載的任務。" />
        {auth.isInternal ? (
          <Metric
            label="支援項目"
            value={overview.supportSummary?.openCount ?? 0}
            hint={
              overview.supportSummary
                ? `${overview.supportSummary.criticalCount} 筆關鍵 / ${overview.supportSummary.warningCount} 筆警示`
                : '目前沒有需要支援的工作項。'
            }
          />
        ) : (
          <Metric
            label="待處理事項"
            value={customerPendingCount}
            hint={customerPendingCount > 0 ? '把任務、帳務與邀請提醒集中在這裡。' : '目前沒有待處理的提醒。'}
          />
        )}
      </div>

      {!hasAnyData ? (
        <EmptyState
          title="這個工作區還沒有資料"
          body="先建立第一個任務請求，後續的交付、帳單與團隊邀請就會逐步出現在這裡。"
          action={
            <Link to="/missions/new" className="rounded-full bg-chrome-950 px-4 py-2 text-sm text-white">
              建立第一筆任務
            </Link>
          }
        />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="space-y-6">
          <Panel>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Pending actions</p>
                <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">今天優先要處理的事</h2>
              </div>
              {auth.isInternal ? (
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <Link to="/support" className="text-ember-500 underline">
                    前往支援工作台
                  </Link>
                  <Link to="/live-ops" className="text-ember-500 underline">
                    查看 Live Ops
                  </Link>
                </div>
              ) : null}
            </div>
            <div className="mt-4 grid gap-3">
              {actionItems.length === 0 ? (
                <p className="text-sm text-chrome-700">目前沒有需要優先處理的提醒，可以直接查看任務或建立新的請求。</p>
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
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Recent missions</p>
                <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">近期任務與交付</h2>
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
                    <p className="mt-2 text-sm text-chrome-700">{deliverySummary(mission)}</p>
                    <p className="mt-2 text-xs text-chrome-500">
                      建立於 {formatDateTime(mission.createdAt)} · Bundle {mission.bundleVersion}
                    </p>
                  </Link>
                ))
              )}
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Delivery</p>
                <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">最新交付成果</h2>
              </div>
              <Link to="/missions" className="text-sm text-ember-500 underline">
                查看任務明細
              </Link>
            </div>
            <div className="mt-4 grid gap-3">
              {overview.recentDeliveries.length === 0 ? (
                <p className="text-sm text-chrome-700">目前還沒有已發布的交付成果。</p>
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
                    <p className="mt-2 text-sm text-chrome-700">{deliverySummary(mission)}</p>
                  </Link>
                ))
              )}
            </div>
          </Panel>

          <Panel>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Billing</p>
                <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">帳務提醒</h2>
              </div>
              <Link to="/billing" className="text-sm text-ember-500 underline">
                查看帳單
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-chrome-200 bg-chrome-50/80 px-4 py-4">
                <p className="font-medium text-chrome-950">本頁摘要</p>
                <p className="mt-2 text-sm text-chrome-700">
                  {overview.overdueInvoiceCount > 0
                    ? `目前有 ${overview.overdueInvoiceCount} 筆逾期帳單需要優先處理。`
                    : overview.invoiceDueCount > 0
                      ? `目前有 ${overview.invoiceDueCount} 筆帳單即將到期。`
                      : '目前沒有逾期或即將到期的帳單。'}
                </p>
              </div>
              {overview.recentInvoices.length === 0 ? (
                <p className="text-sm text-chrome-700">目前還沒有帳單資料。</p>
              ) : (
                overview.recentInvoices.map((invoice) => (
                  <div key={invoice.invoiceId} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="font-medium text-chrome-950">{invoice.invoiceNumber}</p>
                      <StatusBadge status={invoice.status} />
                    </div>
                    <p className="mt-2 text-sm text-chrome-700">{invoiceSummary(invoice)}</p>
                    <p className="mt-2 text-xs text-chrome-500">
                      金額 {formatCurrency(invoice.currency, invoice.total)} · 到期日 {formatDate(invoice.dueDate)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Team</p>
                <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">待開通邀請</h2>
              </div>
              <Link to="/team" className="text-sm text-ember-500 underline">
                管理團隊
              </Link>
            </div>
            <div className="mt-4 grid gap-3">
              {overview.pendingInvites.length === 0 ? (
                <p className="text-sm text-chrome-700">目前沒有待開通的團隊邀請。</p>
              ) : (
                overview.pendingInvites.map((invite) => (
                  <div key={invite.inviteId} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                    <p className="font-medium text-chrome-950">{invite.email}</p>
                    <p className="mt-1 text-sm text-chrome-700">{invite.organizationName ?? '未指定組織'}</p>
                    <p className="mt-2 text-sm text-chrome-700">{inviteSummary(invite)}</p>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
