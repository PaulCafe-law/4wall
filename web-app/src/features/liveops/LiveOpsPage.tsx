import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  ActionButton,
  DataList,
  EmptyState,
  Metric,
  Panel,
  ShellSection,
  StatusBadge,
  formatDate,
} from '../../components/ui'
import { api, ApiError, type ControlIntentPayload } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAuthedMutation, useAuthedQuery } from '../../lib/auth-query'
import {
  formatApiError,
  formatCameraStreamState,
  formatControlAction,
  formatControlMode,
  formatExecutionMode,
  formatExecutionState,
  formatFlightAlert,
  formatFlightState,
  formatLandingPhase,
  formatOperatingProfile,
  formatRecordingState,
  formatUploadState,
} from '../../lib/presentation'
import type { ControlIntentAction, LiveFlightDetail, LiveFlightSummary } from '../../lib/types'

const controlActions: Array<{ action: ControlIntentAction; label: string }> = [
  { action: 'request_remote_control', label: 'Request Remote Control' },
  { action: 'release_remote_control', label: 'Release Remote Control' },
  { action: 'pause_mission', label: 'Pause Mission' },
  { action: 'resume_mission', label: 'Resume Mission' },
  { action: 'hold', label: 'Hold' },
  { action: 'return_to_home', label: 'Return to Home' },
]

function executionProgress(flight: { executionSummary: LiveFlightSummary['executionSummary'] }) {
  if (flight.executionSummary?.executionMode === 'manual_pilot') {
    return 'Manual pilot active'
  }
  return flight.executionSummary?.waypointProgress ?? 'No waypoint progress'
}

function flightStatus(flight: LiveFlightSummary): string {
  if (flight.alerts.length > 0) {
    return 'failed'
  }
  if (flight.executionSummary?.executionState === 'completed') {
    return 'ready'
  }
  return 'planning'
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
  const remoteActiveCount = flights.filter(
    (flight) => flight.controlLease.mode === 'remote_control_active',
  ).length
  const alertCount = flights.filter((flight) => flight.alerts.length > 0).length
  const manualPilotCount = flights.filter(
    (flight) => flight.executionSummary?.executionMode === 'manual_pilot',
  ).length

  const intentError =
    requestControlIntent.error instanceof ApiError
      ? formatApiError(requestControlIntent.error.detail, requestControlIntent.error.detail)
      : null

  const onRequestAction = async (action: ControlIntentAction) => {
    if (!effectiveFlightId) {
      return
    }
    await requestControlIntent.mutateAsync({
      action,
      reason: `${formatControlAction(action)} / ${auth.user?.displayName ?? 'web user'}`,
    })
  }

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="Live Ops"
        title="Flight Operations"
        subtitle="Monitor Android execution state, patrol progress, manual pilot sessions, landing phase, and control intents without moving flight authority into web."
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Flight Sessions" value={flights.length} hint="Active Android flight sessions" />
        <Metric label="Remote Control" value={remoteActiveCount} hint="Remote control leases currently active" />
        <Metric label="Alerts" value={alertCount} hint="Bridge, battery, telemetry, or execution alerts" />
        <Metric label="Manual Pilot" value={manualPilotCount} hint="Sessions running direct operator pilot mode" />
      </div>

      {flightsQuery.isLoading ? (
        <Panel>
          <p className="text-sm text-chrome-700">Loading live flight sessions…</p>
        </Panel>
      ) : null}

      {!flightsQuery.isLoading && flights.length === 0 ? (
        <EmptyState
          title="No live flights"
          body="Android has not reported any live flight sessions yet. Start a flight session or replay telemetry from the field device."
        />
      ) : null}

      {flights.length > 0 ? (
        <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
          <FlightList flights={flights} selectedFlightId={effectiveFlightId} onSelect={setSelectedFlightId} />
          <div className="space-y-6">
            {selectedFlight ? (
              <>
                <FlightSummaryPanel flight={selectedFlight} />
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
                  <FlightTelemetryPanel flight={selectedFlight} />
                  <VideoAndLeasePanel flight={selectedFlight} />
                </div>
                <ControlIntentPanel
                  canRequestControl={auth.isInternal}
                  errorDetail={intentError}
                  flight={selectedFlight}
                  intents={intentsQuery.data ?? []}
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
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Flight Sessions</p>
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
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="min-w-0 break-words font-medium text-chrome-950">{flight.missionName}</h2>
              <StatusBadge status={flightStatus(flight)} />
            </div>
            <p className="mt-1 text-sm text-chrome-700">{flight.siteName ?? 'No site assigned'}</p>
            <p className="mt-2 text-xs text-chrome-500">
              {formatOperatingProfile(flight.executionSummary?.executedOperatingProfile ?? flight.operatingProfile)}
            </p>
            <p className="mt-1 text-xs text-chrome-500">
              {formatExecutionMode(flight.executionSummary?.executionMode)} / {executionProgress(flight)}
            </p>
          </button>
        ))}
      </div>
    </Panel>
  )
}

function FlightSummaryPanel({ flight }: { flight: LiveFlightDetail }) {
  return (
    <Panel>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ember-500">Execution Summary</p>
          <h2 className="mt-2 break-words font-display text-3xl font-semibold text-chrome-950">
            {flight.missionName}
          </h2>
          <p className="mt-2 text-sm text-chrome-700">
            {flight.siteName ?? 'No site'} / Flight {flight.flightId}
          </p>
          <p className="mt-2 text-sm text-chrome-700">
            Planned {formatOperatingProfile(flight.executionSummary?.plannedOperatingProfile ?? flight.operatingProfile)}
            {' / '}
            Executed {formatOperatingProfile(flight.executionSummary?.executedOperatingProfile ?? flight.operatingProfile)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {flight.alerts.length === 0 ? (
            <span className="rounded-full bg-moss-300/40 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-moss-500">
              Healthy
            </span>
          ) : (
            flight.alerts.map((alert) => (
              <span
                key={alert}
                className="rounded-full bg-amber-100 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-amber-800"
              >
                {formatFlightAlert(alert)}
              </span>
            ))
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-4 xl:grid-cols-8">
        <Metric
          label="Battery"
          value={flight.latestTelemetry ? `${flight.latestTelemetry.batteryPct}%` : '--'}
          hint={flight.latestTelemetry ? formatFlightState(flight.latestTelemetry.flightState) : 'No telemetry'}
        />
        <Metric label="Altitude" value={flight.latestTelemetry ? `${flight.latestTelemetry.altitudeM.toFixed(1)} m` : '--'} />
        <Metric
          label="Ground Speed"
          value={flight.latestTelemetry ? `${flight.latestTelemetry.groundSpeedMps.toFixed(1)} m/s` : '--'}
        />
        <Metric label="Upload" value={formatUploadState(flight.executionSummary?.uploadState)} />
        <Metric label="State" value={formatExecutionState(flight.executionSummary?.executionState)} />
        <Metric label="Mode" value={formatExecutionMode(flight.executionSummary?.executionMode)} />
        <Metric label="Camera" value={formatCameraStreamState(flight.executionSummary?.cameraStreamState)} />
        <Metric label="Recording" value={formatRecordingState(flight.executionSummary?.recordingState)} />
      </div>
    </Panel>
  )
}

function FlightTelemetryPanel({ flight }: { flight: LiveFlightDetail }) {
  const execution = flight.executionSummary
  const rows = useMemo(
    () => [
      { label: 'Mission', value: flight.missionId },
      { label: 'Last Event', value: execution?.lastEventType ?? 'None' },
      { label: 'Last Event At', value: execution?.lastEventAt ? formatDate(execution.lastEventAt) : 'None' },
      { label: 'Progress', value: executionProgress(flight) },
      { label: 'Landing', value: formatLandingPhase(execution?.landingPhase) },
      { label: 'Fallback', value: execution?.fallbackReason ?? 'None' },
      { label: 'Status Note', value: execution?.statusNote ?? 'None' },
      { label: 'Telemetry Time', value: flight.latestTelemetry ? formatDate(flight.latestTelemetry.timestamp) : 'None' },
      {
        label: 'Deviation',
        value: flight.latestTelemetry ? `${flight.latestTelemetry.corridorDeviationM.toFixed(1)} m` : '--',
      },
    ],
    [execution, flight],
  )

  return (
    <Panel>
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Telemetry</p>
      <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">Execution Detail</h2>
      <div className="mt-4">
        <DataList rows={rows} />
      </div>
    </Panel>
  )
}

function VideoAndLeasePanel({ flight }: { flight: LiveFlightDetail }) {
  return (
    <div className="space-y-6">
      <Panel>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Camera</p>
        <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">Preview Channel</h2>
        <div className="mt-4">
          <DataList
            rows={[
              { label: 'Available', value: flight.video.available ? 'Yes' : 'No' },
              { label: 'Streaming', value: flight.video.streaming ? 'Yes' : 'No' },
              { label: 'Codec', value: flight.video.codec ?? 'Unknown' },
              {
                label: 'Latency',
                value: flight.video.latencyMs !== null ? `${flight.video.latencyMs} ms` : 'Unknown',
              },
              {
                label: 'Viewer',
                value: flight.video.viewerUrl ? (
                  <a href={flight.video.viewerUrl} target="_blank" rel="noreferrer" className="text-ember-600 underline underline-offset-4">
                    Open Stream
                  </a>
                ) : (
                  'No viewer URL'
                ),
              },
            ]}
          />
        </div>
      </Panel>

      <Panel>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Control Lease</p>
        <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">Remote Ops Status</h2>
        <div className="mt-4">
          <DataList
            rows={[
              { label: 'Holder', value: flight.controlLease.holder },
              { label: 'Mode', value: formatControlMode(flight.controlLease.mode) },
              { label: 'Remote', value: flight.controlLease.remoteControlEnabled ? 'Enabled' : 'Disabled' },
              { label: 'Observer', value: flight.controlLease.observerReady ? 'Ready' : 'Not Ready' },
              { label: 'Heartbeat', value: flight.controlLease.heartbeatHealthy ? 'Healthy' : 'Degraded' },
              {
                label: 'Expires',
                value: flight.controlLease.expiresAt ? formatDate(flight.controlLease.expiresAt) : 'No lease expiry',
              },
            ]}
          />
        </div>
      </Panel>
    </div>
  )
}

function ControlIntentPanel({
  canRequestControl,
  errorDetail,
  flight,
  intents,
  isPending,
  onRequestAction,
}: {
  canRequestControl: boolean
  errorDetail: string | null
  flight: LiveFlightDetail
  intents: Array<{
    requestId: string
    action: ControlIntentAction
    status: string
    reason: string | null
    createdAt: string
  }>
  isPending: boolean
  onRequestAction: (action: ControlIntentAction) => Promise<void>
}) {
  return (
    <Panel>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Control Intents</p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">Lease Requests</h2>
          <p className="mt-2 text-sm text-chrome-700">
            Control intents stay in the ops layer. They do not move stick authority into web.
          </p>
        </div>
        {canRequestControl ? (
          <div className="flex flex-wrap gap-2">
            {controlActions.map((item) => (
              <ActionButton
                key={item.action}
                type="button"
                variant="secondary"
                disabled={isPending}
                onClick={() => {
                  void onRequestAction(item.action)
                }}
              >
                {item.label}
              </ActionButton>
            ))}
          </div>
        ) : null}
      </div>
      {errorDetail ? <p className="mt-4 text-sm text-red-700">{errorDetail}</p> : null}
      <div className="mt-4 grid gap-3">
        <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
          <p className="font-medium text-chrome-950">{flight.missionName}</p>
          <p className="mt-2 text-sm text-chrome-700">
            Current lease mode: {formatControlMode(flight.controlLease.mode)}
          </p>
        </div>
        {intents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-chrome-300 bg-chrome-50/80 px-4 py-4 text-sm text-chrome-700">
            No control intents have been requested for this flight yet.
          </div>
        ) : (
          intents.map((intent) => (
            <div key={intent.requestId} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-medium text-chrome-950">{formatControlAction(intent.action)}</span>
                <StatusBadge status={intent.status} />
              </div>
              <p className="mt-2 text-sm text-chrome-700">{intent.reason ?? 'No reason provided.'}</p>
              <p className="mt-2 text-xs text-chrome-500">Created {formatDate(intent.createdAt)}</p>
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
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Recent Events</p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">Flight Event Trail</h2>
        </div>
        <Link to={`/missions/${flight.missionId}`} className="text-sm text-ember-600 underline underline-offset-4">
          Open Mission Detail
        </Link>
      </div>
      <div className="mt-4 grid gap-3">
        {flight.recentEvents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-chrome-300 bg-chrome-50/80 px-4 py-4 text-sm text-chrome-700">
            No recent events.
          </div>
        ) : (
          flight.recentEvents.map((event) => (
            <div key={event.eventId} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-medium text-chrome-950">{event.eventType}</span>
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-chrome-500">
                  {formatDate(event.eventTimestamp)}
                </span>
              </div>
              <pre className="mt-3 overflow-x-auto rounded-2xl bg-chrome-950 p-4 text-xs text-chrome-50">
                {JSON.stringify(event.payload, null, 2)}
              </pre>
            </div>
          ))
        )}
      </div>
    </Panel>
  )
}
