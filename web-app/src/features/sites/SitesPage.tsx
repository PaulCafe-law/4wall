import { useDeferredValue, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
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
  ShellSection,
  TextArea,
  formatDateTime,
} from '../../components/ui'
import { ApiError, api, type SitePayload } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAuthedMutation, useAuthedQuery } from '../../lib/auth-query'
import { useOrganizationChoices } from '../../lib/organization-choices'
import { formatApiError, formatSearchMode } from '../../lib/presentation'
import type { Site } from '../../lib/types'
import { GoogleMapCanvas } from '../maps/GoogleMapCanvas'
import { routeOverlaysFromRoutes } from '../maps/route-overlays'

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

type EditSiteMetaForm = {
  name: string
  address: string
  externalRef: string
  notes: string
}

type ScopedDraft<T> = {
  siteId: string
  updatedAt: string
  value: T
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

function metadataDefaults(site: Site): EditSiteMetaForm {
  return {
    name: site.name,
    address: site.address,
    externalRef: site.externalRef ?? '',
    notes: site.notes,
  }
}

function mapTypeLabel(value: Site['siteMap']['baseMapType']) {
  if (value === 'roadmap') return '地圖'
  if (value === 'hybrid') return '混合'
  return '衛星'
}

function formatDuration(seconds: number) {
  if (seconds <= 0) return '未估算'
  return `${Math.max(1, Math.round(seconds / 60))} 分鐘`
}

function toScopedDraft<T>(site: Site, value: T): ScopedDraft<T> {
  return {
    siteId: site.siteId,
    updatedAt: site.updatedAt,
    value,
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
  const [editMetaOpen, setEditMetaOpen] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [editMetaError, setEditMetaError] = useState<string | null>(null)
  const [createForm, setCreateForm] = useState<CreateSiteForm>(() =>
    createDefaults(choices[0]?.organizationId ?? ''),
  )
  const [editMetaDraft, setEditMetaDraft] = useState<ScopedDraft<EditSiteMetaForm> | null>(null)
  const deferredSearch = useDeferredValue(search)

  const sitesQuery = useAuthedQuery({
    queryKey: ['sites'],
    queryFn: api.listSites,
    staleTime: 15_000,
  })
  const routesQuery = useAuthedQuery({
    queryKey: ['inspection', 'routes', 'sites-page'],
    queryFn: (token) => api.listInspectionRoutes(token),
    staleTime: 15_000,
  })

  const createSite = useAuthedMutation({
    mutationKey: ['sites', 'create'],
    mutationFn: ({ token, payload }: { token: string; payload: SitePayload }) =>
      api.createSite(token, payload),
    onSuccess: async (site) => {
      await queryClient.invalidateQueries({ queryKey: ['sites'] })
      setCreateOpen(false)
      setCreateError(null)
      setCreateForm(createDefaults(site.organizationId))
      navigate(`/sites/${site.siteId}`)
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
    onSuccess: async (site) => {
      await queryClient.invalidateQueries({ queryKey: ['sites'] })
      setEditMetaOpen(false)
      setEditMetaError(null)
      setEditMetaDraft(toScopedDraft(site, metadataDefaults(site)))
    },
  })

  const allSites = useMemo(() => sitesQuery.data ?? [], [sitesQuery.data])
  const allRoutes = useMemo(() => routesQuery.data ?? [], [routesQuery.data])

  const filteredSites = useMemo(() => {
    const needle = deferredSearch.trim().toLowerCase()
    if (!needle) return allSites
    return allSites.filter((site) =>
      `${site.name} ${site.address} ${site.externalRef ?? ''}`.toLowerCase().includes(needle),
    )
  }, [allSites, deferredSearch])

  const selectedSite =
    allSites.find((site) => site.siteId === siteId) ?? filteredSites[0] ?? allSites[0] ?? null

  const selectedSiteRoutes = useMemo(
    () => (selectedSite ? allRoutes.filter((route) => route.siteId === selectedSite.siteId) : []),
    [allRoutes, selectedSite],
  )

  const selectedRouteOverlays = useMemo(
    () => routeOverlaysFromRoutes(selectedSiteRoutes).map((route) => ({ ...route, active: true })),
    [selectedSiteRoutes],
  )

  const editMetaForm = useMemo(() => {
    if (!selectedSite) return null
    if (
      editMetaDraft &&
      editMetaDraft.siteId === selectedSite.siteId &&
      editMetaDraft.updatedAt === selectedSite.updatedAt
    ) {
      return editMetaDraft.value
    }
    return metadataDefaults(selectedSite)
  }, [editMetaDraft, selectedSite])

  function updateEditMetaForm(updater: (current: EditSiteMetaForm) => EditSiteMetaForm) {
    if (!selectedSite || !editMetaForm) return
    setEditMetaDraft(toScopedDraft(selectedSite, updater(editMetaForm)))
  }

  async function handleCreateSite() {
    const organizationId = createForm.organizationId || choices[0]?.organizationId || ''
    const lat = Number(createForm.lat)
    const lng = Number(createForm.lng)

    if (!organizationId || !createForm.name.trim() || !createForm.address.trim()) {
      setCreateError('請先填完組織、場域名稱與地址。')
      return
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setCreateError('請提供有效的場域中心點經緯度。')
      return
    }

    try {
      await createSite.mutateAsync({
        organizationId,
        name: createForm.name.trim(),
        address: createForm.address.trim(),
        externalRef: createForm.externalRef.trim() || undefined,
        location: { lat, lng },
        notes: createForm.notes.trim() || undefined,
      })
    } catch (error) {
      setCreateError(
        formatApiError(
          error instanceof ApiError ? error.detail : undefined,
          '建立場域失敗。',
        ),
      )
    }
  }

  async function handleUpdateSiteMeta() {
    if (!selectedSite || !editMetaForm) return

    try {
      await patchSite.mutateAsync({
        siteId: selectedSite.siteId,
        body: {
          name: editMetaForm.name.trim(),
          address: editMetaForm.address.trim(),
          externalRef: editMetaForm.externalRef.trim() || undefined,
          notes: editMetaForm.notes.trim(),
        },
      })
    } catch (error) {
      setEditMetaError(
        formatApiError(
          error instanceof ApiError ? error.detail : undefined,
          '更新場域資料失敗。',
        ),
      )
    }
  }

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="場域工作區"
        title="場域"
        subtitle="Site 頁只保留場域參考中心點、基本資料與已發布 route overlay。保全巡檢 v1 的 launch point 與 patrol waypoints 都由 route 持有，不在 site 頁直接編輯。"
        action={
          choices.length > 0 ? (
            <Modal
              open={createOpen}
              onOpenChange={setCreateOpen}
              title="新增場域"
              description="場域只定義 site metadata 與中心點，route geometry 由 internal 在控制平面航線工作區管理。"
              trigger={<ActionButton>新增場域</ActionButton>}
            >
              <div className="space-y-4">
                <Field label="組織">
                  <select
                    value={createForm.organizationId || choices[0]?.organizationId || ''}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        organizationId: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-chrome-300 bg-white px-4 py-3 text-sm text-chrome-950"
                  >
                    {choices.map((choice) => (
                      <option key={choice.organizationId} value={choice.organizationId}>
                        {choice.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="場域名稱">
                  <Input
                    value={createForm.name}
                    onChange={(event) =>
                      setCreateForm((current) => ({ ...current, name: event.target.value }))
                    }
                  />
                </Field>
                <Field label="地址">
                  <Input
                    value={createForm.address}
                    onChange={(event) =>
                      setCreateForm((current) => ({ ...current, address: event.target.value }))
                    }
                  />
                </Field>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="中心點緯度">
                    <Input
                      value={createForm.lat}
                      onChange={(event) =>
                        setCreateForm((current) => ({ ...current, lat: event.target.value }))
                      }
                    />
                  </Field>
                  <Field label="中心點經度">
                    <Input
                      value={createForm.lng}
                      onChange={(event) =>
                        setCreateForm((current) => ({ ...current, lng: event.target.value }))
                      }
                    />
                  </Field>
                </div>
                <Field label="外部代號">
                  <Input
                    value={createForm.externalRef}
                    onChange={(event) =>
                      setCreateForm((current) => ({ ...current, externalRef: event.target.value }))
                    }
                  />
                </Field>
                <Field label="備註">
                  <TextArea
                    value={createForm.notes}
                    onChange={(event) =>
                      setCreateForm((current) => ({ ...current, notes: event.target.value }))
                    }
                  />
                </Field>
                {createError ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {createError}
                  </div>
                ) : null}
                <div className="flex justify-end">
                  <ActionButton disabled={createSite.isPending} onClick={() => void handleCreateSite()}>
                    {createSite.isPending ? '建立中…' : '建立場域'}
                  </ActionButton>
                </div>
              </div>
            </Modal>
          ) : null
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="場域數量" value={filteredSites.length} hint="site coverage" />
        <Metric
          label="活躍航線"
          value={filteredSites.reduce((sum, site) => sum + site.activeRouteCount, 0)}
          hint="route reuse"
        />
        <Metric
          label="活躍模板"
          value={filteredSites.reduce((sum, site) => sum + site.activeTemplateCount, 0)}
          hint="template reuse"
        />
        <Metric label="搜尋模式" value={formatSearchMode(Boolean(deferredSearch))} hint="搜尋當前 site list" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Panel>
            <Field label="搜尋場域">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜尋場域名稱、地址或外部代號"
              />
            </Field>
          </Panel>

          {!sitesQuery.isPending && filteredSites.length === 0 ? (
            <EmptyState
              title={allSites.length === 0 ? '目前沒有場域' : '找不到符合搜尋條件的場域'}
              body={
                allSites.length === 0
                  ? '先建立第一個場域，控制平面才有 site context 可以掛 route、template、schedule 與 mission。'
                  : '請調整搜尋條件，或建立新的場域。'
              }
            />
          ) : null}

          <div className="grid gap-4">
            {filteredSites.map((site) => (
              <Link key={site.siteId} to={`/sites/${site.siteId}`}>
                <Panel
                  className={
                    selectedSite?.siteId === site.siteId
                      ? 'border-ember-300 bg-white'
                      : 'transition hover:border-chrome-400 hover:bg-white'
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words font-display text-2xl font-semibold text-chrome-950">
                        {site.name}
                      </p>
                      <p className="mt-2 text-sm text-chrome-700">{site.address}</p>
                    </div>
                    <span className="rounded-full bg-chrome-100 px-3 py-1 text-xs text-chrome-700">
                      {mapTypeLabel(site.siteMap.baseMapType)}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-2 text-sm text-chrome-700 md:grid-cols-2">
                    <div>航線 {site.activeRouteCount}</div>
                    <div>模板 {site.activeTemplateCount}</div>
                    <div>Zones {site.siteMap.zones.length}</div>
                    <div>中心點 {site.location.lat.toFixed(3)}, {site.location.lng.toFixed(3)}</div>
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
                  <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">
                    site detail
                  </p>
                  <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">
                    {selectedSite.name}
                  </h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  {auth.canWriteOrganization(selectedSite.organizationId) ? (
                    <ActionButton
                      variant="secondary"
                      onClick={() => {
                        setEditMetaDraft(toScopedDraft(selectedSite, metadataDefaults(selectedSite)))
                        setEditMetaOpen(true)
                      }}
                    >
                      編輯場域資料
                    </ActionButton>
                  ) : null}
                  <ActionButton variant="secondary" onClick={() => navigate('/control-plane/routes')}>
                    前往航線規劃
                  </ActionButton>
                </div>
              </div>
              <div className="mt-4">
                <DataList
                  rows={[
                    { label: '地址', value: selectedSite.address },
                    { label: '外部代號', value: selectedSite.externalRef ?? '未設定' },
                    { label: '底圖模式', value: mapTypeLabel(selectedSite.siteMap.baseMapType) },
                    {
                      label: '場域中心',
                      value: `${selectedSite.siteMap.center.lat.toFixed(5)}, ${selectedSite.siteMap.center.lng.toFixed(5)}`,
                    },
                    { label: '最後更新', value: formatDateTime(selectedSite.updatedAt) },
                    { label: '備註', value: selectedSite.notes || '沒有備註' },
                  ]}
                />
              </div>
            </Panel>

            <div className="grid gap-4 md:grid-cols-3">
              <Metric label="定義 zones" value={selectedSite.siteMap.zones.length} hint="explicit polygons only" />
              <Metric label="活躍航線" value={selectedSite.activeRouteCount} hint="published route assets" />
              <Metric label="活躍模板" value={selectedSite.activeTemplateCount} hint="attached policies" />
            </div>

            <Panel>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">
                map context
              </p>
              <h3 className="mt-2 font-display text-2xl font-semibold text-chrome-950">
                場域底圖與已發布航線
              </h3>
              <div className="mt-4 space-y-4">
                <GoogleMapCanvas siteMap={selectedSite.siteMap} routeOverlays={selectedRouteOverlays} />
                <div className="rounded-2xl border border-chrome-200 bg-chrome-50/80 px-4 py-4 text-sm text-chrome-700">
                  Site 頁只顯示場域參考中心點、明確定義的 zones 與已發布 route overlay。保全巡檢 v1 的 launch point 與 patrol waypoints
                  由 internal 在航線工作區維護，不在 site 頁直接編輯。
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                    <p className="font-medium text-chrome-950">場域 zones</p>
                    {selectedSite.siteMap.zones.length === 0 ? (
                      <p className="mt-3 text-sm text-chrome-700">
                        目前沒有明確定義的 zone。中心點只代表 site reference，不自動推論成巡檢邊界。
                      </p>
                    ) : (
                      selectedSite.siteMap.zones.map((zone) => (
                        <p key={zone.zoneId} className="mt-3 text-sm text-chrome-700">
                          {zone.label} / {zone.kind} / {zone.polygon.length} 個角點
                        </p>
                      ))
                    )}
                  </div>
                  <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                    <p className="font-medium text-chrome-950">已發布航線 overlay</p>
                    {selectedSiteRoutes.length === 0 ? (
                      <p className="mt-3 text-sm text-chrome-700">
                        目前沒有航線。請到控制平面航線工作區建立 route-owned launch point 與 patrol waypoints。
                      </p>
                    ) : (
                      selectedSiteRoutes.map((route) => (
                        <p key={route.routeId} className="mt-3 text-sm text-chrome-700">
                          {route.name} / {route.pointCount} 個巡邏點 / {formatDuration(route.estimatedDurationSec)}
                        </p>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </Panel>

            <div className="grid gap-4 xl:grid-cols-2">
              <Panel>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">
                      active routes
                    </p>
                    <h3 className="mt-2 font-display text-2xl font-semibold text-chrome-950">
                      航線庫
                    </h3>
                  </div>
                  <ActionButton variant="secondary" onClick={() => navigate('/control-plane/routes')}>
                    前往航線工作區
                  </ActionButton>
                </div>
                <div className="mt-4 space-y-3">
                  {selectedSite.activeRoutes.length === 0 ? (
                    <EmptyState
                      title="目前沒有航線"
                      body="先建立 route，保全巡檢路徑才會顯示 launch point、ordered patrol waypoints 與閉合巡邏迴路。"
                    />
                  ) : (
                    selectedSite.activeRoutes.map((route) => (
                      <div key={route.routeId} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                        <p className="font-medium text-chrome-950">{route.name}</p>
                        <p className="mt-2 text-sm text-chrome-700">
                          v{route.version} / {route.pointCount} 個巡邏點 / {formatDuration(route.estimatedDurationSec)}
                        </p>
                        <p className="mt-1 text-xs text-chrome-500">
                          最後更新 {formatDateTime(route.updatedAt)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </Panel>

              <Panel>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">
                      active templates
                    </p>
                    <h3 className="mt-2 font-display text-2xl font-semibold text-chrome-950">
                      模板庫
                    </h3>
                  </div>
                  <ActionButton variant="secondary" onClick={() => navigate('/control-plane/templates')}>
                    前往模板工作區
                  </ActionButton>
                </div>
                <div className="mt-4 space-y-3">
                  {selectedSite.activeTemplates.length === 0 ? (
                    <EmptyState
                      title="目前沒有模板"
                      body="模板會把巡檢策略、證據政策與報表模式收斂成可重用的 route 附屬資產。"
                    />
                  ) : (
                    selectedSite.activeTemplates.map((template) => (
                      <div
                        key={template.templateId}
                        className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4"
                      >
                        <p className="font-medium text-chrome-950">{template.name}</p>
                        <p className="mt-2 text-sm text-chrome-700">
                          {template.evidencePolicy} / {template.reportMode}
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
            <p className="text-sm text-chrome-700">
              目前沒有場域。先建立第一個 site，再到控制平面航線工作區建立 route-owned launch point 與 patrol waypoints。
            </p>
          </Panel>
        )}
      </div>

      {selectedSite && editMetaForm ? (
        <Modal
          open={editMetaOpen}
          onOpenChange={setEditMetaOpen}
          title="編輯場域資料"
          description="這裡只編輯 site metadata。route geometry、launch point 與 patrol waypoints 都在控制平面航線工作區管理。"
        >
          <div className="space-y-4">
            <Field label="場域名稱">
              <Input
                value={editMetaForm.name}
                onChange={(event) =>
                  updateEditMetaForm((current) => ({ ...current, name: event.target.value }))
                }
              />
            </Field>
            <Field label="地址">
              <Input
                value={editMetaForm.address}
                onChange={(event) =>
                  updateEditMetaForm((current) => ({ ...current, address: event.target.value }))
                }
              />
            </Field>
            <Field label="外部代號">
              <Input
                value={editMetaForm.externalRef}
                onChange={(event) =>
                  updateEditMetaForm((current) => ({ ...current, externalRef: event.target.value }))
                }
              />
            </Field>
            <Field label="備註">
              <TextArea
                value={editMetaForm.notes}
                onChange={(event) =>
                  updateEditMetaForm((current) => ({ ...current, notes: event.target.value }))
                }
              />
            </Field>
            {editMetaError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {editMetaError}
              </div>
            ) : null}
            <div className="flex justify-end">
              <ActionButton disabled={patchSite.isPending} onClick={() => void handleUpdateSiteMeta()}>
                {patchSite.isPending ? '更新中…' : '更新場域資料'}
              </ActionButton>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
