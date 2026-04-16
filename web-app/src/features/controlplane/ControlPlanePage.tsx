import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'

import {
  ActionButton,
  DataList,
  EmptyState,
  Field,
  Input,
  Metric,
  Panel,
  Select,
  ShellSection,
  StatusBadge,
  TextArea,
  formatDateTime,
} from '../../components/ui'
import { api, ApiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAuthedMutation, useAuthedQuery } from '../../lib/auth-query'
import { formatApiError } from '../../lib/presentation'
import type { MissionDetail, Site } from '../../lib/types'

const DEFAULT_ROUTE_OFFSET = 0.00018

function buildDemoWaypoints(site: Site, transitAltitudeM: number, inspectionAltitudeM: number, dwellSeconds: number) {
  return [
    {
      kind: 'transit' as const,
      lat: site.location.lat - DEFAULT_ROUTE_OFFSET,
      lng: site.location.lng - DEFAULT_ROUTE_OFFSET,
      altitudeM: transitAltitudeM,
      label: `${site.name} ingress`,
      headingDeg: 45,
      dwellSeconds: 0,
    },
    {
      kind: 'inspection_viewpoint' as const,
      lat: site.location.lat,
      lng: site.location.lng,
      altitudeM: inspectionAltitudeM,
      label: `${site.name} facade sweep`,
      headingDeg: 180,
      dwellSeconds,
    },
    {
      kind: 'hold' as const,
      lat: site.location.lat + DEFAULT_ROUTE_OFFSET,
      lng: site.location.lng + DEFAULT_ROUTE_OFFSET,
      altitudeM: transitAltitudeM,
      label: `${site.name} egress hold`,
      headingDeg: 0,
      dwellSeconds: Math.max(5, Math.floor(dwellSeconds / 2)),
    },
  ]
}

function defaultAlertRules() {
  return [
    { kind: 'mission_failure' as const, enabled: true, note: 'Flag dispatch or mission execution failures.' },
    { kind: 'analysis_failure' as const, enabled: true, note: 'Flag event-analysis pipeline failures.' },
    { kind: 'report_generation_failure' as const, enabled: true, note: 'Flag report rendering failures.' },
  ]
}

function recurrenceLabel(value: string) {
  if (!value) {
    return 'One-off'
  }
  return value
}

type RehearsalStep = {
  key: string
  title: string
  status: string
  body: string
  to: string
  actionLabel: string
}

type EvidencePrompt = {
  title: string
  body: string
}

function buildRehearsalSteps({
  selectedSite,
  routesCount,
  templatesCount,
  schedulesCount,
  missionDetail,
}: {
  selectedSite: Site | null
  routesCount: number
  templatesCount: number
  schedulesCount: number
  missionDetail: MissionDetail | null
}): RehearsalStep[] {
  const missionReportStatus = missionDetail?.reportStatus ?? 'planning'
  const reportBody =
    missionDetail == null
      ? 'Select a mission to load linked dispatch, event, and report context.'
      : missionDetail.reportStatus === 'ready'
        ? missionDetail.eventCount === 0
          ? 'A clean-pass report is available. Use it as the no-findings handoff in the demo.'
          : 'An event-backed report is available with evidence artifacts and stakeholder-ready summary text.'
        : missionDetail.reportStatus === 'failed'
          ? missionDetail.latestReport?.summary ?? 'The selected mission is currently demonstrating a report-generation failure.'
          : 'The selected mission still needs report generation before the walkthrough is complete.'

  return [
    {
      key: 'site',
      title: 'Site context is selected',
      status: selectedSite ? 'ready' : 'failed',
      body: selectedSite
        ? `${selectedSite.name} is the current site-map anchor for the demo walkthrough.`
        : 'Select a site before starting the route-to-report rehearsal.',
      to: '/sites',
      actionLabel: 'Open sites',
    },
    {
      key: 'route',
      title: 'Route and template are ready',
      status: routesCount > 0 && templatesCount > 0 ? 'ready' : 'planning',
      body:
        routesCount > 0 && templatesCount > 0
          ? `${routesCount} route(s) and ${templatesCount} template(s) are available for rehearsal.`
          : 'Create at least one route and one template so the mission can show repeatable planning metadata.',
      to: '/control-plane',
      actionLabel: 'Review planning assets',
    },
    {
      key: 'schedule',
      title: 'Schedule is attached',
      status: schedulesCount > 0 ? 'ready' : 'planning',
      body:
        schedulesCount > 0
          ? `${schedulesCount} schedule record(s) are available for route-to-dispatch playback.`
          : 'Create a schedule so the demo can show when the inspection run was intended to execute.',
      to: '/control-plane',
      actionLabel: 'Review schedules',
    },
    {
      key: 'dispatch',
      title: 'Mission dispatch is linked',
      status: missionDetail?.dispatch ? 'ready' : 'planning',
      body: missionDetail?.dispatch
        ? `Mission ${missionDetail.missionName} has dispatch metadata for ${missionDetail.dispatch.executionTarget ?? 'the field team'}.`
        : 'Dispatch the selected mission so mission detail can show route, template, schedule, and assignee together.',
      to: missionDetail ? `/missions/${missionDetail.missionId}` : '/missions',
      actionLabel: missionDetail ? 'Open mission detail' : 'Open missions',
    },
    {
      key: 'report',
      title: 'Event and report output is ready',
      status: missionReportStatus === 'not_started' ? 'planning' : missionReportStatus,
      body: reportBody,
      to: missionDetail ? `/missions/${missionDetail.missionId}` : '/missions',
      actionLabel: missionDetail ? 'Review report output' : 'Select mission',
    },
  ]
}

function buildEvidencePrompts({
  missionDetail,
  isInternal,
}: {
  missionDetail: MissionDetail | null
  isInternal: boolean
}): EvidencePrompt[] {
  const prompts: EvidencePrompt[] = [
    {
      title: 'Capture the site and planning context',
      body: 'Take one screenshot showing the selected site, route card, template card, and schedule card in the control-plane page.',
    },
    {
      title: 'Capture dispatch linkage',
      body: missionDetail?.dispatch
        ? 'Take one screenshot of mission detail showing linked route, template, schedule, and dispatch metadata.'
        : 'After dispatching a mission, capture mission detail with linked route, template, schedule, and dispatch metadata.',
    },
    {
      title: 'Capture report output',
      body:
        missionDetail?.reportStatus === 'ready'
          ? missionDetail.eventCount === 0
            ? 'Capture the clean-pass report summary and the downloadable HTML report artifact.'
            : 'Capture the event list, evidence gallery, and the downloadable HTML report artifact.'
          : 'Capture one report-failed or pending state before rerunning analysis, then capture the recovered report output.',
    },
  ]

  if (isInternal) {
    prompts.push({
      title: 'Capture internal ops alignment',
      body: 'Capture one report-failed mission in Support and Live Ops so the internal monitoring story matches mission detail.',
    })
  }

  return prompts
}

export function ControlPlanePage() {
  const auth = useAuth()
  const queryClient = useQueryClient()
  const [selectedSiteId, setSelectedSiteId] = useState('')
  const [routeName, setRouteName] = useState('')
  const [routeDescription, setRouteDescription] = useState('')
  const [transitAltitudeM, setTransitAltitudeM] = useState('40')
  const [inspectionAltitudeM, setInspectionAltitudeM] = useState('32')
  const [dwellSeconds, setDwellSeconds] = useState('18')
  const [routeError, setRouteError] = useState<string | null>(null)

  const [templateName, setTemplateName] = useState('')
  const [templateDescription, setTemplateDescription] = useState('')
  const [templateRouteId, setTemplateRouteId] = useState('')
  const [inspectionProfile, setInspectionProfile] = useState('facade-standard')
  const [templateError, setTemplateError] = useState<string | null>(null)

  const [scheduleRouteId, setScheduleRouteId] = useState('')
  const [scheduleTemplateId, setScheduleTemplateId] = useState('')
  const [plannedAt, setPlannedAt] = useState('')
  const [recurrence, setRecurrence] = useState('')
  const [scheduleStatus, setScheduleStatus] = useState<'scheduled' | 'paused'>('scheduled')
  const [scheduleError, setScheduleError] = useState<string | null>(null)

  const [dispatchMissionId, setDispatchMissionId] = useState('')
  const [dispatchRouteId, setDispatchRouteId] = useState('')
  const [dispatchTemplateId, setDispatchTemplateId] = useState('')
  const [dispatchScheduleId, setDispatchScheduleId] = useState('')
  const [dispatchAssignee, setDispatchAssignee] = useState('')
  const [dispatchTarget, setDispatchTarget] = useState('field-team')
  const [dispatchStatus, setDispatchStatus] = useState<'queued' | 'assigned' | 'sent' | 'accepted'>('queued')
  const [dispatchNote, setDispatchNote] = useState('')
  const [dispatchError, setDispatchError] = useState<string | null>(null)
  const [lastDispatchId, setLastDispatchId] = useState<string | null>(null)

  const sitesQuery = useAuthedQuery({
    queryKey: ['sites', 'control-plane'],
    queryFn: api.listSites,
    staleTime: 20_000,
  })
  const routesQuery = useAuthedQuery({
    queryKey: ['inspection', 'routes'],
    queryFn: (token) => api.listInspectionRoutes(token),
    staleTime: 10_000,
  })
  const templatesQuery = useAuthedQuery({
    queryKey: ['inspection', 'templates'],
    queryFn: (token) => api.listInspectionTemplates(token),
    staleTime: 10_000,
  })
  const schedulesQuery = useAuthedQuery({
    queryKey: ['inspection', 'schedules'],
    queryFn: (token) => api.listInspectionSchedules(token),
    staleTime: 10_000,
  })
  const missionsQuery = useAuthedQuery({
    queryKey: ['missions', 'control-plane'],
    queryFn: api.listMissions,
    staleTime: 10_000,
  })

  const sites = sitesQuery.data ?? []
  const effectiveSelectedSiteId =
    sites.find((site) => site.siteId === selectedSiteId)?.siteId ?? sites[0]?.siteId ?? ''
  const selectedSite = sites.find((site) => site.siteId === effectiveSelectedSiteId) ?? null
  const canWriteSelectedSite = selectedSite ? auth.canWriteOrganization(selectedSite.organizationId) : false

  const routes = (routesQuery.data ?? []).filter((route) => !effectiveSelectedSiteId || route.siteId === effectiveSelectedSiteId)
  const templates = (templatesQuery.data ?? []).filter(
    (template) => !effectiveSelectedSiteId || template.siteId === effectiveSelectedSiteId,
  )
  const schedules = (schedulesQuery.data ?? []).filter(
    (schedule) => !effectiveSelectedSiteId || schedule.siteId === effectiveSelectedSiteId,
  )
  const missions = (missionsQuery.data ?? []).filter(
    (mission) => !effectiveSelectedSiteId || mission.siteId === effectiveSelectedSiteId,
  )
  const effectiveTemplateRouteId =
    routes.find((route) => route.routeId === templateRouteId)?.routeId ?? routes[0]?.routeId ?? ''
  const effectiveScheduleRouteId =
    routes.find((route) => route.routeId === scheduleRouteId)?.routeId ?? routes[0]?.routeId ?? ''
  const effectiveScheduleTemplateId =
    templates.find((template) => template.templateId === scheduleTemplateId)?.templateId ??
    templates[0]?.templateId ??
    ''
  const effectiveDispatchMissionId =
    missions.find((mission) => mission.missionId === dispatchMissionId)?.missionId ?? missions[0]?.missionId ?? ''
  const effectiveDispatchRouteId =
    routes.find((route) => route.routeId === dispatchRouteId)?.routeId ?? routes[0]?.routeId ?? ''
  const effectiveDispatchTemplateId =
    templates.find((template) => template.templateId === dispatchTemplateId)?.templateId ??
    templates[0]?.templateId ??
    ''
  const effectiveDispatchScheduleId =
    schedules.find((schedule) => schedule.scheduleId === dispatchScheduleId)?.scheduleId ??
    schedules[0]?.scheduleId ??
    ''
  const selectedMissionDetailQuery = useAuthedQuery({
    queryKey: ['mission', effectiveDispatchMissionId, 'control-plane'],
    queryFn: (token) => api.getMission(token, effectiveDispatchMissionId),
    enabled: Boolean(effectiveDispatchMissionId),
    staleTime: 10_000,
  })
  const selectedMissionDetail = selectedMissionDetailQuery.data ?? null
  const rehearsalSteps = buildRehearsalSteps({
    selectedSite,
    routesCount: routes.length,
    templatesCount: templates.length,
    schedulesCount: schedules.length,
    missionDetail: selectedMissionDetail,
  })
  const evidencePrompts = buildEvidencePrompts({
    missionDetail: selectedMissionDetail,
    isInternal: auth.isInternal,
  })

  const createRoute = useAuthedMutation({
    mutationKey: ['inspection', 'routes', 'create'],
    mutationFn: ({ token, payload }: { token: string; payload: Parameters<typeof api.createInspectionRoute>[1] }) =>
      api.createInspectionRoute(token, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['inspection', 'routes'] })
      setRouteName('')
      setRouteDescription('')
      setRouteError(null)
    },
  })
  const createTemplate = useAuthedMutation({
    mutationKey: ['inspection', 'templates', 'create'],
    mutationFn: ({ token, payload }: { token: string; payload: Parameters<typeof api.createInspectionTemplate>[1] }) =>
      api.createInspectionTemplate(token, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['inspection', 'templates'] })
      setTemplateName('')
      setTemplateDescription('')
      setTemplateError(null)
    },
  })
  const createSchedule = useAuthedMutation({
    mutationKey: ['inspection', 'schedules', 'create'],
    mutationFn: ({ token, payload }: { token: string; payload: Parameters<typeof api.createInspectionSchedule>[1] }) =>
      api.createInspectionSchedule(token, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['inspection', 'schedules'] })
      setScheduleError(null)
      setPlannedAt('')
      setRecurrence('')
    },
  })
  const dispatchMission = useAuthedMutation({
    mutationKey: ['inspection', 'dispatch'],
    mutationFn: ({ token, payload }: { token: string; payload: { missionId: string; body: Parameters<typeof api.dispatchMission>[2] } }) =>
      api.dispatchMission(token, payload.missionId, payload.body),
    onSuccess: async (dispatch) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['missions'] }),
        queryClient.invalidateQueries({ queryKey: ['missions', 'control-plane'] }),
        queryClient.invalidateQueries({ queryKey: ['mission', dispatch.missionId] }),
        queryClient.invalidateQueries({ queryKey: ['web', 'overview'] }),
      ])
      setLastDispatchId(dispatch.dispatchId)
      setDispatchError(null)
    },
  })

  async function handleCreateRoute() {
    if (!selectedSite) {
      setRouteError('Select a site before creating a route.')
      return
    }
    if (!routeName.trim()) {
      setRouteError('Route name is required.')
      return
    }
    try {
      await createRoute.mutateAsync({
        organizationId: selectedSite.organizationId,
        siteId: selectedSite.siteId,
        name: routeName.trim(),
        description: routeDescription.trim(),
        waypoints: buildDemoWaypoints(
          selectedSite,
          Number.parseFloat(transitAltitudeM) || 40,
          Number.parseFloat(inspectionAltitudeM) || 32,
          Number.parseInt(dwellSeconds, 10) || 18,
        ),
        planningParameters: {
          transitAltitudeM: Number.parseFloat(transitAltitudeM) || 40,
          inspectionAltitudeM: Number.parseFloat(inspectionAltitudeM) || 32,
          dwellSeconds: Number.parseInt(dwellSeconds, 10) || 18,
          routeMode: 'site-envelope-demo',
        },
      })
    } catch (error) {
      const detail = error instanceof ApiError ? error.detail : undefined
      setRouteError(formatApiError(detail, 'Unable to create inspection route.'))
    }
  }

  async function handleCreateTemplate() {
    if (!selectedSite) {
      setTemplateError('Select a site before creating a template.')
      return
    }
    if (!templateName.trim()) {
      setTemplateError('Template name is required.')
      return
    }
    try {
      await createTemplate.mutateAsync({
        organizationId: selectedSite.organizationId,
        siteId: selectedSite.siteId,
        routeId: effectiveTemplateRouteId || undefined,
        name: templateName.trim(),
        description: templateDescription.trim(),
        inspectionProfile: {
          profile: inspectionProfile,
          reviewMode: 'operator-reviewed',
        },
        alertRules: defaultAlertRules(),
      })
    } catch (error) {
      const detail = error instanceof ApiError ? error.detail : undefined
      setTemplateError(formatApiError(detail, 'Unable to create inspection template.'))
    }
  }

  async function handleCreateSchedule() {
    if (!selectedSite) {
      setScheduleError('Select a site before creating a schedule.')
      return
    }
    try {
      await createSchedule.mutateAsync({
        organizationId: selectedSite.organizationId,
        siteId: selectedSite.siteId,
        routeId: effectiveScheduleRouteId || undefined,
        templateId: effectiveScheduleTemplateId || undefined,
        plannedAt: plannedAt ? new Date(plannedAt).toISOString() : undefined,
        recurrence: recurrence.trim() || undefined,
        status: scheduleStatus,
        alertRules: defaultAlertRules(),
      })
    } catch (error) {
      const detail = error instanceof ApiError ? error.detail : undefined
      setScheduleError(formatApiError(detail, 'Unable to create inspection schedule.'))
    }
  }

  async function handleDispatchMission() {
    if (!effectiveDispatchMissionId) {
      setDispatchError('Select a mission before dispatching.')
      return
    }
    try {
      await dispatchMission.mutateAsync({
        missionId: effectiveDispatchMissionId,
        body: {
          routeId: effectiveDispatchRouteId || undefined,
          templateId: effectiveDispatchTemplateId || undefined,
          scheduleId: effectiveDispatchScheduleId || undefined,
          assignee: dispatchAssignee.trim() || undefined,
          executionTarget: dispatchTarget.trim() || undefined,
          status: dispatchStatus,
          note: dispatchNote.trim() || undefined,
        },
      })
    } catch (error) {
      const detail = error instanceof ApiError ? error.detail : undefined
      setDispatchError(formatApiError(detail, 'Unable to create mission dispatch.'))
    }
  }

  if (sitesQuery.isLoading && !sitesQuery.data) {
    return (
      <Panel>
        <p className="text-sm text-chrome-700">Loading control plane context...</p>
      </Panel>
    )
  }

  if (!selectedSite) {
    return (
      <EmptyState
        title="No sites available for control-plane setup"
        body="Create a site first. The control plane uses the site record as the map and execution context for routes, schedules, and dispatch."
        action={
          <Link
            to="/sites"
            className="inline-flex rounded-full border border-chrome-300 bg-white px-4 py-2 text-sm text-chrome-950"
          >
            Open sites
          </Link>
        }
      />
    )
  }

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="Inspection control plane"
        title="Control Plane"
        subtitle="Plan routes, create reusable inspection templates, schedule recurring work, and dispatch mission records without introducing any live flight-control path."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Metric label="Sites" value={sites.length} />
        <Metric label="Routes" value={routes.length} />
        <Metric label="Templates" value={templates.length} />
        <Metric label="Schedules" value={schedules.length} />
        <Metric label="Missions" value={missions.length} />
        <Metric label="Mode" value={canWriteSelectedSite ? 'Writable' : 'Read only'} />
      </div>

      <Panel>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <div className="space-y-3">
            <Field label="Site context">
              <Select value={effectiveSelectedSiteId} onChange={(event) => setSelectedSiteId(event.target.value)}>
                {sites.map((site) => (
                  <option key={site.siteId} value={site.siteId}>
                    {site.name}
                  </option>
                ))}
              </Select>
            </Field>
            {!canWriteSelectedSite ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                This site is read-only for your current role. Customer viewers and read-only support access can inspect control-plane metadata but cannot change it.
              </div>
            ) : null}
          </div>
          <DataList
            rows={[
              { label: 'Address', value: selectedSite.address },
              {
                label: 'Coordinates',
                value: `${selectedSite.location.lat.toFixed(5)}, ${selectedSite.location.lng.toFixed(5)}`,
              },
              { label: 'External ref', value: selectedSite.externalRef ?? 'Not set' },
              { label: 'Notes', value: selectedSite.notes || 'No site notes yet.' },
            ]}
          />
        </div>
      </Panel>

      <Panel>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Demo rehearsal</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">Route-to-report walkthrough</h2>
            <p className="mt-2 text-sm text-chrome-700">
              Use this panel to rehearse the exact story: site, route, schedule, dispatch, mission detail, event output,
              and report artifact. It is intentionally monitor-only and planning-oriented.
            </p>
            <div className="mt-4 space-y-3">
              {rehearsalSteps.map((step) => (
                <div key={step.key} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="font-medium text-chrome-950">{step.title}</p>
                        <StatusBadge status={step.status} />
                      </div>
                      <p className="mt-2 text-sm text-chrome-700">{step.body}</p>
                    </div>
                    <Link
                      to={step.to}
                      className="inline-flex rounded-full border border-chrome-300 bg-white px-4 py-2 text-sm text-chrome-950"
                    >
                      {step.actionLabel}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-chrome-200 bg-chrome-50/80 px-4 py-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Selected mission</p>
              <p className="mt-2 font-medium text-chrome-950">
                {selectedMissionDetail ? selectedMissionDetail.missionName : 'No mission selected yet'}
              </p>
              <p className="mt-2 text-sm text-chrome-700">
                {selectedMissionDetail
                  ? `Report ${selectedMissionDetail.reportStatus} | ${selectedMissionDetail.eventCount} event${selectedMissionDetail.eventCount === 1 ? '' : 's'} | Dispatch ${selectedMissionDetail.dispatch?.status ?? 'not linked'}`
                  : 'Select or create a mission so the walkthrough can verify linked planning metadata and report output.'}
              </p>
              {selectedMissionDetailQuery.isLoading ? (
                <p className="mt-2 text-xs text-chrome-500">Loading mission playback state...</p>
              ) : null}
            </div>

            <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Evidence to capture</p>
              <div className="mt-4 space-y-3">
                {evidencePrompts.map((prompt) => (
                  <div key={prompt.title} className="rounded-2xl border border-chrome-200 bg-chrome-50/70 px-4 py-4">
                    <p className="font-medium text-chrome-950">{prompt.title}</p>
                    <p className="mt-2 text-sm text-chrome-700">{prompt.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Route slice</p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">Create inspection route</h2>
          <p className="mt-2 text-sm text-chrome-700">
            This slice generates a demo-safe route envelope from the selected site. It produces route metadata only.
          </p>
          <div className="mt-4 grid gap-4">
            <Field label="Route name">
              <Input value={routeName} onChange={(event) => setRouteName(event.target.value)} />
            </Field>
            <Field label="Description">
              <TextArea value={routeDescription} onChange={(event) => setRouteDescription(event.target.value)} />
            </Field>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Transit altitude (m)">
                <Input value={transitAltitudeM} onChange={(event) => setTransitAltitudeM(event.target.value)} type="number" />
              </Field>
              <Field label="Inspection altitude (m)">
                <Input value={inspectionAltitudeM} onChange={(event) => setInspectionAltitudeM(event.target.value)} type="number" />
              </Field>
              <Field label="Dwell seconds">
                <Input value={dwellSeconds} onChange={(event) => setDwellSeconds(event.target.value)} type="number" />
              </Field>
            </div>
            {routeError ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{routeError}</div> : null}
            <div className="flex justify-end">
              <ActionButton disabled={!canWriteSelectedSite || createRoute.isPending} onClick={() => void handleCreateRoute()}>
                {createRoute.isPending ? 'Creating route...' : 'Create route'}
              </ActionButton>
            </div>
          </div>
        </Panel>

        <Panel>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Template slice</p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">Create inspection template</h2>
          <p className="mt-2 text-sm text-chrome-700">
            Templates lock the inspection profile and alert rules for repeatable demo runs.
          </p>
          <div className="mt-4 grid gap-4">
            <Field label="Template name">
              <Input value={templateName} onChange={(event) => setTemplateName(event.target.value)} />
            </Field>
            <Field label="Route">
              <Select value={effectiveTemplateRouteId} onChange={(event) => setTemplateRouteId(event.target.value)} disabled={routes.length === 0}>
                {routes.length === 0 ? <option value="">Create a route first</option> : null}
                {routes.map((route) => (
                  <option key={route.routeId} value={route.routeId}>
                    {route.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Inspection profile">
              <Select value={inspectionProfile} onChange={(event) => setInspectionProfile(event.target.value)}>
                <option value="facade-standard">Facade standard</option>
                <option value="roof-scan">Roof scan</option>
                <option value="handover-audit">Handover audit</option>
              </Select>
            </Field>
            <Field label="Description">
              <TextArea value={templateDescription} onChange={(event) => setTemplateDescription(event.target.value)} />
            </Field>
            {templateError ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{templateError}</div> : null}
            <div className="flex justify-end">
              <ActionButton disabled={!canWriteSelectedSite || createTemplate.isPending || routes.length === 0} onClick={() => void handleCreateTemplate()}>
                {createTemplate.isPending ? 'Creating template...' : 'Create template'}
              </ActionButton>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Schedule slice</p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">Create schedule</h2>
          <p className="mt-2 text-sm text-chrome-700">
            Schedules formalize planned execution windows and preserve the alert configuration for demo playback.
          </p>
          <div className="mt-4 grid gap-4">
            <Field label="Route">
              <Select value={effectiveScheduleRouteId} onChange={(event) => setScheduleRouteId(event.target.value)} disabled={routes.length === 0}>
                {routes.length === 0 ? <option value="">Create a route first</option> : null}
                {routes.map((route) => (
                  <option key={route.routeId} value={route.routeId}>
                    {route.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Template">
              <Select value={effectiveScheduleTemplateId} onChange={(event) => setScheduleTemplateId(event.target.value)} disabled={templates.length === 0}>
                {templates.length === 0 ? <option value="">Create a template first</option> : null}
                {templates.map((template) => (
                  <option key={template.templateId} value={template.templateId}>
                    {template.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Planned time">
              <Input type="datetime-local" value={plannedAt} onChange={(event) => setPlannedAt(event.target.value)} />
            </Field>
            <Field label="Recurrence">
              <Input value={recurrence} onChange={(event) => setRecurrence(event.target.value)} placeholder="e.g. FREQ=WEEKLY;BYDAY=MO,WE,FR" />
            </Field>
            <Field label="Status">
              <Select value={scheduleStatus} onChange={(event) => setScheduleStatus(event.target.value as 'scheduled' | 'paused')}>
                <option value="scheduled">scheduled</option>
                <option value="paused">paused</option>
              </Select>
            </Field>
            {scheduleError ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{scheduleError}</div> : null}
            <div className="flex justify-end">
              <ActionButton disabled={!canWriteSelectedSite || createSchedule.isPending || (routes.length === 0 && templates.length === 0)} onClick={() => void handleCreateSchedule()}>
                {createSchedule.isPending ? 'Creating schedule...' : 'Create schedule'}
              </ActionButton>
            </div>
          </div>
        </Panel>

        <Panel>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Dispatch slice</p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">Dispatch mission record</h2>
          <p className="mt-2 text-sm text-chrome-700">
            Dispatch stays mission-level only. It records assignment, execution target, and linked planning metadata.
          </p>
          <div className="mt-4 grid gap-4">
            <Field label="Mission">
              <Select value={effectiveDispatchMissionId} onChange={(event) => setDispatchMissionId(event.target.value)} disabled={missions.length === 0}>
                {missions.length === 0 ? <option value="">Create a mission first</option> : null}
                {missions.map((mission) => (
                  <option key={mission.missionId} value={mission.missionId}>
                    {mission.missionName}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Route">
                <Select value={effectiveDispatchRouteId} onChange={(event) => setDispatchRouteId(event.target.value)} disabled={routes.length === 0}>
                  {routes.length === 0 ? <option value="">No routes</option> : null}
                  {routes.map((route) => (
                    <option key={route.routeId} value={route.routeId}>
                      {route.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Template">
                <Select value={effectiveDispatchTemplateId} onChange={(event) => setDispatchTemplateId(event.target.value)} disabled={templates.length === 0}>
                  {templates.length === 0 ? <option value="">No templates</option> : null}
                  {templates.map((template) => (
                    <option key={template.templateId} value={template.templateId}>
                      {template.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Schedule">
                <Select value={effectiveDispatchScheduleId} onChange={(event) => setDispatchScheduleId(event.target.value)} disabled={schedules.length === 0}>
                  {schedules.length === 0 ? <option value="">No schedules</option> : null}
                  {schedules.map((schedule) => (
                    <option key={schedule.scheduleId} value={schedule.scheduleId}>
                      {schedule.status} - {recurrenceLabel(schedule.recurrence ?? '')}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Assignee">
                <Input value={dispatchAssignee} onChange={(event) => setDispatchAssignee(event.target.value)} placeholder="observer-01" />
              </Field>
              <Field label="Execution target">
                <Input value={dispatchTarget} onChange={(event) => setDispatchTarget(event.target.value)} placeholder="field-team" />
              </Field>
              <Field label="Dispatch status">
                <Select value={dispatchStatus} onChange={(event) => setDispatchStatus(event.target.value as 'queued' | 'assigned' | 'sent' | 'accepted')}>
                  <option value="queued">queued</option>
                  <option value="assigned">assigned</option>
                  <option value="sent">sent</option>
                  <option value="accepted">accepted</option>
                </Select>
              </Field>
            </div>
            <Field label="Dispatch note">
              <TextArea value={dispatchNote} onChange={(event) => setDispatchNote(event.target.value)} />
            </Field>
            {dispatchError ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{dispatchError}</div> : null}
            {lastDispatchId ? (
              <div className="rounded-2xl border border-moss-200 bg-moss-50/60 px-4 py-3 text-sm text-moss-900">
                Dispatch recorded as <span className="font-mono">{lastDispatchId}</span>. Open the mission record to verify linked route, template, schedule, and dispatch metadata.
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <Link to={effectiveDispatchMissionId ? `/missions/${effectiveDispatchMissionId}` : '/missions'} className="text-sm text-chrome-700 underline underline-offset-2">
                Open mission detail
              </Link>
              <ActionButton disabled={!canWriteSelectedSite || dispatchMission.isPending || missions.length === 0 || (routes.length === 0 && templates.length === 0)} onClick={() => void handleDispatchMission()}>
                {dispatchMission.isPending ? 'Dispatching...' : 'Dispatch mission'}
              </ActionButton>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Routes</p>
          <div className="mt-4 space-y-3">
            {routes.length === 0 ? (
              <EmptyState title="No routes yet" body="Create the first site-linked inspection route for this demo slice." />
            ) : (
              routes.map((route) => (
                <div key={route.routeId} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-chrome-950">{route.name}</p>
                      <p className="text-sm text-chrome-700">{route.description || 'No route description.'}</p>
                    </div>
                    <span className="rounded-full bg-chrome-100 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-chrome-700">
                      {route.pointCount} points
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-chrome-600">Updated {formatDateTime(route.updatedAt)}</p>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Templates & schedules</p>
          <div className="mt-4 space-y-3">
            {templates.length === 0 && schedules.length === 0 ? (
              <EmptyState title="No templates or schedules yet" body="Templates and schedules appear here once the control plane is configured." />
            ) : null}
            {templates.map((template) => (
              <div key={template.templateId} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-chrome-950">{template.name}</p>
                    <p className="text-sm text-chrome-700">{template.description || 'No template description.'}</p>
                  </div>
                  <span className="rounded-full bg-chrome-100 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-chrome-700">
                    {template.alertRules.length} alerts
                  </span>
                </div>
              </div>
            ))}
            {schedules.map((schedule) => (
              <div key={schedule.scheduleId} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-chrome-950">{schedule.plannedAt ? formatDateTime(schedule.plannedAt) : 'Unscheduled demo window'}</p>
                    <p className="text-sm text-chrome-700">{recurrenceLabel(schedule.recurrence ?? '')}</p>
                  </div>
                  <StatusBadge status={schedule.status} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}
