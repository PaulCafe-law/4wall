
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Link, useLocation } from 'react-router-dom'

import {
  ActionButton,
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
import { ApiError, api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAuthedMutation, useAuthedQuery } from '../../lib/auth-query'
import { formatApiError } from '../../lib/presentation'
import type { Site } from '../../lib/types'

type WorkspaceKey = 'dashboard' | 'routes' | 'templates' | 'schedules' | 'dispatch'

type Workspace = {
  key: WorkspaceKey
  path: string
  label: string
  title: string
  description: string
}

const WORKSPACES: Workspace[] = [
  {
    key: 'dashboard',
    path: '/control-plane',
    label: '總覽',
    title: '控制平面總覽',
    description:
      '以單一工作台檢視場域、航線、模板、排程、派工、異常與報表，讓評審直接看見完整自主巡檢控制平面的運作脈絡。',
  },
  {
    key: 'routes',
    path: '/control-plane/routes',
    label: '航線',
    title: '航線規劃庫',
    description: '用可重用的航線版本管理巡檢路徑，維持場域脈絡、預估時間與預覽折線資料。',
  },
  {
    key: 'templates',
    path: '/control-plane/templates',
    label: '模板',
    title: '巡檢模板庫',
    description: '把 inspection profile、證據政策、報表模式與 review mode 收斂到同一個模板面。',
  },
  {
    key: 'schedules',
    path: '/control-plane/schedules',
    label: '排程',
    title: '排程工作區',
    description: '管理單次與週期性排程、下次執行時間、暫停原因與最近結果，避免排程只停留在表單欄位。',
  },
  {
    key: 'dispatch',
    path: '/control-plane/dispatch',
    label: '派工',
    title: '派工與任務佇列',
    description: '以任務為單位管理指派、執行目標與 handoff note；派工只定義責任歸屬，不進飛行控制迴路。',
  },
]

const DEFAULT_ROUTE_OFFSET = 0.00018

function workspaceFromPath(pathname: string): WorkspaceKey {
  if (pathname === '/control-plane/routes') return 'routes'
  if (pathname === '/control-plane/templates') return 'templates'
  if (pathname === '/control-plane/schedules') return 'schedules'
  if (pathname === '/control-plane/dispatch') return 'dispatch'
  return 'dashboard'
}

function tabClass(active: boolean) {
  return clsx(
    'inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition',
    active
      ? 'bg-chrome-950 text-white'
      : 'border border-chrome-300 bg-white text-chrome-950 hover:border-chrome-500',
  )
}

function buildDemoWaypoints(
  site: Site,
  transitAltitudeM: number,
  inspectionAltitudeM: number,
  dwellSeconds: number,
) {
  return [
    {
      kind: 'transit' as const,
      lat: site.location.lat - DEFAULT_ROUTE_OFFSET,
      lng: site.location.lng - DEFAULT_ROUTE_OFFSET,
      altitudeM: transitAltitudeM,
      label: `${site.name} 進場點`,
      headingDeg: 45,
      dwellSeconds: 0,
    },
    {
      kind: 'inspection_viewpoint' as const,
      lat: site.location.lat,
      lng: site.location.lng,
      altitudeM: inspectionAltitudeM,
      label: `${site.name} 主視角`,
      headingDeg: 180,
      dwellSeconds,
    },
    {
      kind: 'hold' as const,
      lat: site.location.lat + DEFAULT_ROUTE_OFFSET,
      lng: site.location.lng + DEFAULT_ROUTE_OFFSET,
      altitudeM: transitAltitudeM,
      label: `${site.name} 離場確認點`,
      headingDeg: 0,
      dwellSeconds: Math.max(5, Math.floor(dwellSeconds / 2)),
    },
  ]
}

function defaultAlertRules() {
  return [
    { kind: 'mission_failure' as const, enabled: true, note: '任務失敗時建立 support item。' },
    { kind: 'analysis_failure' as const, enabled: true, note: '分析失敗時通知 internal ops。' },
    {
      kind: 'report_generation_failure' as const,
      enabled: true,
      note: '報表失敗時提醒重新產生或改走人工審閱。',
    },
  ]
}

function formatDuration(seconds: number) {
  if (seconds <= 0) return '未估算'
  const minutes = Math.round(seconds / 60)
  return minutes < 1 ? `${seconds} 秒` : `${minutes} 分鐘`
}

function recurrenceLabel(value: string | null) {
  return value || '單次排程'
}

function selectedSiteHint(site: Site | null) {
  if (!site) return '尚未建立場域。請先建立 site，控制平面才有具體的地圖與排程脈絡。'
  return `${site.name} | ${site.address}`
}
export function ControlPlanePage() {
  const auth = useAuth()
  const location = useLocation()
  const queryClient = useQueryClient()
  const workspace = WORKSPACES.find((item) => item.key === workspaceFromPath(location.pathname)) ?? WORKSPACES[0]

  const [selectedSiteId, setSelectedSiteId] = useState('')
  const [routeName, setRouteName] = useState('')
  const [templateName, setTemplateName] = useState('')
  const [plannedAt, setPlannedAt] = useState('')
  const [dispatchNote, setDispatchNote] = useState('')
  const [routeError, setRouteError] = useState<string | null>(null)
  const [templateError, setTemplateError] = useState<string | null>(null)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [dispatchError, setDispatchError] = useState<string | null>(null)

  const overviewQuery = useAuthedQuery({
    queryKey: ['web-overview', 'control-plane'],
    queryFn: (token) => api.getOverview(token),
    staleTime: 10_000,
  })
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
  const routes = routesQuery.data ?? []
  const templates = templatesQuery.data ?? []
  const schedules = schedulesQuery.data ?? []
  const missions = missionsQuery.data ?? []
  const overview = overviewQuery.data

  const effectiveSiteId = sites.find((site) => site.siteId === selectedSiteId)?.siteId ?? sites[0]?.siteId ?? ''
  const selectedSite = sites.find((site) => site.siteId === effectiveSiteId) ?? null
  const canWriteSelectedSite = selectedSite ? auth.canWriteOrganization(selectedSite.organizationId) : false

  const siteRoutes = routes.filter((route) => !effectiveSiteId || route.siteId === effectiveSiteId)
  const siteTemplates = templates.filter((template) => !effectiveSiteId || template.siteId === effectiveSiteId)
  const siteSchedules = schedules.filter((schedule) => !effectiveSiteId || schedule.siteId === effectiveSiteId)
  const siteMissions = missions.filter((mission) => !effectiveSiteId || mission.siteId === effectiveSiteId)
  const siteCoverage = sites.map((site) => ({
    site,
    routeCount: routes.filter((route) => route.siteId === site.siteId).length,
    templateCount: templates.filter((template) => template.siteId === site.siteId).length,
    scheduleCount: schedules.filter((schedule) => schedule.siteId === site.siteId).length,
    missionCount: missions.filter((mission) => mission.siteId === site.siteId).length,
  }))

  const createRoute = useAuthedMutation({
    mutationKey: ['inspection', 'routes', 'create'],
    mutationFn: ({
      token,
      payload,
    }: {
      token: string
      payload: Parameters<typeof api.createInspectionRoute>[1]
    }) => api.createInspectionRoute(token, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['inspection', 'routes'] })
      setRouteName('')
      setRouteError(null)
    },
  })

  const createTemplate = useAuthedMutation({
    mutationKey: ['inspection', 'templates', 'create'],
    mutationFn: ({
      token,
      payload,
    }: {
      token: string
      payload: Parameters<typeof api.createInspectionTemplate>[1]
    }) => api.createInspectionTemplate(token, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['inspection', 'templates'] })
      setTemplateName('')
      setTemplateError(null)
    },
  })

  const createSchedule = useAuthedMutation({
    mutationKey: ['inspection', 'schedules', 'create'],
    mutationFn: ({
      token,
      payload,
    }: {
      token: string
      payload: Parameters<typeof api.createInspectionSchedule>[1]
    }) => api.createInspectionSchedule(token, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['inspection', 'schedules'] })
      setPlannedAt('')
      setScheduleError(null)
    },
  })

  const dispatchMission = useAuthedMutation({
    mutationKey: ['inspection', 'dispatch'],
    mutationFn: ({
      token,
      payload,
    }: {
      token: string
      payload: { missionId: string }
    }) =>
      api.dispatchMission(token, payload.missionId, {
          routeId: siteRoutes[0]?.routeId,
          templateId: siteTemplates[0]?.templateId,
          scheduleId: siteSchedules[0]?.scheduleId,
          assignee: 'observer-01',
          executionTarget: 'field-team',
        status: 'assigned',
        note: dispatchNote.trim() || undefined,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['missions'] }),
        queryClient.invalidateQueries({ queryKey: ['mission'] }),
        queryClient.invalidateQueries({ queryKey: ['web-overview'] }),
      ])
      setDispatchNote('')
      setDispatchError(null)
    },
  })

  async function handleCreateRoute() {
    if (!selectedSite) {
      setRouteError('請先建立並選擇場域。')
      return
    }
    if (!routeName.trim()) {
      setRouteError('請輸入航線名稱。')
      return
    }

    try {
      await createRoute.mutateAsync({
        organizationId: selectedSite.organizationId,
        siteId: selectedSite.siteId,
        name: routeName.trim(),
        description: '以場域外框與主視角產生的示範航線，用於規劃、排程與派工 demo。',
        waypoints: buildDemoWaypoints(selectedSite, 40, 32, 18),
        planningParameters: {
          routeVersion: 1,
          routeMode: 'site-envelope-demo',
          defaultSpeedMps: 4,
        },
      })
    } catch (error) {
      setRouteError(
        formatApiError(error instanceof ApiError ? error.detail : undefined, '建立航線失敗。'),
      )
    }
  }

  async function handleCreateTemplate() {
    if (!selectedSite) {
      setTemplateError('請先建立並選擇場域。')
      return
    }
    if (!templateName.trim()) {
      setTemplateError('請輸入模板名稱。')
      return
    }
    if (!siteRoutes[0]) {
      setTemplateError('請先建立航線，再建立模板。')
      return
    }

    try {
      await createTemplate.mutateAsync({
        organizationId: selectedSite.organizationId,
        siteId: selectedSite.siteId,
        routeId: siteRoutes[0].routeId,
        name: templateName.trim(),
        description: '將 inspection profile、證據政策、報表模式與 review mode 固定下來。',
        inspectionProfile: {
          profile: 'facade-standard',
          evidencePolicy: 'capture_key_frames',
          reportMode: 'html_report',
          reviewMode: 'operator_review',
        },
        alertRules: defaultAlertRules(),
      })
    } catch (error) {
      setTemplateError(
        formatApiError(error instanceof ApiError ? error.detail : undefined, '建立模板失敗。'),
      )
    }
  }

  async function handleCreateSchedule() {
    if (!selectedSite) {
      setScheduleError('請先建立並選擇場域。')
      return
    }
    if (!siteRoutes[0] || !siteTemplates[0]) {
      setScheduleError('請先建立航線與模板，再建立排程。')
      return
    }

    try {
      await createSchedule.mutateAsync({
        organizationId: selectedSite.organizationId,
        siteId: selectedSite.siteId,
        routeId: siteRoutes[0].routeId,
        templateId: siteTemplates[0].templateId,
        plannedAt: plannedAt ? new Date(plannedAt).toISOString() : undefined,
        recurrence: '每週一 09:00',
        status: 'scheduled',
        alertRules: defaultAlertRules(),
      })
    } catch (error) {
      setScheduleError(
        formatApiError(error instanceof ApiError ? error.detail : undefined, '建立排程失敗。'),
      )
    }
  }

  async function handleDispatchMission(missionId: string) {
    try {
      await dispatchMission.mutateAsync({ missionId })
    } catch (error) {
      setDispatchError(
        formatApiError(error instanceof ApiError ? error.detail : undefined, '建立派工失敗。'),
      )
    }
  }
  function renderDashboard() {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 xl:grid-cols-5">
          <Metric label="場域數" value={overview?.siteCount ?? sites.length} hint="以 site map 為規劃脈絡" />
          <Metric label="航線數" value={routes.length} hint="可重用的巡檢航線版本" />
          <Metric
            label="已排程"
            value={siteSchedules.filter((item) => item.status === 'scheduled').length}
            hint="待執行排程"
          />
          <Metric
            label="待派工任務"
            value={siteMissions.filter((item) => item.status === 'planning' || item.status === 'ready').length}
            hint="等候 dispatch 與 handoff"
          />
          <Metric
            label="待處理營運提醒"
            value={overview?.supportSummary?.openCount ?? 0}
            hint="support / live ops 追蹤"
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">
              site coverage
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">
              場域覆蓋與規劃密度
            </h2>
            <p className="mt-2 text-sm text-chrome-700">
              這裡聚合 site、route、template、schedule、mission 的數量關係，讓評審直接看到控制平面不是單一表單，而是一個持續運作的工作台。
            </p>

            <div className="mt-4 grid gap-4">
              {siteCoverage.length === 0 ? (
                <EmptyState
                  title="目前沒有場域"
                  body="先建立 site，控制平面才會有具體的地圖、航線、排程與派工脈絡。"
                />
              ) : (
                siteCoverage.map((entry) => (
                  <div
                    key={entry.site.siteId}
                    className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-chrome-950">{entry.site.name}</p>
                        <p className="text-sm text-chrome-700">{entry.site.address}</p>
                      </div>
                      <ActionButton
                        variant="secondary"
                        onClick={() => setSelectedSiteId(entry.site.siteId)}
                      >
                        切換場域
                      </ActionButton>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      <Metric label="航線" value={entry.routeCount} />
                      <Metric label="模板" value={entry.templateCount} />
                      <Metric label="排程" value={entry.scheduleCount} />
                      <Metric label="任務" value={entry.missionCount} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <div className="space-y-6">
            <Panel>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">
                selected site
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">目前場域</h2>
              <p className="mt-2 text-sm text-chrome-700">{selectedSiteHint(selectedSite)}</p>
              {selectedSite ? (
                <dl className="mt-4 grid gap-3">
                  <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-3">
                    <dt className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">
                      coordinates
                    </dt>
                    <dd className="mt-2 text-sm text-chrome-900">
                      {selectedSite.location.lat}, {selectedSite.location.lng}
                    </dd>
                  </div>
                  <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-3">
                    <dt className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">
                      notes
                    </dt>
                    <dd className="mt-2 text-sm text-chrome-900">{selectedSite.notes || '尚未補充場域說明。'}</dd>
                  </div>
                </dl>
              ) : null}
            </Panel>

            <Panel>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">
                reporting
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">最近異常與報表</h2>
              <div className="mt-4 grid gap-3">
                <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                  <p className="font-medium text-chrome-950">最新異常</p>
                  <p className="mt-2 text-sm text-chrome-700">
                    {overview?.latestEventSummary?.summary ?? '目前沒有新的異常摘要。'}
                  </p>
                </div>
                <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                  <p className="font-medium text-chrome-950">最新報表</p>
                  <p className="mt-2 text-sm text-chrome-700">
                    {overview?.latestReportSummary?.summary ?? '目前沒有新的巡檢報表。'}
                  </p>
                </div>
                <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                  <p className="font-medium text-chrome-950">營運提醒</p>
                  <p className="mt-2 text-sm text-chrome-700">
                    open {overview?.supportSummary?.openCount ?? 0} / critical{' '}
                    {overview?.supportSummary?.criticalCount ?? 0}
                  </p>
                </div>
              </div>
            </Panel>
          </div>
        </div>

        <Panel>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">
            walkthrough
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">
            評審要看到的完整故事
          </h2>
          <div className="mt-4 grid gap-3 lg:grid-cols-5">
            {WORKSPACES.map((item, index) => (
              <div
                key={item.key}
                className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4"
              >
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">
                  step {index + 1}
                </p>
                <p className="mt-2 font-medium text-chrome-950">{item.title}</p>
                <p className="mt-2 text-sm text-chrome-700">{item.description}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    )
  }

  function renderRoutesWorkspace() {
    return (
      <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
        <Panel>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">
            create route
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">建立航線</h2>
          <div className="mt-4 grid gap-4">
            <Field label="航線名稱">
              <Input value={routeName} onChange={(event) => setRouteName(event.target.value)} />
            </Field>
            <Field label="場域">
              <Select
                value={effectiveSiteId}
                onChange={(event) => setSelectedSiteId(event.target.value)}
              >
                {sites.length === 0 ? <option value="">尚未建立場域</option> : null}
                {sites.map((site) => (
                  <option key={site.siteId} value={site.siteId}>
                    {site.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="建立邏輯" hint="用場域座標生成示範航線，供排程、派工與任務回溯使用。">
              <TextArea readOnly value="site map -> route preview -> mission bundle" />
            </Field>
            {routeError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {routeError}
              </div>
            ) : null}
            <div className="flex justify-end">
              <ActionButton
                disabled={!canWriteSelectedSite || createRoute.isPending}
                onClick={() => void handleCreateRoute()}
              >
                {createRoute.isPending ? '建立中…' : '建立航線'}
              </ActionButton>
            </div>
          </div>
        </Panel>

        <Panel>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">
            route library
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">航線庫</h2>
          <div className="mt-4 space-y-4">
            {siteRoutes.length === 0 ? (
              <EmptyState
                title="目前沒有航線"
                body="先建立示範航線，才能把場域、模板與排程串成完整控制平面故事。"
              />
            ) : (
              siteRoutes.map((route) => (
                <div
                  key={route.routeId}
                  className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-chrome-950">{route.name}</p>
                      <p className="mt-1 text-sm text-chrome-700">
                        {route.description || '未提供航線說明。'}
                      </p>
                    </div>
                    <span className="rounded-full bg-chrome-100 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-chrome-700">
                      v{route.version}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    <Metric label="點位" value={route.pointCount} />
                    <Metric label="預估時間" value={formatDuration(route.estimatedDurationSec)} />
                    <Metric label="預覽點" value={route.previewPolyline.length} />
                    <Metric label="更新時間" value={formatDateTime(route.updatedAt)} />
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>
    )
  }
  function renderTemplatesWorkspace() {
    return (
      <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
        <Panel>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">
            create template
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">建立模板</h2>
          <div className="mt-4 grid gap-4">
            <Field label="模板名稱">
              <Input value={templateName} onChange={(event) => setTemplateName(event.target.value)} />
            </Field>
            <Field label="綁定航線">
              <Select value={siteRoutes[0]?.routeId ?? ''} disabled={siteRoutes.length === 0}>
                {siteRoutes.length === 0 ? <option value="">請先建立航線</option> : null}
                {siteRoutes.map((route) => (
                  <option key={route.routeId} value={route.routeId}>
                    {route.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="模板說明" hint="固定 inspection profile、alert rules、evidence policy 與 report mode。">
              <TextArea
                readOnly
                value="inspectionProfile=facade-standard; evidencePolicy=capture_key_frames; reportMode=html_report"
              />
            </Field>
            {templateError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {templateError}
              </div>
            ) : null}
            <div className="flex justify-end">
              <ActionButton
                disabled={!canWriteSelectedSite || createTemplate.isPending || siteRoutes.length === 0}
                onClick={() => void handleCreateTemplate()}
              >
                {createTemplate.isPending ? '建立中…' : '建立模板'}
              </ActionButton>
            </div>
          </div>
        </Panel>

        <Panel>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">
            template library
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">模板庫</h2>
          <div className="mt-4 space-y-4">
            {siteTemplates.length === 0 ? (
              <EmptyState
                title="目前沒有模板"
                body="模板會把巡檢規範、證據政策與報表模式收斂成可重用的設定。"
              />
            ) : (
              siteTemplates.map((template) => (
                <div
                  key={template.templateId}
                  className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-chrome-950">{template.name}</p>
                      <p className="mt-1 text-sm text-chrome-700">
                        {template.description || '未提供模板說明。'}
                      </p>
                    </div>
                    <StatusBadge status={template.routeId ? 'ready' : 'planning'} />
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <Metric label="證據政策" value={template.evidencePolicy} />
                    <Metric label="報表模式" value={template.reportMode} />
                    <Metric label="審閱模式" value={template.reviewMode} />
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>
    )
  }

  function renderSchedulesWorkspace() {
    return (
      <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
        <Panel>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">
            create schedule
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">建立排程</h2>
          <div className="mt-4 grid gap-4">
            <Field label="預計執行時間">
              <Input
                type="datetime-local"
                value={plannedAt}
                onChange={(event) => setPlannedAt(event.target.value)}
              />
            </Field>
            <Field label="綁定模板">
              <Select value={siteTemplates[0]?.templateId ?? ''} disabled={siteTemplates.length === 0}>
                {siteTemplates.length === 0 ? <option value="">請先建立模板</option> : null}
                {siteTemplates.map((template) => (
                  <option key={template.templateId} value={template.templateId}>
                    {template.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="排程政策" hint="Batch A 先用單次或簡化 recurrence 展示控制平面的核心訊息。">
              <TextArea readOnly value="status=scheduled; recurrence=每週一 09:00; alertCoverage=mission_failure/analysis_failure/report_generation_failure" />
            </Field>
            {scheduleError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {scheduleError}
              </div>
            ) : null}
            <div className="flex justify-end">
              <ActionButton
                disabled={!canWriteSelectedSite || createSchedule.isPending || !siteRoutes[0] || !siteTemplates[0]}
                onClick={() => void handleCreateSchedule()}
              >
                {createSchedule.isPending ? '建立中…' : '建立排程'}
              </ActionButton>
            </div>
          </div>
        </Panel>

        <Panel>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">
            schedule board
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">排程看板</h2>
          <div className="mt-4 space-y-4">
            {siteSchedules.length === 0 ? (
              <EmptyState
                title="目前沒有排程"
                body="排程工作區要讓評審看見 nextRunAt、pauseReason 與 lastOutcome，而不是只有 plannedAt。"
              />
            ) : (
              siteSchedules.map((schedule) => (
                <div
                  key={schedule.scheduleId}
                  className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-chrome-950">
                        {schedule.nextRunAt ? formatDateTime(schedule.nextRunAt) : '尚未排定下次執行'}
                      </p>
                      <p className="mt-1 text-sm text-chrome-700">
                        {recurrenceLabel(schedule.recurrence)}
                      </p>
                    </div>
                    <StatusBadge status={schedule.status} />
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <Metric label="最近結果" value={schedule.lastOutcome ?? 'scheduled_for_execution'} />
                    <Metric label="暫停原因" value={schedule.pauseReason ?? '無'} />
                    <Metric label="告警規則" value={schedule.alertRules.length} />
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>
    )
  }

  function renderDispatchWorkspace() {
    return (
      <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
        <Panel>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">
            dispatch controls
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">建立派工</h2>
          <div className="mt-4 grid gap-4">
            <Field label="派工說明">
              <TextArea
                value={dispatchNote}
                onChange={(event) => setDispatchNote(event.target.value)}
                placeholder="例如：由 observer-01 進行現場執行與回報。"
              />
            </Field>
            {dispatchError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {dispatchError}
              </div>
            ) : null}
            <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4 text-sm text-chrome-700">
              派工只定義任務執行責任與 handoff note，不代表 web 或 server 端進入飛行控制迴路。
            </div>
          </div>
        </Panel>

        <Panel>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">
            dispatch queue
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">任務佇列</h2>
          <div className="mt-4 space-y-4">
            {siteMissions.length === 0 ? (
              <EmptyState
                title="目前沒有任務"
                body="先建立任務，派工工作區才會出現可指派的 mission。"
              />
            ) : (
              siteMissions.map((mission) => (
                <div
                  key={mission.missionId}
                  className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-chrome-950">{mission.missionName}</p>
                      <p className="mt-1 text-sm text-chrome-700">
                        mission {mission.status} / report {mission.reportStatus}
                      </p>
                    </div>
                    <StatusBadge status={mission.status} />
                  </div>
                  <p className="mt-3 text-xs text-chrome-600">
                    建立時間 {formatDateTime(mission.createdAt)}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <ActionButton
                      disabled={!canWriteSelectedSite || dispatchMission.isPending}
                      onClick={() => void handleDispatchMission(mission.missionId)}
                    >
                      {dispatchMission.isPending ? '派工中…' : '建立派工'}
                    </ActionButton>
                    <Link
                      to={`/missions/${mission.missionId}`}
                      className="inline-flex items-center justify-center rounded-full border border-chrome-300 px-4 py-2 text-sm font-medium text-chrome-950 transition hover:border-chrome-500"
                    >
                      查看任務詳情
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="control plane"
        title={workspace.title}
        subtitle={workspace.description}
        action={
          <div className="min-w-[18rem]">
            <Field label="場域範圍" hint={selectedSiteHint(selectedSite)}>
              <Select
                value={effectiveSiteId}
                onChange={(event) => setSelectedSiteId(event.target.value)}
              >
                {sites.length === 0 ? <option value="">尚未建立場域</option> : null}
                {sites.map((site) => (
                  <option key={site.siteId} value={site.siteId}>
                    {site.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        }
      />

      <Panel className="overflow-x-auto">
        <div className="flex flex-wrap gap-3">
          {WORKSPACES.map((item) => (
            <Link key={item.key} to={item.path} className={tabClass(workspace.key === item.key)}>
              {item.label}
            </Link>
          ))}
        </div>
      </Panel>

      {workspace.key === 'dashboard' ? renderDashboard() : null}
      {workspace.key === 'routes' ? renderRoutesWorkspace() : null}
      {workspace.key === 'templates' ? renderTemplatesWorkspace() : null}
      {workspace.key === 'schedules' ? renderSchedulesWorkspace() : null}
      {workspace.key === 'dispatch' ? renderDispatchWorkspace() : null}
    </div>
  )
}
