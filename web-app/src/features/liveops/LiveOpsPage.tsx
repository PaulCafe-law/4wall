import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import {
  ActionButton,
  DataList,
  EmptyState,
  Metric,
  Panel,
  ShellSection,
  StatusBadge,
  formatDateTime,
} from '../../components/ui'
import { api, ApiError, type ControlIntentPayload } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAuthedMutation, useAuthedQuery } from '../../lib/auth-query'
import {
  formatApiError,
  formatBoolean,
  formatControlAction,
  formatControlMode,
  formatFlightAlert,
  formatFlightState,
  formatStatus,
} from '../../lib/presentation'
import type {
  ControlIntent,
  ControlIntentAction,
  LiveFlightDetail,
  LiveFlightSummary,
  TelemetryFreshness,
  VideoAvailability,
} from '../../lib/types'

const controlActions: Array<{ action: ControlIntentAction; label: string }> = [
  { action: 'request_remote_control', label: 'Request remote control' },
  { action: 'release_remote_control', label: 'Release remote control' },
  { action: 'pause_mission', label: 'Pause mission' },
  { action: 'resume_mission', label: 'Resume mission' },
  { action: 'hold', label: 'Hold' },
  { action: 'return_to_home', label: 'Return to home' },
]

const freshnessLabels: Record<TelemetryFreshness, string> = {
  fresh: 'Telemetry fresh',
  stale: 'Telemetry stale',
  missing: 'Telemetry missing',
}

const videoLabels: Record<VideoAvailability, string> = {
  live: 'Video live',
  stale: 'Video stale',
  unavailable: 'Video unavailable',
}

function subtleBadgeClass(kind: 'good' | 'warning' | 'danger' | 'neutral') {
  if (kind === 'good') {
    return 'rounded-full bg-moss-300/40 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-moss-600'
  }
  if (kind === 'warning') {
    return 'rounded-full bg-amber-100 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-amber-800'
  }
  if (kind === 'danger') {
    return 'rounded-full bg-red-100 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-red-700'
  }
  return 'rounded-full bg-chrome-100 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-chrome-700'
}

function freshnessBadgeClass(freshness: TelemetryFreshness) {
  if (freshness === 'fresh') {
    return subtleBadgeClass('good')
  }
  if (freshness === 'stale') {
    return subtleBadgeClass('warning')
  }
  return subtleBadgeClass('danger')
}

function videoBadgeClass(status: VideoAvailability) {
  if (status === 'live') {
    return subtleBadgeClass('good')
  }
  if (status === 'stale') {
    return subtleBadgeClass('warning')
  }
  return subtleBadgeClass('danger')
}

function intentStatusClass(status: ControlIntent['status']) {
  if (status === 'accepted') {
    return subtleBadgeClass('good')
  }
  if (status === 'rejected' || status === 'superseded') {
    return subtleBadgeClass('danger')
  }
  return subtleBadgeClass('warning')
}

function formatAgeSeconds(ageSeconds: number | null): string {
  if (ageSeconds == null) {
    return 'Unknown'
  }
  if (ageSeconds < 60) {
    return `${ageSeconds}s`
  }
  const minutes = Math.floor(ageSeconds / 60)
  if (minutes < 60) {
    return `${minutes}m`
  }
  const hours = Math.floor(minutes / 60)
  return `${hours}h`
}

function buildOperatingSummary(flight: LiveFlightDetail) {
  const reasons: string[] = []

  if (flight.telemetryFreshness !== 'fresh') {
    reasons.push(freshnessLabels[flight.telemetryFreshness])
  }
  if (flight.video.status !== 'live') {
    reasons.push(videoLabels[flight.video.status])
  }
  if (!flight.controlLease.observerReady) {
    reasons.push('Observer not confirmed')
  }
  if (!flight.controlLease.heartbeatHealthy) {
    reasons.push('Lease heartbeat unhealthy')
  }

  if (reasons.length === 0) {
    return {
      title: 'Monitor-only state is healthy',
      body: 'Telemetry, video freshness, and lease health are in an acceptable range. This surface stays outside the flight-critical loop and only supports monitoring plus mission-level intents.',
      tone: 'good' as const,
    }
  }

  return {
    title: 'Monitor-only degradation is active',
    body: `The surface has downgraded due to: ${reasons.join(', ')}. Keep decisions anchored on observer confirmation and Android-side safety handling.`,
    tone: 'warning' as const,
  }
}

function buildReportingSummary(flight: LiveFlightDetail) {
  if (flight.reportStatus === 'ready' && flight.eventCount === 0) {
    return {
      title: 'Clean inspection pass is available',
      body: 'A report artifact exists for this mission and no anomaly events were recorded. Open mission detail to export the clean-pass report.',
      tone: 'good' as const,
    }
  }
  if (flight.reportStatus === 'ready') {
    return {
      title: 'Inspection report is ready',
      body:
        flight.reportSummary ??
        `This mission has ${flight.eventCount} event${flight.eventCount === 1 ? '' : 's'} ready for evidence review.`,
      tone: 'warning' as const,
    }
  }
  if (flight.reportStatus === 'failed') {
    return {
      title: 'Report generation failed',
      body:
        flight.reportSummary ??
        'The reporting pipeline did not produce a usable mission report. Open mission detail and rerun demo analysis.',
      tone: 'danger' as const,
    }
  }
  if (flight.reportStatus === 'queued' || flight.reportStatus === 'generating') {
    return {
      title: 'Report generation is in progress',
      body: 'Analysis has started but the final report artifact is not ready yet.',
      tone: 'warning' as const,
    }
  }
  return {
    title: 'No report generated yet',
    body: 'This mission does not have an inspection report yet. Reporting remains a non-flight-critical planner-server responsibility.',
    tone: 'neutral' as const,
  }
}

export function LiveOpsPage() {
  const auth = useAuth()
  const queryClient = useQueryClient()
  const [selectedFlightId, setSelectedFlightId] = useState('')

  const flightsQuery = useAuthedQuery({
    queryKey: ['live-ops', 'flights'],
    queryFn: api.listLiveFlights,
    staleTime: 5_000,
    refetchInterval: 5_000,
  })

  const flights = flightsQuery.data ?? []
  const effectiveFlightId = selectedFlightId || flights[0]?.flightId || ''

  const detailQuery = useAuthedQuery({
    queryKey: ['live-ops', 'flight', effectiveFlightId],
    queryFn: (token) => api.getLiveFlight(token, effectiveFlightId),
    enabled: Boolean(effectiveFlightId),
    staleTime: 3_000,
    refetchInterval: 5_000,
  })

  const intentsQuery = useAuthedQuery({
    queryKey: ['live-ops', 'control-intents', effectiveFlightId],
    queryFn: (token) => api.listControlIntents(token, effectiveFlightId),
    enabled: Boolean(effectiveFlightId),
    staleTime: 3_000,
    refetchInterval: 5_000,
  })

  const requestControlIntent = useAuthedMutation({
    mutationKey: ['live-ops', 'request-control-intent', effectiveFlightId],
    mutationFn: ({ token, payload }: { token: string; payload: ControlIntentPayload }) =>
      api.requestControlIntent(token, effectiveFlightId, payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['live-ops', 'flights'] }),
        queryClient.invalidateQueries({ queryKey: ['live-ops', 'flight', effectiveFlightId] }),
        queryClient.invalidateQueries({ queryKey: ['live-ops', 'control-intents', effectiveFlightId] }),
      ])
    },
  })

  const selectedFlight = detailQuery.data
  const telemetryRiskCount = flights.filter((flight) => flight.telemetryFreshness !== 'fresh').length
  const videoRiskCount = flights.filter((flight) => flight.video.status !== 'live').length
  const alertCount = flights.filter((flight) => flight.alerts.length > 0).length
  const reportFailureCount = flights.filter((flight) => flight.reportStatus === 'failed').length

  async function onRequestAction(action: ControlIntentAction) {
    if (!effectiveFlightId) {
      return
    }
    await requestControlIntent.mutateAsync({
      action,
      reason: `${formatControlAction(action)} requested from Live Ops by ${auth.user?.displayName ?? 'internal user'}.`,
    })
  }

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="Internal only"
        title="Live Ops"
        subtitle="Monitor telemetry, video freshness, lease state, and mission reporting context without turning the browser into a flight-control surface."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Flight sessions" value={flights.length} hint="Current monitor-only sessions in scope." />
        <Metric label="Telemetry risk" value={telemetryRiskCount} hint="Stale or missing telemetry sessions." />
        <Metric label="Video risk" value={videoRiskCount} hint="Sessions where video is stale or unavailable." />
        <Metric label="Report blockers" value={Math.max(reportFailureCount, alertCount)} hint="Report failures and active flight alerts." />
      </div>

      {flightsQuery.isLoading ? (
        <Panel>
          <p className="text-sm text-chrome-700">Loading live flight sessions...</p>
        </Panel>
      ) : null}

      {!flightsQuery.isLoading && flights.length === 0 ? (
        <EmptyState
          title="No live flight sessions are available"
          body="Live Ops stays empty until Android bridge events, telemetry, and video metadata start flowing into planner-server."
        />
      ) : null}

      {flights.length > 0 ? (
        <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
          <FlightList flights={flights} selectedFlightId={effectiveFlightId} onSelect={setSelectedFlightId} />
          <div className="space-y-6">
            {selectedFlight ? (
              <>
                <FlightSummaryPanel flight={selectedFlight} />
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
                  <FlightMapPanel flight={selectedFlight} />
                  <VideoAndLeaseColumn flight={selectedFlight} />
                </div>
                <ReportingPanel flight={selectedFlight} />
                <ControlIntentPanel
                  flight={selectedFlight}
                  intents={intentsQuery.data ?? []}
                  errorDetail={requestControlIntent.error instanceof ApiError ? requestControlIntent.error.detail : undefined}
                  isPending={requestControlIntent.isPending}
                  onRequestAction={onRequestAction}
                />
                <RecentEventsPanel flight={selectedFlight} />
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function FlightList({
  flights,
  selectedFlightId,
  onSelect,
}: {
  flights: LiveFlightSummary[]
  selectedFlightId: string
  onSelect: (flightId: string) => void
}) {
  return (
    <Panel>
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Flight sessions</p>
      <div className="mt-4 grid gap-3">
        {flights.map((flight) => (
          <button
            key={flight.flightId}
            type="button"
            onClick={() => onSelect(flight.flightId)}
            className={
              flight.flightId === selectedFlightId
                ? 'w-full rounded-2xl border border-ember-300 bg-white px-4 py-4 text-left'
                : 'w-full rounded-2xl border border-chrome-200 bg-chrome-50/70 px-4 py-4 text-left transition hover:border-chrome-400'
            }
            aria-label={`select-flight-${flight.flightId}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="break-words font-medium text-chrome-950">{flight.missionName}</h2>
                <p className="mt-1 text-sm text-chrome-700">{flight.siteName ?? 'Unknown site'}</p>
              </div>
              <span className={flight.alerts.length > 0 ? subtleBadgeClass('danger') : subtleBadgeClass('neutral')}>
                {flight.alerts.length > 0 ? `${flight.alerts.length} alert${flight.alerts.length === 1 ? '' : 's'}` : 'Stable'}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={freshnessBadgeClass(flight.telemetryFreshness)}>{freshnessLabels[flight.telemetryFreshness]}</span>
              <span className={videoBadgeClass(flight.video.status)}>{videoLabels[flight.video.status]}</span>
              <StatusBadge status={flight.reportStatus} />
            </div>
            <p className="mt-3 text-xs text-chrome-500">
              {flight.eventCount} event{flight.eventCount === 1 ? '' : 's'} | report {formatStatus(flight.reportStatus)}
            </p>
          </button>
        ))}
      </div>
    </Panel>
  )
}

function FlightSummaryPanel({ flight }: { flight: LiveFlightDetail }) {
  const operatingSummary = buildOperatingSummary(flight)

  return (
    <Panel>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ember-500">Mission context</p>
          <h2 className="mt-2 break-words font-display text-3xl font-semibold text-chrome-950">{flight.missionName}</h2>
          <p className="mt-2 text-sm text-chrome-700">
            {flight.siteName ?? 'Unknown site'} / flight {flight.flightId}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={freshnessBadgeClass(flight.telemetryFreshness)}>{freshnessLabels[flight.telemetryFreshness]}</span>
          <span className={videoBadgeClass(flight.video.status)}>{videoLabels[flight.video.status]}</span>
          <span className={subtleBadgeClass(flight.controlLease.remoteControlEnabled ? 'good' : 'neutral')}>
            {flight.controlLease.remoteControlEnabled ? 'Lease allows remote intents' : 'Lease monitor only'}
          </span>
        </div>
      </div>

      <div
        className={
          operatingSummary.tone === 'good'
            ? 'mt-5 rounded-2xl border border-moss-200 bg-moss-50/80 px-4 py-4'
            : 'mt-5 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-4'
        }
      >
        <p className="font-medium text-chrome-950">{operatingSummary.title}</p>
        <p className="mt-2 text-sm text-chrome-700">{operatingSummary.body}</p>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-4">
        <Metric
          label="Battery"
          value={flight.latestTelemetry ? `${flight.latestTelemetry.batteryPct}%` : 'Unknown'}
          hint={flight.latestTelemetry ? formatFlightState(flight.latestTelemetry.flightState) : 'Telemetry missing'}
        />
        <Metric label="Altitude" value={flight.latestTelemetry ? `${flight.latestTelemetry.altitudeM.toFixed(1)} m` : 'Unknown'} />
        <Metric label="Ground speed" value={flight.latestTelemetry ? `${flight.latestTelemetry.groundSpeedMps.toFixed(1)} m/s` : 'Unknown'} />
        <Metric
          label="Alerts"
          value={flight.alerts.length}
          hint={flight.alerts.length > 0 ? flight.alerts.map(formatFlightAlert).join(', ') : 'No active alerts'}
        />
      </div>

      <div className="mt-5">
        <DataList
          rows={[
            { label: 'Organization', value: flight.organizationId },
            { label: 'Mission', value: flight.missionId },
            { label: 'Site', value: flight.siteName ?? 'Unknown site' },
            { label: 'Last telemetry', value: flight.lastTelemetryAt ? formatDateTime(flight.lastTelemetryAt) : 'No telemetry yet' },
            {
              label: 'Telemetry age',
              value: `${freshnessLabels[flight.telemetryFreshness]} / ${formatAgeSeconds(flight.telemetryAgeSeconds)}`,
            },
            { label: 'Last flight event', value: flight.lastEventAt ? formatDateTime(flight.lastEventAt) : 'No flight events yet' },
            { label: 'Lease mode', value: formatControlMode(flight.controlLease.mode) },
          ]}
        />
      </div>
    </Panel>
  )
}

function ReportingPanel({ flight }: { flight: LiveFlightDetail }) {
  const summary = buildReportingSummary(flight)
  const toneClass =
    summary.tone === 'good'
      ? 'border border-moss-200 bg-moss-50/70'
      : summary.tone === 'danger'
        ? 'border border-red-200 bg-red-50/70'
        : summary.tone === 'warning'
          ? 'border border-amber-200 bg-amber-50/70'
          : 'border border-chrome-200 bg-chrome-50/70'

  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Inspection reporting</p>
          <h3 className="mt-2 font-display text-2xl font-semibold text-chrome-950">Mission report context</h3>
        </div>
        <Link to={`/missions/${flight.missionId}`} className="text-sm text-ember-600 underline underline-offset-4">
          Open mission detail
        </Link>
      </div>

      <div className={`mt-4 rounded-2xl px-4 py-4 ${toneClass}`}>
        <p className="font-medium text-chrome-950">{summary.title}</p>
        <p className="mt-2 text-sm text-chrome-700">{summary.body}</p>
      </div>

      <div className="mt-4">
        <DataList
          rows={[
            { label: 'Report status', value: <StatusBadge status={flight.reportStatus} /> },
            { label: 'Generated', value: flight.reportGeneratedAt ? formatDateTime(flight.reportGeneratedAt) : 'Not generated yet' },
            { label: 'Event count', value: flight.eventCount },
            { label: 'Summary', value: flight.reportSummary ?? 'No report summary yet' },
          ]}
        />
      </div>
    </Panel>
  )
}

function FlightMapPanel({ flight }: { flight: LiveFlightDetail }) {
  const sample = flight.latestTelemetry

  if (!sample) {
    return (
      <EmptyState
        title="Telemetry map is unavailable"
        body="No recent telemetry sample is available for this session yet, so the map view remains in a monitor-only placeholder state."
      />
    )
  }

  return (
    <Panel className="min-w-0">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Telemetry map</p>
      <div className="mt-4 overflow-hidden rounded-[1.5rem] border border-chrome-200 bg-chrome-50">
        <iframe
          title="Flight position map"
          className="h-[20rem] w-full"
          loading="lazy"
          src={buildMapEmbedUrl(sample.lat, sample.lng)}
        />
      </div>
      <div className="mt-4">
        <DataList
          rows={[
            { label: 'Coordinates', value: `${sample.lat.toFixed(5)}, ${sample.lng.toFixed(5)}` },
            { label: 'Corridor deviation', value: `${sample.corridorDeviationM.toFixed(1)} m` },
            { label: 'Sample timestamp', value: formatDateTime(sample.timestamp) },
            {
              label: 'Telemetry freshness',
              value: `${freshnessLabels[flight.telemetryFreshness]} / ${formatAgeSeconds(flight.telemetryAgeSeconds)}`,
            },
          ]}
        />
      </div>
    </Panel>
  )
}

function VideoAndLeaseColumn({ flight }: { flight: LiveFlightDetail }) {
  return (
    <div className="space-y-6">
      <Panel>
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Video channel</p>
          <span className={videoBadgeClass(flight.video.status)}>{videoLabels[flight.video.status]}</span>
        </div>
        <div className="mt-4">
          <DataList
            rows={[
              { label: 'Viewer URL', value: flight.video.viewerUrl ?? 'Unavailable' },
              { label: 'Streaming', value: formatBoolean(flight.video.streaming) },
              { label: 'Latency', value: flight.video.latencyMs != null ? `${flight.video.latencyMs} ms` : 'Unknown' },
              { label: 'Last frame', value: flight.video.lastFrameAt ? formatDateTime(flight.video.lastFrameAt) : 'Unknown' },
              { label: 'Frame age', value: formatAgeSeconds(flight.video.ageSeconds) },
            ]}
          />
        </div>
        {flight.video.viewerUrl ? (
          <div className="mt-4">
            <a
              href={flight.video.viewerUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex rounded-full border border-chrome-300 bg-white px-4 py-2 text-sm text-chrome-950"
            >
              Open video viewer
            </a>
          </div>
        ) : null}
      </Panel>

      <Panel>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Control lease</p>
        <div className="mt-4">
          <DataList
            rows={[
              { label: 'Mode', value: formatControlMode(flight.controlLease.mode) },
              { label: 'Holder', value: flight.controlLease.holder },
              { label: 'Remote intents enabled', value: formatBoolean(flight.controlLease.remoteControlEnabled) },
              { label: 'Observer ready', value: formatBoolean(flight.controlLease.observerReady) },
              { label: 'Heartbeat healthy', value: formatBoolean(flight.controlLease.heartbeatHealthy) },
              { label: 'Expires', value: flight.controlLease.expiresAt ? formatDateTime(flight.controlLease.expiresAt) : 'Released' },
            ]}
          />
        </div>
      </Panel>
    </div>
  )
}

function ControlIntentPanel({
  flight,
  intents,
  errorDetail,
  isPending,
  onRequestAction,
}: {
  flight: LiveFlightDetail
  intents: ControlIntent[]
  errorDetail?: string
  isPending: boolean
  onRequestAction: (action: ControlIntentAction) => Promise<void>
}) {
  return (
    <Panel>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Control intent</p>
          <h3 className="mt-2 font-display text-2xl font-semibold text-chrome-950">Mission-level intent requests</h3>
          <p className="mt-2 max-w-3xl text-sm text-chrome-700">
            This surface records high-level operational intents only. It does not send direct stick commands and does not replace Android-side safety handling.
          </p>
        </div>
        <span className={subtleBadgeClass(flight.controlLease.remoteControlEnabled ? 'good' : 'neutral')}>
          {flight.controlLease.remoteControlEnabled ? 'Remote intents available' : 'Intent path gated'}
        </span>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        {controlActions.map((item) => (
          <ActionButton
            key={item.action}
            type="button"
            disabled={isPending}
            variant={item.action === 'request_remote_control' ? 'primary' : 'secondary'}
            onClick={() => void onRequestAction(item.action)}
          >
            {item.label}
          </ActionButton>
        ))}
      </div>

      {errorDetail ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {formatApiError(errorDetail, 'Unable to submit the control intent.')}
        </div>
      ) : null}

      <div className="mt-6 grid gap-3">
        {intents.length === 0 ? (
          <p className="text-sm text-chrome-700">No control intents have been requested for this flight yet.</p>
        ) : (
          intents.map((intent) => (
            <div key={intent.requestId} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-chrome-950">{formatControlAction(intent.action)}</p>
                  <p className="mt-1 text-sm text-chrome-700">{intent.reason ?? 'No operator note recorded.'}</p>
                  <p className="mt-2 text-xs text-chrome-500">
                    Requested {formatDateTime(intent.createdAt)}
                    {intent.acknowledgedAt ? ` | Acknowledged ${formatDateTime(intent.acknowledgedAt)}` : ''}
                  </p>
                  {intent.resolutionNote ? <p className="mt-1 text-xs text-chrome-500">{intent.resolutionNote}</p> : null}
                </div>
                <span className={intentStatusClass(intent.status)}>{intent.status}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </Panel>
  )
}

function RecentEventsPanel({ flight }: { flight: LiveFlightDetail }) {
  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Recent flight events</p>
          <h3 className="mt-2 font-display text-2xl font-semibold text-chrome-950">Recent bridge and lease telemetry</h3>
        </div>
        <Link to={`/missions/${flight.missionId}`} className="text-sm text-ember-600 underline underline-offset-4">
          Open mission detail
        </Link>
      </div>

      <div className="mt-4 grid gap-3">
        {flight.recentEvents.length === 0 ? (
          <p className="text-sm text-chrome-700">No recent flight events have been recorded.</p>
        ) : (
          flight.recentEvents.map((event) => (
            <div key={event.eventId} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-chrome-950">{event.eventType}</p>
                  <p className="mt-1 text-sm text-chrome-700">{formatDateTime(event.eventTimestamp)}</p>
                </div>
                <pre className="max-w-full overflow-x-auto rounded-2xl bg-chrome-950 p-4 text-xs text-chrome-50 md:max-w-xl">
                  {JSON.stringify(event.payload, null, 2)}
                </pre>
              </div>
            </div>
          ))
        )}
      </div>
    </Panel>
  )
}

function buildMapEmbedUrl(lat: number, lng: number): string {
  const delta = 0.004
  const bbox = [lng - delta, lat - delta, lng + delta, lat + delta].join('%2C')
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`
}
