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
      title: `${failedMissionCount} mission record(s) need review`,
      body: isInternal
        ? 'Open Support or the mission index to review failures, stale telemetry, and dispatch follow-up.'
        : 'Open the mission index to review failures, delivery issues, or missing artifacts.',
      to: isInternal ? '/support' : '/missions',
      actionLabel: isInternal ? 'Open Support' : 'Review missions',
      tone: 'critical',
    })
  }

  if (readyMissionCount > 0) {
    items.push({
      key: 'ready',
      title: `${readyMissionCount} mission bundle(s) are ready`,
      body: 'These missions have planning output but still need report generation, publish, or dispatch follow-up.',
      to: '/missions',
      actionLabel: 'Open ready missions',
      tone: 'warning',
    })
  }

  if (planningMissionCount > 0) {
    items.push({
      key: 'planning',
      title: `${planningMissionCount} mission(s) are still planning`,
      body: 'Route generation or bundle assembly is still in progress. Keep these in the daily operating queue.',
      to: '/missions',
      actionLabel: 'Review planning queue',
      tone: 'warning',
    })
  }

  if (overdueInvoiceCount > 0) {
    items.push({
      key: 'overdue',
      title: `${overdueInvoiceCount} invoice(s) are overdue`,
      body: 'Billing needs follow-up before the account drifts out of an operable state.',
      to: '/billing',
      actionLabel: 'Open billing',
      tone: 'critical',
    })
  } else if (invoiceDueCount > 0) {
    items.push({
      key: 'due',
      title: `${invoiceDueCount} invoice(s) are due soon`,
      body: 'Keep payment tracking current so finance follow-up stays ahead of overdue work.',
      to: '/billing',
      actionLabel: 'Check invoices',
      tone: 'warning',
    })
  }

  if (pendingInviteCount > 0) {
    items.push({
      key: 'invite',
      title: `${pendingInviteCount} invite(s) are still pending`,
      body: 'Team access has been issued but not accepted yet. Review the team page and resend if needed.',
      to: '/team',
      actionLabel: 'Open team access',
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
    return `${mission.eventCount} event${mission.eventCount === 1 ? '' : 's'} recorded. Report ready${
      mission.reportGeneratedAt ? ` | ${formatDateTime(mission.reportGeneratedAt)}` : ''
    }.`
  }
  if (mission.reportStatus === 'failed') {
    return mission.failureReason ?? 'Report generation failed for this mission.'
  }
  if (mission.deliveryStatus === 'published') {
    return mission.publishedAt ? `Artifacts published ${formatDateTime(mission.publishedAt)}.` : 'Artifacts published.'
  }
  if (mission.deliveryStatus === 'failed') {
    return mission.failureReason ?? 'Mission delivery failed.'
  }
  if (mission.deliveryStatus === 'ready') {
    return 'Mission bundle is ready, but publish or report generation still needs follow-up.'
  }
  return 'Mission still needs follow-up before delivery and reporting are complete.'
}

function invoiceSummary(invoice: BillingInvoice) {
  if (invoice.status === 'overdue') {
    return `Overdue since ${formatDate(invoice.dueDate)}`
  }
  if (invoice.status === 'invoice_due') {
    return `Due on ${formatDate(invoice.dueDate)}`
  }
  if (invoice.status === 'paid') {
    return 'Payment confirmed.'
  }
  if (invoice.status === 'void') {
    return 'Invoice has been voided.'
  }
  return `Current status: ${invoice.status}`
}

function inviteSummary(invite: OverviewInvite) {
  return `Created ${formatDateTime(invite.createdAt)} | expires ${formatDate(invite.expiresAt)}`
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
      title: 'Start by creating a site',
      body: 'The control plane needs a site record before routes, schedules, missions, and reports can be attached to anything concrete.',
      to: '/sites',
      actionLabel: 'Open sites',
    }
  }

  if (missionCount === 0) {
    return {
      title: 'No missions exist yet',
      body: 'Create the first mission to connect planning, dispatch, event generation, evidence, and reporting in one record.',
      to: '/missions/new',
      actionLabel: 'Create mission',
    }
  }

  if (!isInternal && pendingInviteCount === 0) {
    return {
      title: 'Invite the rest of the field team',
      body: 'Add a viewer or another admin before the demo handoff so access does not depend on one account.',
      to: '/team',
      actionLabel: 'Manage team',
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
        <p className="text-sm text-chrome-700">Loading overview aggregate...</p>
      </Panel>
    )
  }

  if (!overviewQuery.data) {
    return (
      <EmptyState
        title="Overview is unavailable"
        body="The overview aggregate could not be loaded. Verify API health and the current organization scope."
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
        eyebrow={auth.isInternal ? 'Internal Ops' : 'Customer Portal'}
        title="Overview"
        subtitle={
          auth.isInternal
            ? 'Track demo readiness, support load, and the latest reporting output without dropping into flight control.'
            : 'Track mission progress, report generation, billing follow-up, and team access from one daily dashboard.'
        }
        action={
          <Link to="/missions/new" className="inline-flex rounded-full bg-chrome-950 px-4 py-2 text-sm text-white">
            Create mission
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Metric label="Sites" value={overview.siteCount} hint="Available site contexts for routes and missions." />
        <Metric label="Planning" value={overview.planningMissionCount} hint="Still generating route or bundle output." />
        <Metric
          label="Ready"
          value={overview.readyMissionCount}
          hint="Bundle is ready, but publish or reporting still needs follow-up."
        />
        <Metric
          label="Published"
          value={overview.publishedMissionCount}
          hint="Core mission artifacts are already available."
        />
        {auth.isInternal ? (
          <Metric
            label="Open support"
            value={overview.supportSummary?.openCount ?? 0}
            hint={
              overview.supportSummary
                ? `${overview.supportSummary.criticalCount} critical / ${overview.supportSummary.warningCount} warning`
                : 'No support aggregation for this scope.'
            }
          />
        ) : (
          <Metric
            label="Pending actions"
            value={customerPendingCount}
            hint={customerPendingCount > 0 ? 'Customer follow-up still required.' : 'No outstanding customer-side actions.'}
          />
        )}
      </div>

      {!hasAnyData ? (
        <EmptyState
          title={guidanceItem?.title ?? 'No workspace data yet'}
          body={
            guidanceItem?.body ??
            'Create a site, then create a mission to unlock the control-plane, reporting, and customer demo surfaces.'
          }
          action={
            <Link
              to={guidanceItem?.to ?? '/missions/new'}
              className="rounded-full bg-chrome-950 px-4 py-2 text-sm text-white"
            >
              {guidanceItem?.actionLabel ?? 'Create mission'}
            </Link>
          }
        />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="space-y-6">
          <Panel>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Pending actions</p>
                <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">What needs attention now</h2>
              </div>
              {auth.isInternal ? (
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <Link to="/support" className="text-ember-500 underline">
                    Open Support
                  </Link>
                  <Link to="/live-ops" className="text-ember-500 underline">
                    Open Live Ops
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
                    Nothing urgent is open right now. Use the mission index or control plane to keep the demo moving.
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
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Recent missions</p>
                <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">Mission queue</h2>
              </div>
              <Link to="/missions" className="text-sm text-ember-500 underline">
                Open missions
              </Link>
            </div>
            <div className="mt-4 grid gap-3">
              {overview.recentMissions.length === 0 ? (
                <div className="rounded-2xl border border-chrome-200 bg-chrome-50/80 px-4 py-4">
                  <p className="font-medium text-chrome-950">No recent missions yet</p>
                  <p className="mt-2 text-sm text-chrome-700">
                    Create or import a mission to start the route-to-report demo story.
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
                      Created {formatDateTime(mission.createdAt)} | Bundle {mission.bundleVersion}
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
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Reporting</p>
                <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">Latest report and anomaly</h2>
              </div>
              <Link to="/missions" className="text-sm text-ember-500 underline">
                Open mission detail
              </Link>
            </div>
            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                <p className="font-medium text-chrome-950">Latest report</p>
                {overview.latestReportSummary ? (
                  <>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <StatusBadge status={overview.latestReportSummary.status} />
                      <span className="text-sm text-chrome-700">
                        {overview.latestReportSummary.generatedAt
                          ? formatDateTime(overview.latestReportSummary.generatedAt)
                          : 'Not generated yet'}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-chrome-700">
                      {overview.latestReportSummary.summary ?? 'No report summary available.'}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-chrome-700">No report summary has been generated yet.</p>
                )}
              </div>

              <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                <p className="font-medium text-chrome-950">Latest anomaly event</p>
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
                  <p className="mt-2 text-sm text-chrome-700">No anomaly event has been recorded yet.</p>
                )}
              </div>
            </div>
          </Panel>

          <Panel>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Billing</p>
                <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">Billing follow-up</h2>
              </div>
              <Link to="/billing" className="text-sm text-ember-500 underline">
                Open billing
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-chrome-200 bg-chrome-50/80 px-4 py-4">
                <p className="font-medium text-chrome-950">Snapshot</p>
                <p className="mt-2 text-sm text-chrome-700">
                  {overview.overdueInvoiceCount > 0
                    ? `${overview.overdueInvoiceCount} invoice(s) are overdue.`
                    : overview.invoiceDueCount > 0
                      ? `${overview.invoiceDueCount} invoice(s) are due soon.`
                      : 'No urgent billing reminders right now.'}
                </p>
              </div>
              {overview.recentInvoices.length === 0 ? (
                <p className="text-sm text-chrome-700">No recent invoices in scope.</p>
              ) : (
                overview.recentInvoices.map((invoice) => (
                  <div key={invoice.invoiceId} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="font-medium text-chrome-950">{invoice.invoiceNumber}</p>
                      <StatusBadge status={invoice.status} />
                    </div>
                    <p className="mt-2 text-sm text-chrome-700">{invoiceSummary(invoice)}</p>
                    <p className="mt-2 text-xs text-chrome-500">
                      Total {formatCurrency(invoice.currency, invoice.total)} | due {formatDate(invoice.dueDate)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Team access</p>
                <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">Pending invites</h2>
              </div>
              <Link to="/team" className="text-sm text-ember-500 underline">
                Open team
              </Link>
            </div>
            <div className="mt-4 grid gap-3">
              {overview.pendingInvites.length === 0 ? (
                <p className="text-sm text-chrome-700">No pending invites are currently in scope.</p>
              ) : (
                overview.pendingInvites.map((invite) => (
                  <div key={invite.inviteId} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                    <p className="font-medium text-chrome-950">{invite.email}</p>
                    <p className="mt-1 text-sm text-chrome-700">{invite.organizationName ?? 'Unknown organization'}</p>
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
