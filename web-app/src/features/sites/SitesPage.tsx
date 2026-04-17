import { useQueryClient } from '@tanstack/react-query'
import { useDeferredValue, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import {
  ActionButton,
  DataList,
  EmptyState,
  Field,
  Input,
  Metric,
  Modal,
  Panel,
  Select,
  ShellSection,
  TextArea,
  formatDateTime,
} from '../../components/ui'
import { ApiError, api, type SiteMapPayload, type SitePayload } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAuthedMutation, useAuthedQuery } from '../../lib/auth-query'
import { useOrganizationChoices } from '../../lib/organization-choices'
import { formatApiError, formatSearchMode } from '../../lib/presentation'
import type { Site } from '../../lib/types'

const DEFAULT_LAT = 25.03391
const DEFAULT_LNG = 121.56452

type CreateSiteForm = {
  organizationId: string
  name: string
  address: string
  externalRef: string
  lat: string
  lng: string
  notes: string
}

type EditSiteForm = {
  name: string
  address: string
  externalRef: string
  notes: string
  baseMapType: SiteMapPayload['baseMapType']
  centerLat: string
  centerLng: string
  zoom: string
  zoneLabel: string
  launchLabel: string
  viewpointLabel: string
}

function createDefaults(organizationId = ''): CreateSiteForm {
  return {
    organizationId,
    name: '',
    address: '',
    externalRef: '',
    lat: String(DEFAULT_LAT),
    lng: String(DEFAULT_LNG),
    notes: '',
  }
}

function editDefaults(site: Site): EditSiteForm {
  return {
    name: site.name,
    address: site.address,
    externalRef: site.externalRef ?? '',
    notes: site.notes,
    baseMapType: site.siteMap.baseMapType,
    centerLat: String(site.siteMap.center.lat),
    centerLng: String(site.siteMap.center.lng),
    zoom: String(site.siteMap.zoom),
    zoneLabel: site.siteMap.zones[0]?.label ?? `${site.name} 巡檢邊界`,
    launchLabel: site.siteMap.launchPoints[0]?.label ?? `${site.name} 主要起降點`,
    viewpointLabel: site.siteMap.viewpoints[0]?.label ?? `${site.name} 主立面視角`,
  }
}

function mapTypeLabel(value: Site['siteMap']['baseMapType']) {
  if (value === 'roadmap') return '道路底圖'
  if (value === 'hybrid') return '混合底圖'
  return '衛星底圖'
}

function formatDuration(seconds: number) {
  if (seconds <= 0) return '未估算'
  return `${Math.max(1, Math.round(seconds / 60))} 分鐘`
}

function buildSiteMapPayload(site: Site, form: EditSiteForm): SiteMapPayload {
  const centerLat = Number(form.centerLat)
  const centerLng = Number(form.centerLng)
  const zoom = Number(form.zoom)

  return {
    baseMapType: form.baseMapType,
    center: {
      lat: Number.isFinite(centerLat) ? centerLat : site.siteMap.center.lat,
      lng: Number.isFinite(centerLng) ? centerLng : site.siteMap.center.lng,
    },
    zoom: Number.isFinite(zoom) ? zoom : site.siteMap.zoom,
    version: site.siteMap.version,
    zones: site.siteMap.zones.map((zone, index) =>
      index === 0 ? { ...zone, label: form.zoneLabel.trim() || zone.label } : zone,
    ),
    launchPoints: site.siteMap.launchPoints.map((point, index) =>
      index === 0 ? { ...point, label: form.launchLabel.trim() || point.label } : point,
    ),
    viewpoints: site.siteMap.viewpoints.map((viewpoint, index) =>
      index === 0 ? { ...viewpoint, label: form.viewpointLabel.trim() || viewpoint.label } : viewpoint,
    ),
  }
}

export function SitesPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { siteId } = useParams()
  const { choices } = useOrganizationChoices('write')
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [createForm, setCreateForm] = useState<CreateSiteForm>(() => createDefaults(choices[0]?.organizationId ?? ''))
  const [editForm, setEditForm] = useState<EditSiteForm | null>(null)
  const deferredSearch = useDeferredValue(search)

  const sitesQuery = useAuthedQuery({ queryKey: ['sites'], queryFn: api.listSites, staleTime: 15_000 })
  const createSite = useAuthedMutation({
    mutationKey: ['sites', 'create'],
    mutationFn: ({ token, payload }: { token: string; payload: SitePayload }) => api.createSite(token, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['sites'] })
      setCreateOpen(false)
      setCreateError(null)
    },
  })
  const patchSite = useAuthedMutation({
    mutationKey: ['sites', 'patch'],
    mutationFn: ({
      token,
      payload,
    }: {
      token: string
      payload: { siteId: string; body: Parameters<typeof api.patchSite>[2] }
    }) => api.patchSite(token, payload.siteId, payload.body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['sites'] })
      setEditOpen(false)
      setEditError(null)
    },
  })

  const allSites = useMemo(() => sitesQuery.data ?? [], [sitesQuery.data])
  const filteredSites = useMemo(() => {
    const needle = deferredSearch.trim().toLowerCase()
    if (!needle) return allSites
    return allSites.filter((site) =>
      `${site.name} ${site.address} ${site.externalRef ?? ''}`.toLowerCase().includes(needle),
    )
  }, [allSites, deferredSearch])
  const selectedSite = filteredSites.find((site) => site.siteId === siteId) ?? filteredSites[0] ?? null

  async function handleCreateSite() {
    const lat = Number(createForm.lat)
    const lng = Number(createForm.lng)
    if (!createForm.organizationId || !createForm.name.trim() || !createForm.address.trim()) {
      setCreateError('請完整填寫組織、場域名稱與地址。')
      return
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setCreateError('請輸入有效的場域中心座標。')
      return
    }
    try {
      await createSite.mutateAsync({
        organizationId: createForm.organizationId,
        name: createForm.name.trim(),
        address: createForm.address.trim(),
        externalRef: createForm.externalRef.trim() || undefined,
        location: { lat, lng },
        notes: createForm.notes.trim(),
      })
      setCreateForm(createDefaults(createForm.organizationId))
    } catch (error) {
      setCreateError(formatApiError(error instanceof ApiError ? error.detail : undefined, '建立場域失敗。'))
    }
  }

  async function handleUpdateSite() {
    if (!selectedSite || !editForm) return
    try {
      await patchSite.mutateAsync({
        siteId: selectedSite.siteId,
        body: {
          name: editForm.name.trim(),
          address: editForm.address.trim(),
          externalRef: editForm.externalRef.trim() || undefined,
          notes: editForm.notes.trim(),
          location: { lat: Number(editForm.centerLat), lng: Number(editForm.centerLng) },
          siteMap: buildSiteMapPayload(selectedSite, editForm),
        },
      })
    } catch (error) {
      setEditError(formatApiError(error instanceof ApiError ? error.detail : undefined, '更新場域工作區失敗。'))
    }
  }

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="客戶工作區"
        title="場域"
        subtitle="把 site 從地址簿提升成真正的控制平面上下文：map、launch point、inspection viewpoint，以及 active route/template coverage 都在同一頁。"
        action={
          choices.length > 0 ? (
            <Modal
              open={createOpen}
              onOpenChange={setCreateOpen}
              title="新增場域"
              description="先建立 site，控制平面才有明確的 map context。"
              trigger={<ActionButton>新增場域</ActionButton>}
            >
              <div className="space-y-4">
                <Field label="組織">
                  <Select
                    value={createForm.organizationId}
                    onChange={(event) => setCreateForm((current) => ({ ...current, organizationId: event.target.value }))}
                  >
                    {choices.map((choice) => (
                      <option key={choice.organizationId} value={choice.organizationId}>
                        {choice.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="場域名稱">
                  <Input value={createForm.name} onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))} />
                </Field>
                <Field label="地址">
                  <Input value={createForm.address} onChange={(event) => setCreateForm((current) => ({ ...current, address: event.target.value }))} />
                </Field>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="中心緯度">
                    <Input value={createForm.lat} onChange={(event) => setCreateForm((current) => ({ ...current, lat: event.target.value }))} />
                  </Field>
                  <Field label="中心經度">
                    <Input value={createForm.lng} onChange={(event) => setCreateForm((current) => ({ ...current, lng: event.target.value }))} />
                  </Field>
                </div>
                <Field label="外部代號">
                  <Input
                    value={createForm.externalRef}
                    onChange={(event) => setCreateForm((current) => ({ ...current, externalRef: event.target.value }))}
                  />
                </Field>
                <Field label="備註">
                  <TextArea value={createForm.notes} onChange={(event) => setCreateForm((current) => ({ ...current, notes: event.target.value }))} />
                </Field>
                {createError ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{createError}</div>
                ) : null}
                <div className="flex justify-end">
                  <ActionButton disabled={createSite.isPending} onClick={handleCreateSite}>
                    {createSite.isPending ? '建立中' : '建立場域'}
                  </ActionButton>
                </div>
              </div>
            </Modal>
          ) : null
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="場域總數" value={filteredSites.length} hint="site map workspace 數量" />
        <Metric label="航線總數" value={filteredSites.reduce((sum, site) => sum + site.activeRouteCount, 0)} hint="active route coverage" />
        <Metric label="模板總數" value={filteredSites.reduce((sum, site) => sum + site.activeTemplateCount, 0)} hint="inspection policy reuse" />
        <Metric label="搜尋模式" value={formatSearchMode(Boolean(deferredSearch))} hint="快速切換評審要看的場域" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Panel>
            <Field label="搜尋場域">
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜尋場域名稱或地址" />
            </Field>
          </Panel>

          {!sitesQuery.isPending && filteredSites.length === 0 ? (
            <EmptyState
              title={allSites.length === 0 ? '目前還沒有場域' : '找不到符合條件的場域'}
              body={
                allSites.length === 0
                  ? '先建立 site，控制平面才有 map context 可以綁定 route、template、schedule 與 dispatch。'
                  : '請調整搜尋條件，或切回全部場域。'
              }
            />
          ) : null}

          <div className="grid gap-4">
            {filteredSites.map((site) => (
              <Link key={site.siteId} to={`/sites/${site.siteId}`}>
                <Panel className={selectedSite?.siteId === site.siteId ? 'border-ember-300 bg-white' : 'transition hover:border-chrome-400 hover:bg-white'}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words font-display text-2xl font-semibold text-chrome-950">{site.name}</p>
                      <p className="mt-2 text-sm text-chrome-700">{site.address}</p>
                    </div>
                    <span className="rounded-full bg-chrome-100 px-3 py-1 text-xs text-chrome-700">{mapTypeLabel(site.siteMap.baseMapType)}</span>
                  </div>
                  <div className="mt-4 grid gap-2 text-sm text-chrome-700 md:grid-cols-2">
                    <div>航線 {site.activeRouteCount}</div>
                    <div>模板 {site.activeTemplateCount}</div>
                    <div>zone {site.siteMap.zones.length}</div>
                    <div>viewpoint {site.siteMap.viewpoints.length}</div>
                  </div>
                </Panel>
              </Link>
            ))}
          </div>
        </div>

        {selectedSite ? (
          <div className="space-y-6">
            <Panel>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">site detail</p>
                  <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">{selectedSite.name}</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  {auth.canWriteOrganization(selectedSite.organizationId) ? (
                    <ActionButton
                      variant="secondary"
                      onClick={() => {
                        setEditForm(editDefaults(selectedSite))
                        setEditOpen(true)
                      }}
                    >
                      編輯場域工作區
                    </ActionButton>
                  ) : null}
                  <ActionButton variant="secondary" onClick={() => navigate('/control-plane')}>
                    控制平面總覽
                  </ActionButton>
                </div>
              </div>
              <div className="mt-4">
                <DataList
                  rows={[
                    { label: '地址', value: selectedSite.address },
                    { label: '外部代號', value: selectedSite.externalRef ?? '尚未設定' },
                    { label: '底圖', value: mapTypeLabel(selectedSite.siteMap.baseMapType) },
                    { label: '中心', value: `${selectedSite.siteMap.center.lat.toFixed(5)}, ${selectedSite.siteMap.center.lng.toFixed(5)}` },
                    { label: '更新時間', value: formatDateTime(selectedSite.updatedAt) },
                    { label: '備註', value: selectedSite.notes || '目前沒有額外說明' },
                  ]}
                />
              </div>
            </Panel>

            <div className="grid gap-4 md:grid-cols-3">
              <Metric label="Zone 數量" value={selectedSite.siteMap.zones.length} hint="巡檢區域與重點立面" />
              <Metric label="起降點" value={selectedSite.siteMap.launchPoints.length} hint="現場整備與起飛責任" />
              <Metric label="視角點" value={selectedSite.siteMap.viewpoints.length} hint="inspection intent 與 facade coverage" />
            </div>

            <Panel>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">map context</p>
              <h3 className="mt-2 font-display text-2xl font-semibold text-chrome-950">場域地圖與覆蓋脈絡</h3>
              <div className="mt-4 grid gap-4 xl:grid-cols-3">
                <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                  <p className="font-medium text-chrome-950">巡檢區域</p>
                  {selectedSite.siteMap.zones.map((zone) => (
                    <p key={zone.zoneId} className="mt-3 text-sm text-chrome-700">
                      {zone.label} · {zone.polygon.length} 個定位點
                    </p>
                  ))}
                </div>
                <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                  <p className="font-medium text-chrome-950">起降點</p>
                  {selectedSite.siteMap.launchPoints.map((point) => (
                    <p key={point.launchPointId} className="mt-3 text-sm text-chrome-700">
                      {point.label} · heading {point.headingDeg ?? 180}°
                    </p>
                  ))}
                </div>
                <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                  <p className="font-medium text-chrome-950">視角點</p>
                  {selectedSite.siteMap.viewpoints.map((viewpoint) => (
                    <p key={viewpoint.viewpointId} className="mt-3 text-sm text-chrome-700">
                      {viewpoint.label} · {viewpoint.purpose} · {viewpoint.distanceToFacadeM ?? 12}m
                    </p>
                  ))}
                </div>
              </div>
            </Panel>

            <div className="grid gap-4 xl:grid-cols-2">
              <Panel>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">active routes</p>
                    <h3 className="mt-2 font-display text-2xl font-semibold text-chrome-950">航線覆蓋</h3>
                  </div>
                  <ActionButton variant="secondary" onClick={() => navigate('/control-plane/routes')}>
                    打開航線工作區
                  </ActionButton>
                </div>
                <div className="mt-4 space-y-3">
                  {selectedSite.activeRoutes.length === 0 ? (
                    <EmptyState title="目前沒有航線" body="先建立 route，這個場域才有可重用的巡檢規劃版本。" />
                  ) : (
                    selectedSite.activeRoutes.map((route) => (
                      <div key={route.routeId} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                        <p className="font-medium text-chrome-950">{route.name}</p>
                        <p className="mt-2 text-sm text-chrome-700">
                          v{route.version} · {route.pointCount} 點 · {formatDuration(route.estimatedDurationSec)}
                        </p>
                        <p className="mt-1 text-xs text-chrome-500">更新於 {formatDateTime(route.updatedAt)}</p>
                      </div>
                    ))
                  )}
                </div>
              </Panel>

              <Panel>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">active templates</p>
                    <h3 className="mt-2 font-display text-2xl font-semibold text-chrome-950">模板覆蓋</h3>
                  </div>
                  <ActionButton variant="secondary" onClick={() => navigate('/control-plane/templates')}>
                    打開模板工作區
                  </ActionButton>
                </div>
                <div className="mt-4 space-y-3">
                  {selectedSite.activeTemplates.length === 0 ? (
                    <EmptyState title="目前沒有模板" body="先建立 template，把 evidence policy、report mode 與 review mode 固定下來。" />
                  ) : (
                    selectedSite.activeTemplates.map((template) => (
                      <div key={template.templateId} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                        <p className="font-medium text-chrome-950">{template.name}</p>
                        <p className="mt-2 text-sm text-chrome-700">
                          {template.evidencePolicy} · {template.reportMode}
                        </p>
                        <p className="mt-1 text-sm text-chrome-700">審閱模式 {template.reviewMode}</p>
                      </div>
                    ))
                  )}
                </div>
              </Panel>
            </div>
          </div>
        ) : (
          <Panel>
            <p className="text-sm text-chrome-700">尚未選擇場域。先建立一筆 site，控制平面才有 map context 可以掛接 route、template、schedule 與 dispatch。</p>
          </Panel>
        )}
      </div>

      {selectedSite && editForm ? (
        <Modal
          open={editOpen}
          onOpenChange={setEditOpen}
          title="編輯場域工作區"
          description="更新 site map context、launch point 與 viewpoint 摘要。"
        >
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="場域名稱">
                <Input value={editForm.name} onChange={(event) => setEditForm((current) => (current ? { ...current, name: event.target.value } : current))} />
              </Field>
              <Field label="地址">
                <Input value={editForm.address} onChange={(event) => setEditForm((current) => (current ? { ...current, address: event.target.value } : current))} />
              </Field>
              <Field label="外部代號">
                <Input value={editForm.externalRef} onChange={(event) => setEditForm((current) => (current ? { ...current, externalRef: event.target.value } : current))} />
              </Field>
              <Field label="底圖模式">
                <Select
                  value={editForm.baseMapType}
                  onChange={(event) =>
                    setEditForm((current) =>
                      current ? { ...current, baseMapType: event.target.value as SiteMapPayload['baseMapType'] } : current,
                    )
                  }
                >
                  <option value="satellite">衛星底圖</option>
                  <option value="roadmap">道路底圖</option>
                  <option value="hybrid">混合底圖</option>
                </Select>
              </Field>
              <Field label="中心緯度">
                <Input value={editForm.centerLat} onChange={(event) => setEditForm((current) => (current ? { ...current, centerLat: event.target.value } : current))} />
              </Field>
              <Field label="中心經度">
                <Input value={editForm.centerLng} onChange={(event) => setEditForm((current) => (current ? { ...current, centerLng: event.target.value } : current))} />
              </Field>
              <Field label="Zoom">
                <Input value={editForm.zoom} onChange={(event) => setEditForm((current) => (current ? { ...current, zoom: event.target.value } : current))} />
              </Field>
              <Field label="邊界名稱">
                <Input value={editForm.zoneLabel} onChange={(event) => setEditForm((current) => (current ? { ...current, zoneLabel: event.target.value } : current))} />
              </Field>
              <Field label="起降點名稱">
                <Input value={editForm.launchLabel} onChange={(event) => setEditForm((current) => (current ? { ...current, launchLabel: event.target.value } : current))} />
              </Field>
              <Field label="視角名稱">
                <Input value={editForm.viewpointLabel} onChange={(event) => setEditForm((current) => (current ? { ...current, viewpointLabel: event.target.value } : current))} />
              </Field>
            </div>
            <Field label="備註">
              <TextArea value={editForm.notes} onChange={(event) => setEditForm((current) => (current ? { ...current, notes: event.target.value } : current))} />
            </Field>
            {editError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{editError}</div>
            ) : null}
            <div className="flex justify-end">
              <ActionButton disabled={patchSite.isPending} onClick={handleUpdateSite}>
                {patchSite.isPending ? '更新中' : '更新場域工作區'}
              </ActionButton>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
