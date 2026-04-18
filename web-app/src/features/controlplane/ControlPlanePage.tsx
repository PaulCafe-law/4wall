
import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Link, useLocation } from 'react-router-dom'

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
import { ApiError, api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAuthedMutation, useAuthedQuery } from '../../lib/auth-query'
import {
  formatApiError,
  formatStatus,
  formatSupportCategory,
  formatSupportSeverity,
} from '../../lib/presentation'
import type { InspectionWaypoint, Site } from '../../lib/types'
import { InternalRouteEditorPanel } from './InternalRouteEditorPanel'

type WorkspaceKey = 'dashboard' | 'routes' | 'templates' | 'schedules' | 'dispatch'

type Workspace = {
  key: WorkspaceKey
  path: string
  label: string
  title: string
  description: string
}

type WorkspacePresentationGuide = {
  eyebrow: string
  title: string
  summary: string
  evidenceTargets: string[]
  screenshotHint: string
  nextStep: string
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
    description: '把巡檢策略、證據政策、報表模式與審閱模式收斂到同一個模板面。',
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
    description: '以任務為單位管理指派、執行目標與交接備註；派工只定義責任歸屬，不進飛行控制迴路。',
  },
]

const WORKSPACE_GUIDES: Record<WorkspaceKey, WorkspacePresentationGuide> = {
  dashboard: {
    eyebrow: '展示重點',
    title: '先用總覽把控制平面講成一個持續運作的工作台',
    summary:
      '這一頁要回答評審兩個問題：目前有哪些場域與規劃資產、目前有哪些排程壓力與營運風險。畫面不該像報表首頁，而要像一個規劃、排程、派工、監看與交付的總控制台。',
    evidenceTargets: ['場域覆蓋與規劃密度', '最近告警', '最近執行狀態'],
    screenshotHint: '建議截一張包含核心 KPI、最近告警與最近執行狀態的總覽圖。',
    nextStep: '接著切到場域或航線工作區，讓評審看到這些摘要是如何對應到具體的控制平面資產。',
  },
  routes: {
    eyebrow: '展示重點',
    title: '航線工作區要讓人看見可重用的巡檢路徑資產',
    summary:
      '重點不是單次建立表單，而是航線版本、預估時間、預覽折線與場域上下文可以被後續模板、排程與任務重用。',
    evidenceTargets: ['建立航線表單', '航線庫', '預估時間與預覽折線摘要'],
    screenshotHint: '建議同框截到建立表單與右側航線庫，讓畫面同時呈現建立與重用兩件事。',
    nextStep: '建立或選定一條航線後，切到模板工作區，把巡檢策略、證據與報表政策掛上去。',
  },
  templates: {
    eyebrow: '展示重點',
    title: '模板工作區負責把巡檢政策固定下來',
    summary:
      '模板不是附屬欄位。它定義巡檢策略、證據政策、報表模式與審閱模式，讓同一條航線可以因不同營運需求而有不同輸出。',
    evidenceTargets: ['建立模板表單', '模板庫', '證據政策與報表模式'],
    screenshotHint: '建議截一張能同時看見模板策略欄位與既有模板摘要的畫面。',
    nextStep: '模板建立後，切到排程工作區，展示何時執行、暫停原因與最近結果。',
  },
  schedules: {
    eyebrow: '展示重點',
    title: '排程工作區要講清楚何時執行、為何暫停、最近結果如何',
    summary:
      '這一頁用來展示 lifecycle，而不是單純顯示 plannedAt。評審應該能直接看到 nextRunAt、lastRunAt、pauseReason、lastOutcome 與最近派工狀態。',
    evidenceTargets: ['建立排程表單', '排程看板', 'nextRunAt / pauseReason / lastOutcome'],
    screenshotHint: '建議截一張排程看板，至少包含一筆已排程資料與可執行的暫停/恢復動作。',
    nextStep: '排程狀態說明清楚後，切到派工工作區，展示任務交接與責任歸屬。',
  },
  dispatch: {
    eyebrow: '展示重點',
    title: '派工工作區要把任務責任與交接狀態說清楚',
    summary:
      '這裡展示的是任務層級的交接，不是飛行控制。畫面應該讓人看見負責人、執行對象、接受時間、關閉時間與交接備註如何與任務/報表狀態對齊。',
    evidenceTargets: ['建立派工表單', '任務佇列', '派工看板'],
    screenshotHint: '建議截一張同時包含任務佇列與派工看板的畫面，證明 dispatch 是正式 lifecycle，而不是一個按鈕。',
    nextStep: '完成派工後，直接打開任務詳情，展示規劃、執行、事件與報表如何匯流。',
  },
}

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

function cloneWaypoints(waypoints: InspectionWaypoint[]) {
  return waypoints.map((waypoint) => ({ ...waypoint }))
}

function defaultAlertRules() {
  return [
    { kind: 'mission_failure' as const, enabled: true, note: '任務失敗時建立支援項目。' },
    { kind: 'analysis_failure' as const, enabled: true, note: '分析失敗時通知內部營運。' },
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

function eyebrowLabel(label: string) {
  return (
    <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">
      {label}
    </p>
  )
}

function dispatchTransitionCopy(status: string) {
  switch (status) {
    case 'queued':
      return '等待指派'
    case 'assigned':
      return '已指派'
    case 'sent':
      return '已送出'
    case 'accepted':
      return '已接受'
    case 'completed':
      return '已完成'
    case 'failed':
      return '已失敗'
    default:
      return status
  }
}

function executionSummaryHint(summary: { telemetryFreshness: string; reportStatus: string; eventCount: number }) {
  return `遙測 ${formatStatus(summary.telemetryFreshness)} / 報表 ${formatStatus(summary.reportStatus)} / 事件 ${summary.eventCount}`
}

export function ControlPlanePage() {
  const auth = useAuth()
  const location = useLocation()
  const queryClient = useQueryClient()
  const workspace = WORKSPACES.find((item) => item.key === workspaceFromPath(location.pathname)) ?? WORKSPACES[0]

  const [selectedSiteId, setSelectedSiteId] = useState('')
  const [selectedRouteId, setSelectedRouteId] = useState('new')
  const [routeName, setRouteName] = useState('')
  const [routeDescription, setRouteDescription] = useState('')
  const [routeDraftWaypoints, setRouteDraftWaypoints] = useState<InspectionWaypoint[]>([])
  const [templateName, setTemplateName] = useState('')
  const [plannedAt, setPlannedAt] = useState('')
  const [schedulePauseReason, setSchedulePauseReason] = useState('天候不佳，暫停起飛窗口。')
  const [dispatchAssignee, setDispatchAssignee] = useState('observer-01')
  const [dispatchExecutionTarget, setDispatchExecutionTarget] = useState('field-team')
  const [dispatchNote, setDispatchNote] = useState('')
  const [routeError, setRouteError] = useState<string | null>(null)
  const [templateError, setTemplateError] = useState<string | null>(null)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [dispatchError, setDispatchError] = useState<string | null>(null)

  const dashboardQuery = useAuthedQuery({
    queryKey: ['control-plane-dashboard'],
    queryFn: (token) => api.getControlPlaneDashboard(token),
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
  const dispatchesQuery = useAuthedQuery({
    queryKey: ['inspection', 'dispatch', selectedSiteId],
    queryFn: (token) => api.listInspectionDispatches(token, selectedSiteId ? { siteId: selectedSiteId } : undefined),
    staleTime: 10_000,
  })
  const missionsQuery = useAuthedQuery({
    queryKey: ['missions', 'control-plane'],
    queryFn: api.listMissions,
    staleTime: 10_000,
  })

  const sites = useMemo(() => sitesQuery.data ?? [], [sitesQuery.data])
  const routes = useMemo(() => routesQuery.data ?? [], [routesQuery.data])
  const templates = useMemo(() => templatesQuery.data ?? [], [templatesQuery.data])
  const schedules = useMemo(() => schedulesQuery.data ?? [], [schedulesQuery.data])
  const dispatches = useMemo(() => dispatchesQuery.data ?? [], [dispatchesQuery.data])
  const missions = useMemo(() => missionsQuery.data ?? [], [missionsQuery.data])
  const dashboard = dashboardQuery.data
  const workspaceGuide = WORKSPACE_GUIDES[workspace.key]

  const effectiveSiteId = sites.find((site) => site.siteId === selectedSiteId)?.siteId ?? sites[0]?.siteId ?? ''
  const selectedSite = sites.find((site) => site.siteId === effectiveSiteId) ?? null
  const canWriteSelectedSite = selectedSite ? auth.canWriteOrganization(selectedSite.organizationId) : false

  const siteRoutes = useMemo(
    () => routes.filter((route) => !effectiveSiteId || route.siteId === effectiveSiteId),
    [effectiveSiteId, routes],
  )
  const siteTemplates = useMemo(
    () => templates.filter((template) => !effectiveSiteId || template.siteId === effectiveSiteId),
    [effectiveSiteId, templates],
  )
  const siteSchedules = useMemo(
    () => schedules.filter((schedule) => !effectiveSiteId || schedule.siteId === effectiveSiteId),
    [effectiveSiteId, schedules],
  )
  const siteMissions = useMemo(
    () => missions.filter((mission) => !effectiveSiteId || mission.siteId === effectiveSiteId),
    [effectiveSiteId, missions],
  )
  const editingRoute = useMemo(
    () => siteRoutes.find((route) => route.routeId === selectedRouteId) ?? null,
    [selectedRouteId, siteRoutes],
  )
  const siteDispatches = useMemo(
    () =>
      dispatches.filter(
        (dispatch) =>
          !effectiveSiteId ||
          siteMissions.some(
            (mission) => mission.missionId === dispatch.missionId && mission.siteId === effectiveSiteId,
          ),
      ),
    [dispatches, effectiveSiteId, siteMissions],
  )
  const dispatchByMissionId = useMemo(
    () => new Map(siteDispatches.map((dispatch) => [dispatch.missionId, dispatch])),
    [siteDispatches],
  )
  const missionById = useMemo(
    () => new Map(missions.map((mission) => [mission.missionId, mission])),
    [missions],
  )
  const siteCoverage = useMemo(
    () =>
      sites.map((site) => ({
        site,
        routeCount: routes.filter((route) => route.siteId === site.siteId).length,
        templateCount: templates.filter((template) => template.siteId === site.siteId).length,
        scheduleCount: schedules.filter((schedule) => schedule.siteId === site.siteId).length,
        missionCount: missions.filter((mission) => mission.siteId === site.siteId).length,
      })),
    [missions, routes, sites, schedules, templates],
  )

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!selectedSite) {
        setSelectedRouteId('new')
        setRouteName('')
        setRouteDescription('')
        setRouteDraftWaypoints([])
        return
      }

      if (selectedRouteId !== 'new' && !siteRoutes.some((route) => route.routeId === selectedRouteId)) {
        setSelectedRouteId('new')
        return
      }

      if (selectedRouteId === 'new') {
        setRouteName(`${selectedSite.name} 巡檢航線`)
        setRouteDescription('由 internal 規劃團隊在 Google Maps 上編輯並發布的巡檢航線。')
        setRouteDraftWaypoints(cloneWaypoints(buildDemoWaypoints(selectedSite, 40, 32, 18)))
        return
      }

      if (editingRoute) {
        setRouteName(editingRoute.name)
        setRouteDescription(editingRoute.description)
        setRouteDraftWaypoints(cloneWaypoints(editingRoute.waypoints))
      }
    }, 0)

    return () => {
      window.clearTimeout(timer)
    }
  }, [editingRoute, selectedRouteId, selectedSite, siteRoutes])

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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inspection', 'routes'] }),
        queryClient.invalidateQueries({ queryKey: ['control-plane-dashboard'] }),
      ])
      setRouteError(null)
    },
  })

  const updateRoute = useAuthedMutation({
    mutationKey: ['inspection', 'routes', 'update'],
    mutationFn: ({
      token,
      payload,
    }: {
      token: string
      payload: { routeId: string; body: Parameters<typeof api.patchInspectionRoute>[2] }
    }) => api.patchInspectionRoute(token, payload.routeId, payload.body),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inspection', 'routes'] }),
        queryClient.invalidateQueries({ queryKey: ['control-plane-dashboard'] }),
      ])
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inspection', 'templates'] }),
        queryClient.invalidateQueries({ queryKey: ['control-plane-dashboard'] }),
      ])
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inspection', 'schedules'] }),
        queryClient.invalidateQueries({ queryKey: ['control-plane-dashboard'] }),
      ])
      setPlannedAt('')
      setScheduleError(null)
    },
  })

  const updateSchedule = useAuthedMutation({
    mutationKey: ['inspection', 'schedules', 'update'],
    mutationFn: ({
      token,
      payload,
    }: {
      token: string
      payload: { scheduleId: string; body: Parameters<typeof api.patchInspectionSchedule>[2] }
    }) => api.patchInspectionSchedule(token, payload.scheduleId, payload.body),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inspection', 'schedules'] }),
        queryClient.invalidateQueries({ queryKey: ['control-plane-dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['control-plane-alerts'] }),
      ])
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
          assignee: dispatchAssignee.trim() || undefined,
          executionTarget: dispatchExecutionTarget.trim() || undefined,
        status: 'assigned',
        note: dispatchNote.trim() || undefined,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['missions'] }),
        queryClient.invalidateQueries({ queryKey: ['mission'] }),
        queryClient.invalidateQueries({ queryKey: ['web-overview'] }),
        queryClient.invalidateQueries({ queryKey: ['control-plane-dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['control-plane-alerts'] }),
        queryClient.invalidateQueries({ queryKey: ['inspection', 'dispatch'] }),
        queryClient.invalidateQueries({ queryKey: ['inspection', 'schedules'] }),
        queryClient.invalidateQueries({ queryKey: ['support', 'queue'] }),
        queryClient.invalidateQueries({ queryKey: ['live-ops', 'flights'] }),
      ])
      setDispatchNote('')
      setDispatchError(null)
    },
  })

  const updateDispatch = useAuthedMutation({
    mutationKey: ['inspection', 'dispatch', 'update'],
    mutationFn: ({
      token,
      payload,
    }: {
      token: string
      payload: { dispatchId: string; body: Parameters<typeof api.patchInspectionDispatch>[2] }
    }) => api.patchInspectionDispatch(token, payload.dispatchId, payload.body),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inspection', 'dispatch'] }),
        queryClient.invalidateQueries({ queryKey: ['missions'] }),
        queryClient.invalidateQueries({ queryKey: ['mission'] }),
        queryClient.invalidateQueries({ queryKey: ['web-overview'] }),
        queryClient.invalidateQueries({ queryKey: ['control-plane-dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['control-plane-alerts'] }),
        queryClient.invalidateQueries({ queryKey: ['support', 'queue'] }),
        queryClient.invalidateQueries({ queryKey: ['live-ops', 'flights'] }),
      ])
      setDispatchError(null)
    },
  })

  function seedRouteDraftFromSite() {
    if (!selectedSite) {
      setRouteError('請先建立並選擇場域。')
      return
    }

    setRouteDraftWaypoints(cloneWaypoints(buildDemoWaypoints(selectedSite, 40, 32, 18)))
    setRouteError(null)
  }

  async function handleSaveRouteDraft() {
    if (!selectedSite) {
      setRouteError('請先建立並選擇場域。')
      return
    }
    if (!routeName.trim()) {
      setRouteError('請輸入航線名稱。')
      return
    }
    if (routeDraftWaypoints.length < 2) {
      setRouteError('至少需要兩個 waypoint 才能建立或更新航線。')
      return
    }

    try {
      if (selectedRouteId !== 'new' && editingRoute) {
        await updateRoute.mutateAsync({
          routeId: editingRoute.routeId,
          body: {
            name: routeName.trim(),
            description: routeDescription.trim() || undefined,
            waypoints: routeDraftWaypoints,
            planningParameters: {
              ...(editingRoute.planningParameters ?? {}),
              routeMode: 'google-maps-editor',
              editor: 'internal_google_maps',
            },
          },
        })
        return
      }

      const createdRoute = await createRoute.mutateAsync({
        organizationId: selectedSite.organizationId,
        siteId: selectedSite.siteId,
        name: routeName.trim(),
        description: routeDescription.trim() || '由 internal 規劃團隊在 Google Maps 上編輯並發布的巡檢航線。',
        waypoints: routeDraftWaypoints,
        planningParameters: {
          routeVersion: 1,
          routeMode: 'google-maps-editor',
          defaultSpeedMps: 4,
          editor: 'internal_google_maps',
        },
      })
      setSelectedRouteId(createdRoute.routeId)
    } catch (error) {
      setRouteError(
        formatApiError(error instanceof ApiError ? error.detail : undefined, '建立或更新航線失敗。'),
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
        description: '將巡檢策略、證據政策、報表模式與審閱模式固定下來。',
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

  async function handleScheduleTransition(
    scheduleId: string,
    status: 'scheduled' | 'paused' | 'cancelled' | 'completed',
  ) {
    try {
      setScheduleError(null)
      await updateSchedule.mutateAsync({
        scheduleId,
        body: {
          status,
          pauseReason: status === 'paused' ? schedulePauseReason.trim() || '由控制平面工作區手動暫停。' : '',
        },
      })
    } catch (error) {
      setScheduleError(
        formatApiError(error instanceof ApiError ? error.detail : undefined, '更新排程狀態失敗。'),
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

  async function handleDispatchTransition(
    dispatchId: string,
    status: 'assigned' | 'sent' | 'accepted' | 'completed' | 'failed',
  ) {
    try {
      setDispatchError(null)
      await updateDispatch.mutateAsync({
        dispatchId,
        body: {
          status,
          assignee: dispatchAssignee.trim() || undefined,
          executionTarget: dispatchExecutionTarget.trim() || undefined,
          note: dispatchNote.trim() || undefined,
        },
      })
    } catch (error) {
      setDispatchError(
        formatApiError(error instanceof ApiError ? error.detail : undefined, '更新派工狀態失敗。'),
      )
    }
  }

  function renderWorkspaceGuide() {
    return (
      <Panel>
        <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr_0.9fr]">
          <div>
            {eyebrowLabel(workspaceGuide.eyebrow)}
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">
              {workspaceGuide.title}
            </h2>
            <p className="mt-2 text-sm text-chrome-700">{workspaceGuide.summary}</p>
          </div>
          <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
            <p className="font-medium text-chrome-950">這頁要交代的證據</p>
            <div className="mt-3 space-y-2">
              {workspaceGuide.evidenceTargets.map((item) => (
                <div key={item} className="flex items-start gap-3 text-sm text-chrome-700">
                  <span className="mt-1 h-2 w-2 rounded-full bg-chrome-950" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
            <p className="font-medium text-chrome-950">建議截圖與下一步</p>
            <p className="mt-3 text-sm text-chrome-700">{workspaceGuide.screenshotHint}</p>
            <p className="mt-3 text-sm text-chrome-700">{workspaceGuide.nextStep}</p>
          </div>
        </div>
      </Panel>
    )
  }

  function renderDashboard() {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Metric label="場域數" value={dashboard?.siteCount ?? sites.length} hint="以場域地圖作為規劃脈絡" />
          <Metric label="啟用航線" value={dashboard?.activeRouteCount ?? routes.length} hint="可重用的巡檢航線版本" />
          <Metric
            label="啟用模板"
            value={dashboard?.activeTemplateCount ?? templates.length}
            hint="巡檢策略、證據與報表政策"
          />
          <Metric
            label="已排程"
            value={dashboard?.scheduledMissionCount ?? siteSchedules.filter((item) => item.status === 'scheduled').length}
            hint="待執行排程"
          />
          <Metric
            label="待派工任務"
            value={dashboard?.dispatchPendingCount ?? siteDispatches.filter((item) => ['queued', 'assigned', 'sent'].includes(item.status)).length}
            hint="等候 dispatch 與 handoff"
          />
          <Metric
            label="執行中任務"
            value={dashboard?.runningMissionCount ?? siteMissions.filter((item) => item.status === 'running').length}
            hint="已派工且正在執行的任務"
          />
          <Metric
            label="失敗任務"
            value={dashboard?.failedMissionCount ?? siteMissions.filter((item) => item.status === 'failed').length}
            hint="需要 support / live ops 追蹤"
          />
          <Metric
            label="待處理告警"
            value={dashboard?.alertSummary.openCount ?? 0}
            hint={`嚴重 ${dashboard?.alertSummary.criticalCount ?? 0} / 警示 ${dashboard?.alertSummary.warningCount ?? 0}`}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Panel>
            {eyebrowLabel('場域覆蓋')}
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
              {eyebrowLabel('場域摘要')}
              <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">目前場域</h2>
              <p className="mt-2 text-sm text-chrome-700">{selectedSiteHint(selectedSite)}</p>
              {selectedSite ? (
                <dl className="mt-4 grid gap-3">
                  <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-3">
                    <dt className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">座標</dt>
                    <dd className="mt-2 text-sm text-chrome-900">
                      {selectedSite.location.lat}, {selectedSite.location.lng}
                    </dd>
                  </div>
                  <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-3">
                    <dt className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">備註</dt>
                    <dd className="mt-2 text-sm text-chrome-900">{selectedSite.notes || '尚未補充場域說明。'}</dd>
                  </div>
                  <div className="grid gap-3 md:grid-cols-4">
                    <Metric label="地圖版本" value={selectedSite.siteMap.version ?? 1} />
                    <Metric label="區域" value={selectedSite.siteMap.zones.length} />
                    <Metric label="起降點" value={selectedSite.siteMap.launchPoints.length} />
                    <Metric label="視角點" value={selectedSite.siteMap.viewpoints.length} />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Link
                      to={`/sites/${selectedSite.siteId}`}
                      className="inline-flex items-center justify-center rounded-full border border-chrome-300 px-4 py-2 text-sm font-medium text-chrome-950 transition hover:border-chrome-500"
                    >
                      開啟場域工作區
                    </Link>
                    <Link
                      to="/control-plane/routes"
                      className="inline-flex items-center justify-center rounded-full border border-chrome-300 px-4 py-2 text-sm font-medium text-chrome-950 transition hover:border-chrome-500"
                    >
                      查看航線工作區
                    </Link>
                  </div>
                </dl>
              ) : null}
            </Panel>

            <Panel>
              {eyebrowLabel('異常與報表')}
              <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">最近異常與報表</h2>
              <div className="mt-4 grid gap-3">
                <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                  <p className="font-medium text-chrome-950">最新異常</p>
                  <p className="mt-2 text-sm text-chrome-700">
                    {dashboard?.latestEventSummary?.summary ?? '目前沒有新的異常摘要。'}
                  </p>
                </div>
                <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                  <p className="font-medium text-chrome-950">最新報表</p>
                  <p className="mt-2 text-sm text-chrome-700">
                    {dashboard?.latestReportSummary?.summary ?? '目前沒有新的巡檢報表。'}
                  </p>
                </div>
                <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                  <p className="font-medium text-chrome-950">營運提醒</p>
                  <p className="mt-2 text-sm text-chrome-700">
                    待處理 {dashboard?.alertSummary.openCount ?? 0} / 嚴重 {dashboard?.alertSummary.criticalCount ?? 0}
                  </p>
                </div>
              </div>
            </Panel>

            <Panel>
              {eyebrowLabel('告警中心')}
              <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">最近告警</h2>
              <div className="mt-4 space-y-3">
                {dashboard?.recentAlerts.length ? (
                  dashboard.recentAlerts.map((alert) => (
                    <div
                      key={alert.alertId}
                      className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-chrome-950">{alert.title}</p>
                        <span className="rounded-full bg-chrome-100 px-3 py-1 text-xs text-chrome-700">
                          {formatSupportCategory(alert.category)}
                        </span>
                        <span className="rounded-full bg-chrome-100 px-3 py-1 text-xs text-chrome-700">
                          {formatSupportSeverity(alert.severity)}
                        </span>
                        <span className="rounded-full bg-white px-3 py-1 text-xs text-chrome-700">
                          {formatStatus(alert.status)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-chrome-700">{alert.summary}</p>
                      <p className="mt-2 text-sm text-chrome-700">
                        建議下一步：{alert.recommendedNextStep}
                      </p>
                      <p className="mt-2 text-xs text-chrome-500">
                        {alert.siteName ?? '未指定場域'} / {alert.missionName ?? '未指定任務'} /{' '}
                        {alert.lastObservedAt ? formatDateTime(alert.lastObservedAt) : '尚未記錄觀測時間'}
                      </p>
                    </div>
                  ))
                ) : (
                  <EmptyState
                    title="目前沒有告警"
                    body="告警中心會收斂遙測、派工、任務與報表的異常。"
                  />
                )}
              </div>
            </Panel>
          </div>
        </div>

        <Panel>
          {eyebrowLabel('執行摘要')}
          <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">最近執行狀態</h2>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {dashboard?.recentExecutionSummaries.length ? (
              dashboard.recentExecutionSummaries.map((summary) => (
                <div
                  key={summary.missionId}
                  className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <Link to={`/missions/${summary.missionId}`} className="font-medium text-chrome-950 underline underline-offset-4">
                      {missionById.get(summary.missionId)?.missionName ?? summary.missionId}
                    </Link>
                    <StatusBadge status={summary.phase} />
                  </div>
                  <p className="mt-2 text-sm text-chrome-700">{executionSummaryHint(summary)}</p>
                  <p className="mt-2 text-xs text-chrome-500">
                    影像 {summary.lastImageryAt ? formatDateTime(summary.lastImageryAt) : '尚未收到'} / 遙測{' '}
                    {summary.lastTelemetryAt ? formatDateTime(summary.lastTelemetryAt) : '尚未收到'}
                  </p>
                  {summary.failureReason ? (
                    <p className="mt-2 text-xs text-red-700">{summary.failureReason}</p>
                  ) : null}
                </div>
              ))
            ) : (
              <EmptyState
                title="目前沒有執行摘要"
                body="mission execution summary 會在排程、派工與報表開始產生後出現在這裡。"
              />
            )}
          </div>
        </Panel>

        <Panel>
          {eyebrowLabel('演示流程')}
          <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">
            評審要看到的完整故事
          </h2>
          <div className="mt-4 grid gap-3 lg:grid-cols-5">
            {WORKSPACES.map((item, index) => (
              <div
                key={item.key}
                className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4"
              >
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">步驟 {index + 1}</p>
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
        {auth.isInternal ? (
          <div className="xl:col-span-2">
            <InternalRouteEditorPanel
              site={selectedSite}
              routes={siteRoutes}
              selectedRouteId={selectedRouteId}
              routeName={routeName}
              routeDescription={routeDescription}
              waypoints={routeDraftWaypoints}
              routeError={routeError}
              isSaving={createRoute.isPending || updateRoute.isPending}
              onSelectedRouteIdChange={setSelectedRouteId}
              onRouteNameChange={setRouteName}
              onRouteDescriptionChange={setRouteDescription}
              onWaypointsChange={setRouteDraftWaypoints}
              onSeedDemoDraft={seedRouteDraftFromSite}
              onSave={() => void handleSaveRouteDraft()}
            />
          </div>
        ) : (
          <Panel>
            {eyebrowLabel('航線摘要')}
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">航線摘要</h2>
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-chrome-200 bg-chrome-50/80 px-4 py-4 text-sm text-chrome-700">
                客戶角色只檢視航線版本、預估時間與覆蓋範圍。Waypoint authority 由 internal 規劃團隊持有，不在客戶面開放直接編輯。
              </div>
              <DataList
                rows={[
                  { label: '場域', value: selectedSite?.name ?? '尚未選定' },
                  { label: '航線數量', value: siteRoutes.length },
                  {
                    label: '展示重點',
                    value: '客戶面只看 route summary、preview coverage 與 estimated duration，不直接承擔 waypoint 規劃責任。',
                  },
                ]}
              />
            </div>
          </Panel>
        )}

        <Panel>
          {eyebrowLabel('航線資產')}
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
          {eyebrowLabel('模板建立')}
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
            <Field label="模板說明" hint="固定巡檢策略、告警規則、證據政策與報表模式。">
              <TextArea
                readOnly
                value="巡檢策略 = facade-standard；證據政策 = capture_key_frames；報表模式 = html_report"
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
          {eyebrowLabel('模板資產')}
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
          {eyebrowLabel('排程建立')}
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
            <Field label="暫停原因預設值" hint="供排程看板的暫停動作重用。">
              <Input
                value={schedulePauseReason}
                onChange={(event) => setSchedulePauseReason(event.target.value)}
                placeholder="例如：天候不佳，暫停起飛窗口。"
              />
            </Field>
            <Field label="排程政策" hint="先用單次或簡化 recurrence 展示控制平面的核心訊息。">
              <TextArea readOnly value="狀態 = 已排程；週期 = 每週一 09:00；告警覆蓋 = 任務失敗 / 分析失敗 / 報表失敗" />
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
          {eyebrowLabel('排程看板')}
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
                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    <Metric label="最近結果" value={schedule.lastOutcome ?? 'scheduled_for_execution'} />
                    <Metric label="暫停原因" value={schedule.pauseReason ?? '無'} />
                    <Metric
                      label="最近派工"
                      value={schedule.lastDispatchedAt ? formatDateTime(schedule.lastDispatchedAt) : '尚未派工'}
                    />
                    <Metric label="告警規則" value={schedule.alertRules.length} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {schedule.status !== 'paused' ? (
                      <ActionButton
                        variant="secondary"
                        disabled={!canWriteSelectedSite || updateSchedule.isPending}
                        onClick={() => void handleScheduleTransition(schedule.scheduleId, 'paused')}
                      >
                        暫停排程
                      </ActionButton>
                    ) : (
                      <ActionButton
                        variant="secondary"
                        disabled={!canWriteSelectedSite || updateSchedule.isPending}
                        onClick={() => void handleScheduleTransition(schedule.scheduleId, 'scheduled')}
                      >
                        恢復排程
                      </ActionButton>
                    )}
                    {schedule.status !== 'completed' ? (
                      <ActionButton
                        variant="secondary"
                        disabled={!canWriteSelectedSite || updateSchedule.isPending}
                        onClick={() => void handleScheduleTransition(schedule.scheduleId, 'completed')}
                      >
                        標記完成
                      </ActionButton>
                    ) : null}
                    {schedule.status !== 'cancelled' ? (
                      <ActionButton
                        variant="secondary"
                        disabled={!canWriteSelectedSite || updateSchedule.isPending}
                        onClick={() => void handleScheduleTransition(schedule.scheduleId, 'cancelled')}
                      >
                        取消排程
                      </ActionButton>
                    ) : null}
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
          {eyebrowLabel('派工設定')}
          <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">建立派工</h2>
          <div className="mt-4 grid gap-4">
            <Field label="負責人">
              <Input
                value={dispatchAssignee}
                onChange={(event) => setDispatchAssignee(event.target.value)}
                placeholder="例如：observer-01"
              />
            </Field>
            <Field label="執行對象">
              <Input
                value={dispatchExecutionTarget}
                onChange={(event) => setDispatchExecutionTarget(event.target.value)}
                placeholder="例如：field-team"
              />
            </Field>
            <Field label="派工說明">
              <TextArea
                value={dispatchNote}
                onChange={(event) => setDispatchNote(event.target.value)}
                placeholder="例如：由 observer-01 進行現場執行與回報。"
              />
            </Field>
            <div className="grid gap-3 md:grid-cols-3">
              <Metric label="綁定航線" value={siteRoutes[0]?.name ?? '尚未建立'} />
              <Metric label="綁定模板" value={siteTemplates[0]?.name ?? '尚未建立'} />
              <Metric
                label="綁定排程"
                value={
                  siteSchedules[0]
                    ? siteSchedules[0].nextRunAt
                      ? formatDateTime(siteSchedules[0].nextRunAt)
                      : recurrenceLabel(siteSchedules[0].recurrence)
                    : '尚未建立'
                }
              />
            </div>
            {dispatchError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {dispatchError}
              </div>
            ) : null}
            <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4 text-sm text-chrome-700">
              派工只定義任務執行責任與交接備註，不代表 web 或 server 端進入飛行控制迴路。
            </div>
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel>
            {eyebrowLabel('任務佇列')}
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">任務佇列</h2>
            <div className="mt-4 space-y-4">
              {siteMissions.length === 0 ? (
                <EmptyState
                  title="目前沒有任務"
                  body="先建立任務，派工工作區才會出現可指派的 mission。"
                />
              ) : (
                siteMissions.map((mission) => {
                  const dispatch = dispatchByMissionId.get(mission.missionId)
                  return (
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
                        <div className="flex flex-wrap gap-2">
                          <StatusBadge status={mission.status} />
                          {dispatch ? <StatusBadge status={dispatch.status} /> : null}
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-4">
                        <Metric label="建立時間" value={formatDateTime(mission.createdAt)} />
                        <Metric
                          label="負責人"
                          value={dispatch?.assignee ?? (dispatchAssignee.trim() || '尚未指定')}
                        />
                        <Metric
                          label="執行對象"
                          value={dispatch?.executionTarget ?? (dispatchExecutionTarget.trim() || '尚未指定')}
                        />
                        <Metric
                          label="最新派工"
                          value={dispatch ? dispatchTransitionCopy(dispatch.status) : '尚未建立派工'}
                        />
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {!dispatch ? (
                          <ActionButton
                            disabled={
                              !canWriteSelectedSite ||
                              dispatchMission.isPending ||
                              !siteRoutes[0] ||
                              !siteTemplates[0] ||
                              !siteSchedules[0]
                            }
                            onClick={() => void handleDispatchMission(mission.missionId)}
                          >
                            {dispatchMission.isPending ? '派工中…' : '建立派工'}
                          </ActionButton>
                        ) : null}
                        {dispatch?.status === 'queued' || dispatch?.status === 'assigned' ? (
                          <ActionButton
                            variant="secondary"
                            disabled={!canWriteSelectedSite || updateDispatch.isPending}
                            onClick={() => void handleDispatchTransition(dispatch.dispatchId, 'sent')}
                          >
                            標記已送出
                          </ActionButton>
                        ) : null}
                        {dispatch?.status === 'sent' ? (
                          <ActionButton
                            variant="secondary"
                            disabled={!canWriteSelectedSite || updateDispatch.isPending}
                            onClick={() => void handleDispatchTransition(dispatch.dispatchId, 'accepted')}
                          >
                            接受派工
                          </ActionButton>
                        ) : null}
                        {dispatch?.status === 'accepted' ? (
                          <ActionButton
                            variant="secondary"
                            disabled={!canWriteSelectedSite || updateDispatch.isPending}
                            onClick={() => void handleDispatchTransition(dispatch.dispatchId, 'completed')}
                          >
                            標記完成
                          </ActionButton>
                        ) : null}
                        {dispatch && !['completed', 'failed'].includes(dispatch.status) ? (
                      <ActionButton
                        variant="secondary"
                        disabled={!canWriteSelectedSite || updateDispatch.isPending}
                        onClick={() => void handleDispatchTransition(dispatch.dispatchId, 'failed')}
                          >
                            標記失敗
                          </ActionButton>
                        ) : null}
                        <Link
                          to={`/missions/${mission.missionId}`}
                          className="inline-flex items-center justify-center rounded-full border border-chrome-300 px-4 py-2 text-sm font-medium text-chrome-950 transition hover:border-chrome-500"
                        >
                          查看任務詳情
                        </Link>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </Panel>

          <Panel>
            {eyebrowLabel('派工看板')}
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">派工看板</h2>
            <div className="mt-4 space-y-4">
              {siteDispatches.length === 0 ? (
                <EmptyState
                  title="目前沒有派工紀錄"
                  body="建立派工後，這裡會顯示 assignee、execution target、接受與關閉時間，以及與 mission/report 的對齊狀態。"
                />
              ) : (
                siteDispatches.map((dispatch) => {
                  const mission = siteMissions.find((item) => item.missionId === dispatch.missionId)
                  return (
                    <div
                      key={dispatch.dispatchId}
                      className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-chrome-950">
                            {mission?.missionName ?? dispatch.missionId}
                          </p>
                          <p className="mt-1 text-sm text-chrome-700">
                            {dispatch.assignee ?? '未指派'} / {dispatch.executionTarget ?? '未指定執行對象'}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <StatusBadge status={dispatch.status} />
                          {mission ? <StatusBadge status={mission.status} /> : null}
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-4">
                        <Metric label="派工建立" value={formatDateTime(dispatch.dispatchedAt)} />
                        <Metric
                          label="接受時間"
                          value={dispatch.acceptedAt ? formatDateTime(dispatch.acceptedAt) : '尚未接受'}
                        />
                        <Metric
                          label="關閉時間"
                          value={dispatch.closedAt ? formatDateTime(dispatch.closedAt) : '尚未關閉'}
                        />
                        <Metric label="最後更新" value={formatDateTime(dispatch.lastUpdatedAt)} />
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <Metric label="route" value={dispatch.routeId ?? '未綁定'} />
                        <Metric label="template" value={dispatch.templateId ?? '未綁定'} />
                        <Metric label="schedule" value={dispatch.scheduleId ?? '未綁定'} />
                      </div>
                      <div className="mt-4 rounded-2xl border border-chrome-200 bg-white px-4 py-3 text-sm text-chrome-700">
                        {dispatch.note ?? '目前沒有交接備註。'}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </Panel>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="自主巡檢控制平面"
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

      {renderWorkspaceGuide()}

      {workspace.key === 'dashboard' ? renderDashboard() : null}
      {workspace.key === 'routes' ? renderRoutesWorkspace() : null}
      {workspace.key === 'templates' ? renderTemplatesWorkspace() : null}
      {workspace.key === 'schedules' ? renderSchedulesWorkspace() : null}
      {workspace.key === 'dispatch' ? renderDispatchWorkspace() : null}
    </div>
  )
}
