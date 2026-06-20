import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { clsx } from 'clsx'

import { ActionButton, DataList, EmptyState, Field, Metric, Panel, Select, ShellSection, formatDateTime } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAuthedQuery } from '../../lib/auth-query'
import {
  DEFAULT_SITE_MAP_KEY,
  getSiteMapConfig,
  type SiteMapKey,
  visibleSiteMapConfigs,
} from './site-map-config'
import { SiteMapSogViewer } from './SiteMapSogViewer'
import { SiteMapThreeViewer } from './SiteMapThreeViewer'
import { SiteMapTwoDViewer } from './SiteMapTwoDViewer'
import {
  SITE_MAP_SEVERITY_OPTIONS,
  SITE_MAP_STATUS_OPTIONS,
  createSiteMapMarkers,
  formatSiteMapSeverity,
  formatSiteMapStatus,
  incidentLocationText,
  siteMapAnchorText,
  siteMapAssigneeText,
  siteMapIncidentDescription,
  siteMapIncidentTitle,
  siteMapSeverityBadgeClass,
  siteMapStatusBadgeClass,
  sortSiteMapIncidents,
  type SiteMapViewMode,
} from './site-map-utils'

function badgeClass(className: string) {
  return `inline-flex rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] ${className}`
}

export function SiteMapPage() {
  const auth = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [viewMode, setViewMode] = useState<SiteMapViewMode>('3d')
  const [statusFilter, setStatusFilter] = useState('')
  const [severityFilter, setSeverityFilter] = useState('')
  const siteMapConfigs = useMemo(() => visibleSiteMapConfigs({ includeInternal: auth.isInternal }), [auth.isInternal])
  const siteMapConfig = getSiteMapConfig(searchParams.get('map'), siteMapConfigs)

  const incidentsQuery = useAuthedQuery({
    queryKey: ['site-map', 'incidents'],
    queryFn: (token) => api.listIncidents(token),
    staleTime: 10_000,
  })

  const rentHouseManifestQuery = useAuthedQuery({
    queryKey: ['site-map-asset', siteMapConfig.manifestAssetKey],
    queryFn: (token) => api.getSiteMapAssetManifest(token, siteMapConfig.manifestAssetKey ?? ''),
    enabled: siteMapConfig.assetKind === 'sog' && Boolean(siteMapConfig.manifestAssetKey),
    retry: false,
    staleTime: 240_000,
  })

  const incidents = useMemo(() => incidentsQuery.data ?? [], [incidentsQuery.data])
  const filteredIncidents = useMemo(() => {
    return sortSiteMapIncidents(
      incidents.filter((incident) => {
        if (statusFilter && incident.status !== statusFilter) return false
        if (severityFilter && incident.severity !== severityFilter) return false
        return true
      }),
    )
  }, [incidents, severityFilter, statusFilter])

  const markers = useMemo(() => createSiteMapMarkers(filteredIncidents), [filteredIncidents])
  const selectedIncidentId = searchParams.get('incidentId')
  const selectedMarker =
    markers.find((marker) => marker.incident.incidentId === selectedIncidentId) ?? markers[0] ?? null

  function selectIncident(incidentId: string) {
    const next = new URLSearchParams(searchParams)
    next.set('incidentId', incidentId)
    setSearchParams(next, { replace: true })
  }

  function selectSiteMap(mapKey: SiteMapKey) {
    const next = new URLSearchParams(searchParams)
    if (mapKey === DEFAULT_SITE_MAP_KEY) {
      next.delete('map')
    } else {
      next.set('map', mapKey)
    }
    setSearchParams(next, { replace: true })
  }

  const criticalHighCount = filteredIncidents.filter(
    (incident) => incident.severity === 'critical' || incident.severity === 'high',
  ).length
  const activeCount = filteredIncidents.filter(
    (incident) => incident.status !== 'resolved' && incident.status !== 'false_positive',
  ).length
  const fallbackCount = markers.filter((marker) => marker.usedFallback2d || marker.usedFallback3d).length
  const siteCount = new Set(filteredIncidents.map((incident) => incident.location.siteName || incident.siteId).filter(Boolean)).size
  const selectedIncidentTitle = selectedMarker ? siteMapIncidentTitle(selectedMarker.incident) : ''
  const selectedIncidentDescription = selectedMarker ? siteMapIncidentDescription(selectedMarker.incident) : ''

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="Site Map"
        title="場域地圖"
        subtitle={`${siteMapConfig.label}，用於檢視場域模型、事件位置與 2D / 3D 對照。`}
        action={
          <Link
            className="inline-flex rounded-full border border-chrome-300 bg-white px-4 py-2 text-sm font-medium text-chrome-950 transition hover:border-chrome-500"
            to="/incidents"
          >
            查看事件中心
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Metric label="目前場域" value={siteMapConfig.label} hint={siteMapConfig.description} />
        <Metric label="事件標記" value={filteredIncidents.length} hint="依目前篩選條件顯示" />
        <Metric label="高風險" value={criticalHighCount} hint="critical / high" />
        <Metric label="未結案" value={activeCount} hint="尚需追蹤的事件" />
        <Metric label="座標補位" value={fallbackCount} hint={`${siteCount || 0} 個來源場域`} />
      </div>

      <Panel>
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
          <Field label="場域">
            <Select value={siteMapConfig.key} onChange={(event) => selectSiteMap(event.target.value as SiteMapKey)}>
              {siteMapConfigs.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="狀態">
            <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">全部狀態</option>
              {SITE_MAP_STATUS_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="嚴重度">
            <Select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}>
              <option value="">全部嚴重度</option>
              {SITE_MAP_SEVERITY_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex rounded-full border border-chrome-300 bg-white p-1">
            {(['3d', '2d'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={clsx(
                  'rounded-full px-4 py-2 text-sm font-medium transition',
                  viewMode === mode ? 'bg-chrome-950 text-white' : 'text-chrome-700 hover:bg-chrome-50',
                )}
                onClick={() => setViewMode(mode)}
              >
                {mode === '3d' ? '3D 場域' : '2D 參考'}
              </button>
            ))}
          </div>
        </div>
      </Panel>

      {incidentsQuery.isLoading ? (
        <Panel>
          <p className="text-sm text-chrome-700">載入場域事件中...</p>
        </Panel>
      ) : null}
      {incidentsQuery.isError ? (
        <Panel className="border-red-200 bg-red-50/85">
          <p className="text-sm text-red-700">無法載入事件資料，請稍後重試。</p>
        </Panel>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Panel className="p-3">
          {viewMode === '3d' ? (
            siteMapConfig.assetKind === 'sog' ? (
              <SiteMapSogViewer
                assetUrl={rentHouseManifestQuery.data?.assetUrl ?? null}
                siteLabel={siteMapConfig.label}
                modelAssetPath={siteMapConfig.modelAssetPath}
                manifestLoading={rentHouseManifestQuery.isLoading}
                manifestError={rentHouseManifestQuery.isError}
              />
            ) : (
              <SiteMapThreeViewer
                modelUrl={siteMapConfig.modelUrl ?? ''}
                siteLabel={siteMapConfig.label}
                modelAssetPath={siteMapConfig.modelAssetPath}
                placeholderVariant={siteMapConfig.placeholderVariant}
              />
            )
          ) : (
            <SiteMapTwoDViewer
              markers={markers}
              selectedIncidentId={selectedMarker?.incident.incidentId ?? null}
              siteLabel={siteMapConfig.label}
              planLabel={siteMapConfig.planLabel}
              placeholderVariant={siteMapConfig.placeholderVariant}
              onSelectIncident={selectIncident}
            />
          )}
        </Panel>

        <div className="space-y-6">
          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Selected Incident</p>
            {selectedMarker ? (
              <div className="mt-4 space-y-4">
                <div>
                  <h2 className="font-display text-2xl font-semibold leading-tight text-chrome-950">
                    {selectedIncidentTitle}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-chrome-700">{selectedIncidentDescription}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className={badgeClass(siteMapStatusBadgeClass(selectedMarker.incident.status))}>
                    {formatSiteMapStatus(selectedMarker.incident.status)}
                  </span>
                  <span className={badgeClass(siteMapSeverityBadgeClass(selectedMarker.incident.severity))}>
                    {formatSiteMapSeverity(selectedMarker.incident.severity)}
                  </span>
                </div>
                <DataList
                  rows={[
                    { label: '位置', value: incidentLocationText(selectedMarker.incident) },
                    { label: '負責人', value: siteMapAssigneeText(selectedMarker.incident) },
                    { label: '建立時間', value: formatDateTime(selectedMarker.incident.createdAt) },
                    { label: '更新時間', value: formatDateTime(selectedMarker.incident.updatedAt) },
                    {
                      label: '3D 座標',
                      value: selectedMarker.usedFallback3d
                        ? '使用 fallback 座標'
                        : `${selectedMarker.worldX}, ${selectedMarker.worldY}, ${selectedMarker.worldZ}`,
                    },
                    {
                      label: '模型錨點',
                      value: siteMapAnchorText(selectedMarker.incident),
                    },
                  ]}
                />
                <div className="flex flex-wrap gap-3">
                  <Link
                    className="inline-flex rounded-full bg-chrome-950 px-4 py-2 text-sm font-medium text-white"
                    to={`/incidents/${selectedMarker.incident.incidentId}`}
                  >
                    開啟事件詳情
                  </Link>
                  <ActionButton variant="secondary" disabled>
                    模型物件同步未啟用
                  </ActionButton>
                </div>
              </div>
            ) : (
              <EmptyState
                title="目前沒有事件標記"
                body="場域模型仍可檢視。建立事件並補上 2D 或 3D 座標後，標記會出現在這裡。"
              />
            )}
          </Panel>

          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Priority Queue</p>
            <div className="mt-4 space-y-3">
              {markers.length === 0 ? (
                <p className="text-sm leading-6 text-chrome-700">目前沒有符合篩選條件的事件。</p>
              ) : (
                markers.slice(0, 6).map((marker) => (
                  <button
                    key={marker.incident.incidentId}
                    type="button"
                    className={clsx(
                      'block w-full rounded-2xl border px-4 py-3 text-left transition',
                      marker.incident.incidentId === selectedMarker?.incident.incidentId
                        ? 'border-chrome-950 bg-chrome-950 text-white'
                        : 'border-chrome-200 bg-white/70 text-chrome-900 hover:border-chrome-300',
                    )}
                    onClick={() => selectIncident(marker.incident.incidentId)}
                  >
                    <span className="block text-sm font-medium">{siteMapIncidentTitle(marker.incident)}</span>
                    <span className="mt-1 block text-xs opacity-75">
                      {formatSiteMapSeverity(marker.incident.severity)} / {incidentLocationText(marker.incident)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
