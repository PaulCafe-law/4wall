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
      label: `${site.name} 進場點`,
      headingDeg: 45,
      dwellSeconds: 0,
    },
    {
      kind: 'inspection_viewpoint' as const,
      lat: site.location.lat,
      lng: site.location.lng,
      altitudeM: inspectionAltitudeM,
      label: `${site.name} 外牆巡檢點`,
      headingDeg: 180,
      dwellSeconds,
    },
    {
      kind: 'hold' as const,
      lat: site.location.lat + DEFAULT_ROUTE_OFFSET,
      lng: site.location.lng + DEFAULT_ROUTE_OFFSET,
      altitudeM: transitAltitudeM,
      label: `${site.name} 離場待命點`,
      headingDeg: 0,
      dwellSeconds: Math.max(5, Math.floor(dwellSeconds / 2)),
    },
  ]
}

function defaultAlertRules() {
  return [
    { kind: 'mission_failure' as const, enabled: true, note: '標記派工或任務執行失敗。' },
    { kind: 'analysis_failure' as const, enabled: true, note: '標記事件分析流程失敗。' },
    { kind: 'report_generation_failure' as const, enabled: true, note: '標記報表產生失敗。' },
  ]
}

function recurrenceLabel(value: string) {
  if (!value) {
    return '單次'
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
      ? '請先選擇任務，才能載入派工、事件與報表脈絡。'
      : missionDetail.reportStatus === 'ready'
        ? missionDetail.eventCount === 0
          ? '目前已有無異常報表，可作為 demo 的 clean-pass 交付版本。'
          : '目前已有含事件與證據檔案的報表，可直接展示給利害關係人。'
        : missionDetail.reportStatus === 'failed'
          ? missionDetail.latestReport?.summary ?? '目前選取的任務正處於報表產生失敗示範狀態。'
          : '目前選取的任務仍需先完成報表流程，才算走完整條 demo 路徑。'

  return [
    {
      key: 'site',
      title: '已選擇場域背景',
      status: selectedSite ? 'ready' : 'failed',
      body: selectedSite
        ? `${selectedSite.name} 已作為目前 demo 演練的場域錨點。`
        : '請先選擇場域，再開始 route-to-report 彩排。',
      to: '/sites',
      actionLabel: '前往場域',
    },
    {
      key: 'route',
      title: '航線與模板已就緒',
      status: routesCount > 0 && templatesCount > 0 ? 'ready' : 'planning',
      body:
        routesCount > 0 && templatesCount > 0
          ? `目前已有 ${routesCount} 條航線與 ${templatesCount} 個模板可供演練。`
          : '請至少建立一條航線與一個模板，任務才能展示可重複使用的規劃資料。',
      to: '/control-plane',
      actionLabel: '查看規劃資產',
    },
    {
      key: 'schedule',
      title: '已掛接排程',
      status: schedulesCount > 0 ? 'ready' : 'planning',
      body:
        schedulesCount > 0
          ? `目前已有 ${schedulesCount} 筆排程可用於 route-to-dispatch 演練。`
          : '請建立排程，demo 才能展示巡檢預定執行時間。',
      to: '/control-plane',
      actionLabel: '查看排程',
    },
    {
      key: 'dispatch',
      title: '已掛接任務派工',
      status: missionDetail?.dispatch ? 'ready' : 'planning',
      body: missionDetail?.dispatch
        ? `任務 ${missionDetail.missionName} 已有派工資料，執行目標為 ${missionDetail.dispatch.executionTarget ?? '現場團隊'}。`
        : '請為選取任務建立派工，任務詳情才會完整顯示航線、模板、排程與執行人員。',
      to: missionDetail ? `/missions/${missionDetail.missionId}` : '/missions',
      actionLabel: missionDetail ? '開啟任務詳情' : '前往任務',
    },
    {
      key: 'report',
      title: '事件與報表輸出已就緒',
      status: missionReportStatus === 'not_started' ? 'planning' : missionReportStatus,
      body: reportBody,
      to: missionDetail ? `/missions/${missionDetail.missionId}` : '/missions',
      actionLabel: missionDetail ? '查看報表輸出' : '選擇任務',
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
      title: '截圖場域與規劃脈絡',
      body: '請在控制平面頁面截一張圖，需同時包含目前場域、航線卡片、模板卡片與排程卡片。',
    },
    {
      title: '截圖派工掛接狀態',
      body: missionDetail?.dispatch
        ? '請在任務詳情頁截圖，確認其中有航線、模板、排程與派工資料。'
        : '完成派工後，請在任務詳情頁截圖，確認航線、模板、排程與派工資料都有顯示。',
    },
    {
      title: '截圖報表輸出',
      body:
        missionDetail?.reportStatus === 'ready'
          ? missionDetail.eventCount === 0
            ? '請截圖無異常報表摘要與可下載的 HTML 報表檔案。'
            : '請截圖事件清單、證據圖庫與可下載的 HTML 報表檔案。'
          : '請先截圖一次報表失敗或待處理狀態，再重跑分析並截圖恢復後的輸出。',
    },
  ]

  if (isInternal) {
    prompts.push({
      title: '截圖內部營運對齊畫面',
      body: '請在支援工作台與即時營運頁各截一張圖，確認報表失敗任務與任務詳情的狀態一致。',
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
      setRouteError('建立航線前，請先選擇場域。')
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
      setRouteError(formatApiError(detail, '無法建立巡檢航線。'))
    }
  }

  async function handleCreateTemplate() {
    if (!selectedSite) {
      setTemplateError('建立模板前，請先選擇場域。')
      return
    }
    if (!templateName.trim()) {
      setTemplateError('請輸入模板名稱。')
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
      setTemplateError(formatApiError(detail, '無法建立巡檢模板。'))
    }
  }

  async function handleCreateSchedule() {
    if (!selectedSite) {
      setScheduleError('建立排程前，請先選擇場域。')
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
      setScheduleError(formatApiError(detail, '無法建立巡檢排程。'))
    }
  }

  async function handleDispatchMission() {
    if (!effectiveDispatchMissionId) {
      setDispatchError('派工前，請先選擇任務。')
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
      setDispatchError(formatApiError(detail, '無法建立任務派工。'))
    }
  }

  if (sitesQuery.isLoading && !sitesQuery.data) {
    return (
      <Panel>
          <p className="text-sm text-chrome-700">正在載入控制平面資料…</p>
      </Panel>
    )
  }

  if (!selectedSite) {
    return (
      <EmptyState
        title="目前沒有可用的控制平面場域"
        body="請先建立場域。控制平面會以場域作為地圖、排程與派工的基礎脈絡。"
        action={
          <Link
            to="/sites"
            className="inline-flex rounded-full border border-chrome-300 bg-white px-4 py-2 text-sm text-chrome-950"
          >
            前往場域
          </Link>
        }
      />
    )
  }

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="自主巡檢控制平面"
        title="控制平面"
        subtitle="在不引入任何即時飛行控制路徑的前提下，規劃航線、建立可重複使用的巡檢模板、設定排程，並管理任務派工。"
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Metric label="場域" value={sites.length} />
        <Metric label="航線" value={routes.length} />
        <Metric label="模板" value={templates.length} />
        <Metric label="排程" value={schedules.length} />
        <Metric label="任務" value={missions.length} />
        <Metric label="模式" value={canWriteSelectedSite ? '可寫入' : '唯讀'} />
      </div>

      <Panel>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <div className="space-y-3">
            <Field label="場域脈絡">
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
                你目前對這個場域只有唯讀權限。客戶檢視者與唯讀支援角色可以查看控制平面資料，但不能修改。
              </div>
            ) : null}
          </div>
          <DataList
            rows={[
               { label: '地址', value: selectedSite.address },
              {
                 label: '座標',
                value: `${selectedSite.location.lat.toFixed(5)}, ${selectedSite.location.lng.toFixed(5)}`,
              },
               { label: '外部參考', value: selectedSite.externalRef ?? '未設定' },
               { label: '備註', value: selectedSite.notes || '目前沒有場域備註。' },
            ]}
          />
        </div>
      </Panel>

      <Panel>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">示範彩排</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">巡檢到報表演練路徑</h2>
            <p className="mt-2 text-sm text-chrome-700">
              這個面板用來演練完整故事線：場域、航線、排程、派工、任務詳情、事件輸出與報表檔案。它只提供規劃與監看，不進入飛行關鍵控制。
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
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">目前任務</p>
              <p className="mt-2 font-medium text-chrome-950">
                {selectedMissionDetail ? selectedMissionDetail.missionName : '目前尚未選擇任務'}
              </p>
              <p className="mt-2 text-sm text-chrome-700">
                {selectedMissionDetail
                  ? `報表 ${selectedMissionDetail.reportStatus}｜事件 ${selectedMissionDetail.eventCount} 筆｜派工 ${selectedMissionDetail.dispatch?.status ?? '尚未掛接'}`
                  : '請先選擇或建立任務，演練才可驗證規劃資料與報表輸出。'}
              </p>
              {selectedMissionDetailQuery.isLoading ? (
                <p className="mt-2 text-xs text-chrome-500">正在載入任務演練狀態…</p>
              ) : null}
            </div>

            <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">建議截圖證據</p>
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
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">航線切片</p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">建立巡檢航線</h2>
          <p className="mt-2 text-sm text-chrome-700">
            這個切片會依所選場域建立 demo 用的安全航線外框，只產生規劃資料，不會送出飛行控制命令。
          </p>
          <div className="mt-4 grid gap-4">
            <Field label="航線名稱">
              <Input value={routeName} onChange={(event) => setRouteName(event.target.value)} />
            </Field>
            <Field label="說明">
              <TextArea value={routeDescription} onChange={(event) => setRouteDescription(event.target.value)} />
            </Field>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="移動高度（m）">
                <Input value={transitAltitudeM} onChange={(event) => setTransitAltitudeM(event.target.value)} type="number" />
              </Field>
              <Field label="巡檢高度（m）">
                <Input value={inspectionAltitudeM} onChange={(event) => setInspectionAltitudeM(event.target.value)} type="number" />
              </Field>
              <Field label="停留秒數">
                <Input value={dwellSeconds} onChange={(event) => setDwellSeconds(event.target.value)} type="number" />
              </Field>
            </div>
            {routeError ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{routeError}</div> : null}
            <div className="flex justify-end">
              <ActionButton disabled={!canWriteSelectedSite || createRoute.isPending} onClick={() => void handleCreateRoute()}>
                {createRoute.isPending ? '建立航線中…' : '建立航線'}
              </ActionButton>
            </div>
          </div>
        </Panel>

        <Panel>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">模板切片</p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">建立巡檢模板</h2>
          <p className="mt-2 text-sm text-chrome-700">
            模板會固定巡檢設定與告警規則，方便反覆演練與展示。
          </p>
          <div className="mt-4 grid gap-4">
            <Field label="模板名稱">
              <Input value={templateName} onChange={(event) => setTemplateName(event.target.value)} />
            </Field>
            <Field label="航線">
              <Select value={effectiveTemplateRouteId} onChange={(event) => setTemplateRouteId(event.target.value)} disabled={routes.length === 0}>
                {routes.length === 0 ? <option value="">請先建立航線</option> : null}
                {routes.map((route) => (
                  <option key={route.routeId} value={route.routeId}>
                    {route.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="巡檢設定">
              <Select value={inspectionProfile} onChange={(event) => setInspectionProfile(event.target.value)}>
                <option value="facade-standard">外牆標準巡檢</option>
                <option value="roof-scan">屋頂掃描</option>
                <option value="handover-audit">交付查核</option>
              </Select>
            </Field>
            <Field label="說明">
              <TextArea value={templateDescription} onChange={(event) => setTemplateDescription(event.target.value)} />
            </Field>
            {templateError ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{templateError}</div> : null}
            <div className="flex justify-end">
              <ActionButton disabled={!canWriteSelectedSite || createTemplate.isPending || routes.length === 0} onClick={() => void handleCreateTemplate()}>
                {createTemplate.isPending ? '建立模板中…' : '建立模板'}
              </ActionButton>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">排程切片</p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">建立排程</h2>
          <p className="mt-2 text-sm text-chrome-700">
            排程會明確記錄預定執行時間，並保留 demo 所需的告警設定。
          </p>
          <div className="mt-4 grid gap-4">
            <Field label="航線">
              <Select value={effectiveScheduleRouteId} onChange={(event) => setScheduleRouteId(event.target.value)} disabled={routes.length === 0}>
                {routes.length === 0 ? <option value="">請先建立航線</option> : null}
                {routes.map((route) => (
                  <option key={route.routeId} value={route.routeId}>
                    {route.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="模板">
              <Select value={effectiveScheduleTemplateId} onChange={(event) => setScheduleTemplateId(event.target.value)} disabled={templates.length === 0}>
                {templates.length === 0 ? <option value="">請先建立模板</option> : null}
                {templates.map((template) => (
                  <option key={template.templateId} value={template.templateId}>
                    {template.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="預定時間">
              <Input type="datetime-local" value={plannedAt} onChange={(event) => setPlannedAt(event.target.value)} />
            </Field>
            <Field label="重複規則">
              <Input value={recurrence} onChange={(event) => setRecurrence(event.target.value)} placeholder="例如：每週一、三、五" />
            </Field>
            <Field label="狀態">
              <Select value={scheduleStatus} onChange={(event) => setScheduleStatus(event.target.value as 'scheduled' | 'paused')}>
                  <option value="scheduled">已排程</option>
                  <option value="paused">已暫停</option>
              </Select>
            </Field>
            {scheduleError ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{scheduleError}</div> : null}
            <div className="flex justify-end">
              <ActionButton disabled={!canWriteSelectedSite || createSchedule.isPending || (routes.length === 0 && templates.length === 0)} onClick={() => void handleCreateSchedule()}>
                {createSchedule.isPending ? '建立排程中…' : '建立排程'}
              </ActionButton>
            </div>
          </div>
        </Panel>

        <Panel>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">派工切片</p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">建立任務派工</h2>
          <p className="mt-2 text-sm text-chrome-700">
            派工只停留在任務層級，僅記錄執行目標、指派資訊與掛接中的規劃資料。
          </p>
          <div className="mt-4 grid gap-4">
            <Field label="任務">
              <Select value={effectiveDispatchMissionId} onChange={(event) => setDispatchMissionId(event.target.value)} disabled={missions.length === 0}>
                {missions.length === 0 ? <option value="">請先建立任務</option> : null}
                {missions.map((mission) => (
                  <option key={mission.missionId} value={mission.missionId}>
                    {mission.missionName}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="航線">
                <Select value={effectiveDispatchRouteId} onChange={(event) => setDispatchRouteId(event.target.value)} disabled={routes.length === 0}>
                  {routes.length === 0 ? <option value="">目前沒有航線</option> : null}
                  {routes.map((route) => (
                    <option key={route.routeId} value={route.routeId}>
                      {route.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="模板">
                <Select value={effectiveDispatchTemplateId} onChange={(event) => setDispatchTemplateId(event.target.value)} disabled={templates.length === 0}>
                  {templates.length === 0 ? <option value="">目前沒有模板</option> : null}
                  {templates.map((template) => (
                    <option key={template.templateId} value={template.templateId}>
                      {template.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="排程">
                <Select value={effectiveDispatchScheduleId} onChange={(event) => setDispatchScheduleId(event.target.value)} disabled={schedules.length === 0}>
                  {schedules.length === 0 ? <option value="">目前沒有排程</option> : null}
                  {schedules.map((schedule) => (
                    <option key={schedule.scheduleId} value={schedule.scheduleId}>
                      {schedule.status} - {recurrenceLabel(schedule.recurrence ?? '')}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="指派對象">
                <Input value={dispatchAssignee} onChange={(event) => setDispatchAssignee(event.target.value)} placeholder="observer-01" />
              </Field>
              <Field label="執行目標">
                <Input value={dispatchTarget} onChange={(event) => setDispatchTarget(event.target.value)} placeholder="現場團隊" />
              </Field>
              <Field label="派工狀態">
                <Select value={dispatchStatus} onChange={(event) => setDispatchStatus(event.target.value as 'queued' | 'assigned' | 'sent' | 'accepted')}>
                  <option value="queued">待處理</option>
                  <option value="assigned">已指派</option>
                  <option value="sent">已送出</option>
                  <option value="accepted">已接受</option>
                </Select>
              </Field>
            </div>
            <Field label="派工備註">
              <TextArea value={dispatchNote} onChange={(event) => setDispatchNote(event.target.value)} />
            </Field>
            {dispatchError ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{dispatchError}</div> : null}
            {lastDispatchId ? (
              <div className="rounded-2xl border border-moss-200 bg-moss-50/60 px-4 py-3 text-sm text-moss-900">
                已記錄派工編號 <span className="font-mono">{lastDispatchId}</span>。請開啟任務詳情確認航線、模板、排程與派工資料都已掛接。
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <Link to={effectiveDispatchMissionId ? `/missions/${effectiveDispatchMissionId}` : '/missions'} className="text-sm text-chrome-700 underline underline-offset-2">
                開啟任務詳情
              </Link>
              <ActionButton disabled={!canWriteSelectedSite || dispatchMission.isPending || missions.length === 0 || (routes.length === 0 && templates.length === 0)} onClick={() => void handleDispatchMission()}>
                {dispatchMission.isPending ? '派工中…' : '建立派工'}
              </ActionButton>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">航線</p>
          <div className="mt-4 space-y-3">
            {routes.length === 0 ? (
              <EmptyState title="目前沒有航線" body="請先為這個 demo 切片建立第一條場域航線。" />
            ) : (
              routes.map((route) => (
                <div key={route.routeId} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-chrome-950">{route.name}</p>
                      <p className="text-sm text-chrome-700">{route.description || '目前沒有航線說明。'}</p>
                    </div>
                    <span className="rounded-full bg-chrome-100 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-chrome-700">
                      {route.pointCount} 個點位
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-chrome-600">更新時間 {formatDateTime(route.updatedAt)}</p>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">模板與排程</p>
          <div className="mt-4 space-y-3">
            {templates.length === 0 && schedules.length === 0 ? (
              <EmptyState title="目前沒有模板或排程" body="完成控制平面設定後，模板與排程就會出現在這裡。" />
            ) : null}
            {templates.map((template) => (
              <div key={template.templateId} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-chrome-950">{template.name}</p>
                    <p className="text-sm text-chrome-700">{template.description || '目前沒有模板說明。'}</p>
                  </div>
                  <span className="rounded-full bg-chrome-100 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-chrome-700">
                      {template.alertRules.length} 條告警規則
                  </span>
                </div>
              </div>
            ))}
            {schedules.map((schedule) => (
              <div key={schedule.scheduleId} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-chrome-950">{schedule.plannedAt ? formatDateTime(schedule.plannedAt) : '尚未設定演練時間'}</p>
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
