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

type GuidanceItem = {
  title: string
  body: string
  to: string
  actionLabel: string
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
      title: `有 ${failedMissionCount} 筆任務需要優先檢查`,
      body: isInternal
        ? '請開啟支援工作台或任務清單，確認失敗、遙測過期與派工後續處理。'
        : '請開啟任務清單，檢查交付失敗、報表異常或缺失的成果檔案。',
      to: isInternal ? '/support' : '/missions',
      actionLabel: isInternal ? '前往支援工作台' : '檢查任務',
      tone: 'critical',
    })
  }

  if (readyMissionCount > 0) {
    items.push({
      key: 'ready',
      title: `有 ${readyMissionCount} 筆任務已完成規劃`,
      body: '這些任務已有規劃成果，但仍需完成報表產生、發布或派工確認。',
      to: '/missions',
      actionLabel: '查看待處理任務',
      tone: 'warning',
    })
  }

  if (planningMissionCount > 0) {
    items.push({
      key: 'planning',
      title: `有 ${planningMissionCount} 筆任務仍在規劃中`,
      body: '航線產生或成果封裝仍在進行，建議保留在每日營運追蹤清單中。',
      to: '/missions',
      actionLabel: '查看規劃佇列',
      tone: 'warning',
    })
  }

  if (overdueInvoiceCount > 0) {
    items.push({
      key: 'overdue',
      title: `有 ${overdueInvoiceCount} 張帳單已逾期`,
      body: '請盡快追蹤帳務，以免影響帳戶維持可營運狀態。',
      to: '/billing',
      actionLabel: '前往帳務',
      tone: 'critical',
    })
  } else if (invoiceDueCount > 0) {
    items.push({
      key: 'due',
      title: `有 ${invoiceDueCount} 張帳單即將到期`,
      body: '請提前追蹤付款進度，避免進入逾期狀態。',
      to: '/billing',
      actionLabel: '檢查帳單',
      tone: 'warning',
    })
  }

  if (pendingInviteCount > 0) {
    items.push({
      key: 'invite',
      title: `有 ${pendingInviteCount} 筆團隊邀請尚未接受`,
      body: '團隊成員尚未完成開通，可到團隊頁面查看並視需要重寄邀請。',
      to: '/team',
      actionLabel: '前往團隊',
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
  if (mission.reportStatus === 'ready') {
    return `${mission.eventCount} 筆事件已整理完成，報表已就緒${
      mission.reportGeneratedAt ? `｜${formatDateTime(mission.reportGeneratedAt)}` : ''
    }。`
  }
  if (mission.reportStatus === 'failed') {
    return mission.failureReason ?? '這筆任務的報表產生失敗。'
  }
  if (mission.deliveryStatus === 'published') {
    return mission.publishedAt ? `成果已於 ${formatDateTime(mission.publishedAt)} 發布。` : '成果已發布。'
  }
  if (mission.deliveryStatus === 'failed') {
    return mission.failureReason ?? '這筆任務的成果交付失敗。'
  }
  if (mission.deliveryStatus === 'ready') {
    return '任務封裝已完成，但仍需完成發布或報表整理。'
  }
  return '任務仍在規劃中，尚未完成交付與報表流程。'
}

function invoiceSummary(invoice: BillingInvoice) {
  if (invoice.status === 'overdue') {
    return `已於 ${formatDate(invoice.dueDate)} 逾期`
  }
  if (invoice.status === 'invoice_due') {
    return `到期日：${formatDate(invoice.dueDate)}`
  }
  if (invoice.status === 'paid') {
    return '付款已確認。'
  }
  if (invoice.status === 'void') {
    return '這張帳單已作廢。'
  }
  return `目前狀態：${invoice.status}`
}

function inviteSummary(invite: OverviewInvite) {
  return `建立於 ${formatDateTime(invite.createdAt)}｜到期日 ${formatDate(invite.expiresAt)}`
}

function buildGuidanceItem({
  siteCount,
  missionCount,
  pendingInviteCount,
  isInternal,
}: {
  siteCount: number
  missionCount: number
  pendingInviteCount: number
  isInternal: boolean
}): GuidanceItem | null {
  if (siteCount === 0) {
    return {
      title: '先建立第一個場域',
      body: '控制平面需要場域資料，才能掛接航線、排程、任務與報表。',
      to: '/sites',
      actionLabel: '前往場域',
    }
  }

  if (missionCount === 0) {
    return {
      title: '目前還沒有任務',
      body: '建立第一筆任務後，才會串起規劃、派工、事件、證據與報表整體流程。',
      to: '/missions/new',
      actionLabel: '建立任務',
    }
  }

  if (!isInternal && pendingInviteCount === 0) {
    return {
      title: '邀請其他團隊成員加入',
      body: '在 demo 交接前，先加入檢視者或另一位管理員，避免所有操作都仰賴單一帳號。',
      to: '/team',
      actionLabel: '管理團隊',
    }
  }

  return null
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
        <p className="text-sm text-chrome-700">正在載入總覽資料…</p>
      </Panel>
    )
  }

  if (!overviewQuery.data) {
    return (
      <EmptyState
        title="目前無法載入總覽"
        body="總覽聚合資料讀取失敗，請確認 API 狀態與目前的組織範圍。"
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
  const guidanceItem = buildGuidanceItem({
    siteCount: overview.siteCount,
    missionCount: overview.missionCount,
    pendingInviteCount: overview.pendingInviteCount,
    isInternal: auth.isInternal,
  })

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow={auth.isInternal ? '內部營運' : '客戶入口'}
        title="總覽"
        subtitle={
          auth.isInternal
            ? '從同一個每日工作面板追蹤 demo 準備度、支援負載與最新報表輸出。'
            : '從同一個總覽面板追蹤任務進度、報表產出、帳務提醒與團隊存取。'
        }
        action={
          <Link to="/missions/new" className="inline-flex rounded-full bg-chrome-950 px-4 py-2 text-sm text-white">
            建立任務
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Metric label="場域" value={overview.siteCount} hint="可用來掛接航線、排程與任務的場域數量。" />
        <Metric label="規劃中" value={overview.planningMissionCount} hint="仍在產生航線或任務封裝。" />
        <Metric label="已就緒" value={overview.readyMissionCount} hint="規劃完成，但仍待發布或補上報表。" />
        <Metric label="已發布" value={overview.publishedMissionCount} hint="核心任務成果已可供下載與交付。" />
        {auth.isInternal ? (
          <Metric
            label="待處理支援"
            value={overview.supportSummary?.openCount ?? 0}
            hint={
              overview.supportSummary
                ? `${overview.supportSummary.criticalCount} 筆嚴重 / ${overview.supportSummary.warningCount} 筆警示`
                : '目前範圍內沒有支援聚合資料。'
            }
          />
        ) : (
          <Metric
            label="待處理事項"
            value={customerPendingCount}
            hint={customerPendingCount > 0 ? '仍有客戶端後續作業。' : '目前沒有客戶端待處理項目。'}
          />
        )}
      </div>

      {!hasAnyData ? (
        <EmptyState
          title={guidanceItem?.title ?? '目前還沒有工作區資料'}
          body={
            guidanceItem?.body ??
            '先建立場域，再建立任務，才能開啟控制平面、事件、報表與交付的完整流程。'
          }
          action={
            <Link
              to={guidanceItem?.to ?? '/missions/new'}
              className="rounded-full bg-chrome-950 px-4 py-2 text-sm text-white"
            >
              {guidanceItem?.actionLabel ?? '建立任務'}
            </Link>
          }
        />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="space-y-6">
          <Panel>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">待處理事項</p>
                <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">現在需要注意什麼</h2>
              </div>
              {auth.isInternal ? (
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <Link to="/support" className="text-ember-500 underline">
                    前往支援工作台
                  </Link>
                  <Link to="/live-ops" className="text-ember-500 underline">
                    前往即時營運
                  </Link>
                </div>
              ) : null}
            </div>
            <div className="mt-4 grid gap-3">
              {actionItems.length === 0 ? (
                guidanceItem ? (
                  <div className={actionCardClass('neutral')}>
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <p className="font-medium text-chrome-950">{guidanceItem.title}</p>
                        <p className="mt-1 text-sm text-chrome-700">{guidanceItem.body}</p>
                      </div>
                      <Link
                        to={guidanceItem.to}
                        className="inline-flex rounded-full border border-chrome-300 bg-white px-4 py-2 text-sm text-chrome-950"
                      >
                        {guidanceItem.actionLabel}
                      </Link>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-chrome-700">
                    目前沒有緊急事項。可以前往任務清單或控制平面，繼續推進 demo 流程。
                  </p>
                )
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
                <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">任務佇列</h2>
              </div>
              <Link to="/missions" className="text-sm text-ember-500 underline">
                前往任務清單
              </Link>
            </div>
            <div className="mt-4 grid gap-3">
              {overview.recentMissions.length === 0 ? (
                <div className="rounded-2xl border border-chrome-200 bg-chrome-50/80 px-4 py-4">
                  <p className="font-medium text-chrome-950">目前還沒有最近任務</p>
                  <p className="mt-2 text-sm text-chrome-700">
                    建立或匯入第一筆任務，才能開始 route-to-report 的 demo 故事。
                  </p>
                </div>
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
                      <StatusBadge status={mission.reportStatus} />
                    </div>
                    <p className="mt-2 text-sm text-chrome-700">{deliverySummary(mission)}</p>
                    <p className="mt-2 text-xs text-chrome-500">
                      建立於 {formatDateTime(mission.createdAt)}｜封裝版本 {mission.bundleVersion}
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
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">報表與事件</p>
                <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">最新報表與異常摘要</h2>
              </div>
              <Link to="/missions" className="text-sm text-ember-500 underline">
                前往任務詳情
              </Link>
            </div>
            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                <p className="font-medium text-chrome-950">最新報表</p>
                {overview.latestReportSummary ? (
                  <>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <StatusBadge status={overview.latestReportSummary.status} />
                      <span className="text-sm text-chrome-700">
                        {overview.latestReportSummary.generatedAt
                          ? formatDateTime(overview.latestReportSummary.generatedAt)
                          : '尚未產生'}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-chrome-700">
                      {overview.latestReportSummary.summary ??
                        (overview.latestReportSummary.eventCount === 0
                          ? '最新報表為無異常的巡檢結果。'
                          : '目前沒有額外的報表摘要。')}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-chrome-700">目前尚未產生報表摘要。</p>
                )}
              </div>

              <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                <p className="font-medium text-chrome-950">最新異常事件</p>
                {overview.latestEventSummary ? (
                  <>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <StatusBadge status={overview.latestEventSummary.severity} />
                      <span className="text-sm text-chrome-700">
                        {formatDateTime(overview.latestEventSummary.detectedAt)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-chrome-700">{overview.latestEventSummary.summary}</p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-chrome-700">
                    {overview.latestReportSummary?.status === 'ready' && overview.latestReportSummary.eventCount === 0
                      ? '目前最新完成的報表為無異常巡檢。'
                      : '目前尚未記錄任何異常事件。'}
                  </p>
                )}
              </div>
            </div>
          </Panel>

          <Panel>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">帳務</p>
                <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">帳務追蹤</h2>
              </div>
              <Link to="/billing" className="text-sm text-ember-500 underline">
                前往帳務
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-chrome-200 bg-chrome-50/80 px-4 py-4">
                <p className="font-medium text-chrome-950">重點提醒</p>
                <p className="mt-2 text-sm text-chrome-700">
                  {overview.overdueInvoiceCount > 0
                    ? `有 ${overview.overdueInvoiceCount} 張帳單已逾期。`
                    : overview.invoiceDueCount > 0
                      ? `有 ${overview.invoiceDueCount} 張帳單即將到期。`
                      : '目前沒有緊急帳務提醒。'}
                </p>
              </div>
              {overview.recentInvoices.length === 0 ? (
                <p className="text-sm text-chrome-700">目前範圍內沒有最近帳單。</p>
              ) : (
                overview.recentInvoices.map((invoice) => (
                  <div key={invoice.invoiceId} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="font-medium text-chrome-950">{invoice.invoiceNumber}</p>
                      <StatusBadge status={invoice.status} />
                    </div>
                    <p className="mt-2 text-sm text-chrome-700">{invoiceSummary(invoice)}</p>
                    <p className="mt-2 text-xs text-chrome-500">
                      總額 {formatCurrency(invoice.currency, invoice.total)}｜到期日 {formatDate(invoice.dueDate)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">團隊存取</p>
                <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">待接受邀請</h2>
              </div>
              <Link to="/team" className="text-sm text-ember-500 underline">
                前往團隊
              </Link>
            </div>
            <div className="mt-4 grid gap-3">
              {overview.pendingInvites.length === 0 ? (
                <p className="text-sm text-chrome-700">目前沒有待接受的邀請。</p>
              ) : (
                overview.pendingInvites.map((invite) => (
                  <div key={invite.inviteId} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                    <p className="font-medium text-chrome-950">{invite.email}</p>
                    <p className="mt-1 text-sm text-chrome-700">{invite.organizationName ?? '未知組織'}</p>
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
