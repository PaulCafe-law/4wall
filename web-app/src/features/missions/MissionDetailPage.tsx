import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'

import {
  ActionButton,
  DataList,
  EmptyState,
  Panel,
  ShellSection,
  StatusBadge,
  formatDateTime,
} from '../../components/ui'
import { ApiError, api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAuthedMutation, useAuthedQuery } from '../../lib/auth-query'
import { formatApiError, formatSupportSeverity } from '../../lib/presentation'
import type { InspectionEvent, MissionArtifactDownload, MissionDetail } from '../../lib/types'

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`
  }
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
}

function deliveryHeadline(state: MissionDetail['delivery']['state']) {
  if (state === 'published') {
    return 'Mission artifacts published'
  }
  if (state === 'ready') {
    return 'Mission bundle ready'
  }
  if (state === 'failed') {
    return 'Mission delivery failed'
  }
  return 'Mission is still planning'
}

function deliveryMessage(mission: MissionDetail) {
  if (mission.delivery.state === 'published') {
    return 'Core mission artifacts are published and available for authenticated download.'
  }
  if (mission.delivery.state === 'ready') {
    return 'Planning completed, but the publish handoff has not run yet.'
  }
  if (mission.delivery.state === 'failed') {
    return mission.delivery.failureReason ?? 'The mission record failed before its artifact bundle could be published.'
  }
  return 'The route planner is still building the mission package.'
}

function reportStatusMessage(mission: MissionDetail) {
  if (mission.reportStatus === 'ready') {
    if (mission.eventCount === 0) {
      return mission.latestReport?.summary ?? 'Inspection analysis completed with no anomaly events. The report artifact can be used as a clean-pass handoff.'
    }
    return mission.latestReport?.summary ?? 'Inspection analysis completed and a report artifact is available.'
  }
  if (mission.reportStatus === 'failed') {
    return mission.latestReport?.summary ?? 'The analysis pipeline failed to generate a usable report.'
  }
  if (mission.reportStatus === 'generating' || mission.reportStatus === 'queued') {
    return 'Analysis has started but report generation is not finished yet.'
  }
  return 'No inspection report has been generated for this mission yet.'
}

function nextStepSummary(mission: MissionDetail) {
  if (mission.reportStatus === 'ready') {
    if (mission.eventCount === 0) {
      return 'Use the HTML report as the clean inspection handoff and keep the mission as a no-findings example in the demo flow.'
    }
    return 'Review the event list, open the evidence artifacts, and export the HTML report for stakeholder handoff.'
  }
  if (mission.reportStatus === 'failed') {
    return 'Use the internal reprocess controls to regenerate the demo report or simulate a no-findings pass.'
  }
  if (mission.delivery.state === 'published') {
    return 'Artifacts are ready. The next step is to generate or review the inspection report.'
  }
  if (mission.delivery.state === 'failed') {
    return 'Resolve mission delivery first. Reporting should not be trusted until the mission bundle is available.'
  }
  return 'Wait for the planning and publish steps to finish before generating the inspection report.'
}

function eventCardClass(severity: InspectionEvent['severity']) {
  if (severity === 'critical') {
    return 'rounded-2xl border border-red-200 bg-red-50/80 px-4 py-4'
  }
  if (severity === 'warning') {
    return 'rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-4'
  }
  return 'rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4'
}

export function MissionDetailPage() {
  const { missionId = '' } = useParams()
  const auth = useAuth()
  const queryClient = useQueryClient()
  const [analysisNotice, setAnalysisNotice] = useState<string | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [artifactError, setArtifactError] = useState<string | null>(null)

  const missionQuery = useAuthedQuery({
    queryKey: ['mission', missionId],
    queryFn: (token) => api.getMission(token, missionId),
    enabled: Boolean(missionId),
  })

  const reprocessAnalysis = useAuthedMutation({
    mutationKey: ['mission', missionId, 'analysis', 'reprocess'],
    mutationFn: ({ token, payload }: { token: string; payload: Parameters<typeof api.reprocessMissionAnalysis>[2] }) =>
      api.reprocessMissionAnalysis(token, missionId, payload),
    onSuccess: async (_report, payload) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mission', missionId] }),
        queryClient.invalidateQueries({ queryKey: ['missions'] }),
        queryClient.invalidateQueries({ queryKey: ['missions', 'control-plane'] }),
        queryClient.invalidateQueries({ queryKey: ['web-overview'] }),
      ])
      setAnalysisError(null)
      setAnalysisNotice(
        payload.mode === 'analysis_failed'
          ? 'Recorded a demo analysis failure state for this mission.'
          : payload.mode === 'no_findings'
            ? 'Generated a clean no-findings demo report.'
            : 'Generated demo events, evidence artifacts, and an inspection report.',
      )
    },
  })

  async function openArtifact(
    artifact: MissionArtifactDownload | { artifactName: string; downloadUrl: string },
    mode: 'open' | 'download',
  ) {
    if (!auth.session?.accessToken) {
      setArtifactError('Session expired before the artifact request could be sent.')
      return
    }

    try {
      setArtifactError(null)
      const blob = await api.fetchArtifactBlob(auth.session.accessToken, artifact.downloadUrl)
      const objectUrl = window.URL.createObjectURL(blob)
      if (mode === 'download') {
        const link = document.createElement('a')
        link.href = objectUrl
        link.download = artifact.artifactName
        link.click()
      } else {
        window.open(objectUrl, '_blank', 'noopener,noreferrer')
      }
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60_000)
    } catch (error) {
      const detail = error instanceof ApiError ? error.detail : undefined
      setArtifactError(formatApiError(detail, `Unable to ${mode === 'download' ? 'download' : 'open'} artifact.`))
    }
  }

  async function handleReprocess(mode: 'normal' | 'no_findings' | 'analysis_failed') {
    try {
      setAnalysisNotice(null)
      setAnalysisError(null)
      await reprocessAnalysis.mutateAsync({ mode })
    } catch (error) {
      const detail = error instanceof ApiError ? error.detail : undefined
      setAnalysisError(formatApiError(detail, 'Unable to reprocess mission analysis.'))
    }
  }

  if (!missionId) {
    return (
      <EmptyState
        title="Mission id is missing"
        body="Open this page from the mission index so the mission, reporting, and artifact records can be loaded together."
      />
    )
  }

  if (missionQuery.isLoading) {
    return (
      <Panel>
        <p className="text-sm text-chrome-700">Loading mission detail and reporting context...</p>
      </Panel>
    )
  }

  if (!missionQuery.data) {
    return (
      <EmptyState
        title="Mission detail is unavailable"
        body="This mission could not be loaded. Verify the mission id and the current organization scope."
      />
    )
  }

  const mission = missionQuery.data
  const coreArtifacts = mission.artifacts.filter((artifact) =>
    ['mission.kmz', 'mission_meta.json', 'inspection_report.html'].includes(artifact.artifactName),
  )
  const latestReportArtifact = mission.latestReport?.downloadArtifact ?? null

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="Mission detail"
        title={mission.missionName}
        subtitle="Review planning metadata, demo analysis output, evidence artifacts, and the downloadable inspection report from one mission record."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={mission.status} />
            <StatusBadge status={mission.delivery.state} />
            <StatusBadge status={mission.reportStatus} />
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Panel>
            <DataList
              rows={[
                { label: 'Mission id', value: mission.missionId },
                { label: 'Organization', value: mission.organizationId ?? 'Not linked' },
                { label: 'Site', value: mission.siteId ?? 'Not linked' },
                { label: 'Bundle', value: mission.bundleVersion },
                { label: 'Created', value: formatDateTime(mission.createdAt) },
                { label: 'Event count', value: mission.eventCount },
              ]}
            />
          </Panel>

          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Reporting</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">Inspection analysis and report</h2>
            <p className="mt-2 text-sm text-chrome-700">{reportStatusMessage(mission)}</p>
            <div className="mt-4">
              <DataList
                rows={[
                  { label: 'Report status', value: <StatusBadge status={mission.reportStatus} /> },
                  {
                    label: 'Generated',
                    value: mission.reportGeneratedAt ? formatDateTime(mission.reportGeneratedAt) : 'Not generated yet',
                  },
                  { label: 'Event count', value: mission.eventCount },
                  {
                    label: 'Report artifact',
                    value: mission.latestReport?.downloadArtifact?.artifactName ?? 'No report artifact yet',
                  },
                ]}
              />
            </div>

            {analysisNotice ? (
              <div className="mt-4 rounded-2xl border border-moss-200 bg-moss-50/70 px-4 py-3 text-sm text-moss-900">
                {analysisNotice}
              </div>
            ) : null}
            {analysisError ? (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {analysisError}
              </div>
            ) : null}

            {auth.isInternal ? (
              <div className="mt-5 flex flex-wrap gap-2">
                <ActionButton onClick={() => void handleReprocess('normal')} disabled={reprocessAnalysis.isPending}>
                  {reprocessAnalysis.isPending ? 'Reprocessing...' : 'Generate demo findings'}
                </ActionButton>
                <ActionButton
                  variant="secondary"
                  onClick={() => void handleReprocess('no_findings')}
                  disabled={reprocessAnalysis.isPending}
                >
                  Generate clean report
                </ActionButton>
                <ActionButton
                  variant="ghost"
                  onClick={() => void handleReprocess('analysis_failed')}
                  disabled={reprocessAnalysis.isPending}
                >
                  Simulate analysis failure
                </ActionButton>
              </div>
            ) : null}

            {latestReportArtifact ? (
              <div className="mt-5 flex flex-wrap gap-2">
                <ActionButton variant="secondary" onClick={() => void openArtifact(latestReportArtifact, 'open')}>
                  Open report artifact
                </ActionButton>
                <ActionButton variant="ghost" onClick={() => void openArtifact(latestReportArtifact, 'download')}>
                  Download report
                </ActionButton>
              </div>
            ) : null}
          </Panel>

          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Evidence gallery</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">Detected events</h2>
            <div className="mt-4 grid gap-4">
              {mission.events.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-chrome-300 bg-chrome-50/70 px-4 py-6">
                  <p className="font-medium text-chrome-950">No inspection events recorded</p>
                  <p className="mt-2 text-sm text-chrome-700">
                    {mission.reportStatus === 'ready'
                      ? 'This mission currently represents a clean inspection pass. Use the report artifact as the no-findings handoff.'
                      : mission.reportStatus === 'failed'
                        ? 'Reporting failed before any evidence artifacts could be generated. Rerun the demo analysis from the internal controls.'
                        : 'Generate a demo report to create anomaly events and evidence artifacts, or keep the mission as a clean pass.'}
                  </p>
                </div>
              ) : (
                mission.events.map((event) => (
                  <div key={event.eventId} className={eventCardClass(event.severity)}>
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="font-medium capitalize text-chrome-950">{event.category.replaceAll('_', ' ')}</p>
                      <StatusBadge status={event.status} />
                      <span className="rounded-full bg-white/80 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-chrome-700">
                        {formatSupportSeverity(event.severity)}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-chrome-800">{event.summary}</p>
                    <p className="mt-2 text-xs text-chrome-600">Detected {formatDateTime(event.detectedAt)}</p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {event.evidenceArtifacts.map((artifact) => (
                        <ActionButton
                          key={artifact.artifactName}
                          variant="secondary"
                          onClick={() => void openArtifact(artifact, 'open')}
                        >
                          Open {artifact.artifactName}
                        </ActionButton>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Panel>

          {mission.route || mission.template || mission.schedule || mission.dispatch ? (
            <Panel>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Control plane</p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">Linked planning metadata</h2>
              <div className="mt-4">
                <DataList
                  rows={[
                    { label: 'Route', value: mission.route?.name ?? 'Not linked' },
                    { label: 'Route points', value: mission.route ? mission.route.pointCount : 'Not linked' },
                    { label: 'Template', value: mission.template?.name ?? 'Not linked' },
                    { label: 'Schedule', value: mission.schedule?.status ?? 'Not linked' },
                    {
                      label: 'Planned at',
                      value: mission.schedule?.plannedAt ? formatDateTime(mission.schedule.plannedAt) : 'Not scheduled',
                    },
                    { label: 'Dispatch', value: mission.dispatch?.status ?? 'Not dispatched' },
                    { label: 'Assignee', value: mission.dispatch?.assignee ?? 'Not set' },
                    { label: 'Target', value: mission.dispatch?.executionTarget ?? 'Not set' },
                  ]}
                />
              </div>
            </Panel>
          ) : null}

          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Raw mission contract</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">Planner request and response</h2>
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <pre className="overflow-x-auto rounded-2xl bg-chrome-950 p-4 text-xs text-chrome-50">
                {JSON.stringify(mission.request, null, 2)}
              </pre>
              <pre className="overflow-x-auto rounded-2xl bg-chrome-950 p-4 text-xs text-chrome-50">
                {JSON.stringify(mission.response, null, 2)}
              </pre>
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Delivery</p>
            <h2 className="mt-3 font-display text-2xl font-semibold text-chrome-950">
              {deliveryHeadline(mission.delivery.state)}
            </h2>
            <p className="mt-2 text-sm text-chrome-700">{deliveryMessage(mission)}</p>
            <div className="mt-4">
              <DataList
                rows={[
                  { label: 'Delivery', value: <StatusBadge status={mission.delivery.state} /> },
                  {
                    label: 'Published',
                    value: mission.delivery.publishedAt ? formatDateTime(mission.delivery.publishedAt) : 'Not published yet',
                  },
                  {
                    label: 'Failure reason',
                    value: mission.delivery.failureReason ?? 'No mission-level delivery failure recorded',
                  },
                ]}
              />
            </div>
            <div className="mt-4 rounded-2xl border border-chrome-200 bg-chrome-50/80 px-4 py-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Next step</p>
              <p className="mt-2 text-sm text-chrome-700">{nextStepSummary(mission)}</p>
            </div>
          </Panel>

          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Artifacts</p>
            <div className="mt-4 space-y-3">
              {coreArtifacts.map((artifact) => (
                <div key={artifact.artifactName} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-medium text-chrome-950">{artifact.artifactName}</p>
                    <StatusBadge
                      status={artifact.artifactName === 'inspection_report.html' ? mission.reportStatus : mission.delivery.state}
                    />
                  </div>
                  <p className="mt-2 text-xs text-chrome-600">
                    v{artifact.version} | {formatBytes(artifact.sizeBytes)} | {artifact.contentType}
                  </p>
                  <p className="mt-1 text-xs text-chrome-600">Published {formatDateTime(artifact.publishedAt)}</p>
                  <p className="mt-1 break-all text-xs text-chrome-600">sha256 {artifact.checksumSha256}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <ActionButton variant="secondary" onClick={() => void openArtifact(artifact, 'open')}>
                      Open
                    </ActionButton>
                    <ActionButton variant="ghost" onClick={() => void openArtifact(artifact, 'download')}>
                      Download
                    </ActionButton>
                  </div>
                </div>
              ))}
              {artifactError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {artifactError}
                </div>
              ) : null}
            </div>
          </Panel>

          <div className="flex justify-end">
            <Link to="/missions" className="rounded-full border border-chrome-300 px-4 py-2 text-sm text-chrome-800">
              Back to missions
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
