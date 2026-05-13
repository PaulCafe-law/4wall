import { ActionButton, Field, Input, Panel, Select } from '../../components/ui'
import type { InspectionRoute, InspectionWaypoint, Site } from '../../lib/types'
import { GoogleMapCanvas } from '../maps/GoogleMapCanvas'

const PATROL_ALTITUDE_M = 10

function waypointLabel(index: number, waypoint: InspectionWaypoint) {
  return waypoint.label?.trim() || `巡邏點 ${index + 1}`
}

function formatWaypointKind(kind: InspectionWaypoint['kind']) {
  return kind === 'hold' ? '保持點' : '巡邏點'
}

function defaultWaypoint(site: Site, kind: InspectionWaypoint['kind']): InspectionWaypoint {
  const baseOffset = kind === 'hold' ? 0.00022 : 0.00012
  return {
    kind,
    lat: site.location.lat + baseOffset,
    lng: site.location.lng + baseOffset,
    altitudeM: PATROL_ALTITUDE_M,
    label: kind === 'hold' ? `${site.name} 保持點` : `${site.name} 巡邏點`,
    headingDeg: 0,
    dwellSeconds: kind === 'hold' ? 8 : 0,
  }
}

function normalizeWaypoint(waypoint: InspectionWaypoint): InspectionWaypoint {
  return {
    ...waypoint,
    altitudeM: PATROL_ALTITUDE_M,
  }
}

function draftPath(waypoints: InspectionWaypoint[]) {
  return waypoints.map((waypoint) => ({ lat: waypoint.lat, lng: waypoint.lng }))
}

export function InternalRouteEditorPanel({
  site,
  routes,
  selectedRouteId,
  routeName,
  routeDescription,
  waypoints,
  routeError,
  isSavingRoute,
  onSelectedRouteIdChange,
  onRouteNameChange,
  onRouteDescriptionChange,
  onWaypointsChange,
  onSeedDemoDraft,
  onSaveRoute,
}: {
  site: Site | null
  routes: InspectionRoute[]
  selectedRouteId: string
  routeName: string
  routeDescription: string
  waypoints: InspectionWaypoint[]
  routeError: string | null
  isSavingRoute: boolean
  onSelectedRouteIdChange: (value: string) => void
  onRouteNameChange: (value: string) => void
  onRouteDescriptionChange: (value: string) => void
  onWaypointsChange: (value: InspectionWaypoint[]) => void
  onSeedDemoDraft: () => void
  onSaveRoute: () => void
}) {
  const activeRoute = routes.find((route) => route.routeId === selectedRouteId) ?? null
  const normalizedWaypoints = waypoints.map(normalizeWaypoint)
  const previewPath = draftPath(normalizedWaypoints)

  function updateWaypoint(index: number, patch: Partial<InspectionWaypoint>) {
    onWaypointsChange(
      normalizedWaypoints.map((waypoint, waypointIndex) =>
        waypointIndex === index ? normalizeWaypoint({ ...waypoint, ...patch }) : waypoint,
      ),
    )
  }

  function removeWaypoint(index: number) {
    onWaypointsChange(normalizedWaypoints.filter((_, itemIndex) => itemIndex !== index))
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.78fr_1.22fr]">
      <Panel>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">
          內部航線權限
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">
          Google Maps 航點編輯器
        </h2>
        <p className="mt-3 text-sm leading-6 text-chrome-700">
          保全巡檢 v1 只在 Web 規劃巡邏航點。起降點由 Android 起飛當下的 DJI Home Point 決定。
        </p>

        <div className="mt-4 grid gap-4">
          <Field label="編輯模式">
            <Select value={selectedRouteId} onChange={(event) => onSelectedRouteIdChange(event.target.value)}>
              <option value="new">新增航線草稿</option>
              {routes.map((route) => (
                <option key={route.routeId} value={route.routeId}>
                  {route.name} (v{route.version})
                </option>
              ))}
            </Select>
          </Field>

          <Field label="航線名稱">
            <Input value={routeName} onChange={(event) => onRouteNameChange(event.target.value)} />
          </Field>

          <Field label="航線說明">
            <Input value={routeDescription} onChange={(event) => onRouteDescriptionChange(event.target.value)} />
          </Field>

          <div className="grid gap-3 md:grid-cols-3">
            <ActionButton variant="secondary" onClick={onSeedDemoDraft} disabled={!site}>
              使用示範初稿
            </ActionButton>
            <ActionButton
              variant="secondary"
              onClick={() =>
                site
                  ? onWaypointsChange([...normalizedWaypoints, defaultWaypoint(site, 'transit')])
                  : undefined
              }
              disabled={!site}
            >
              新增巡邏點
            </ActionButton>
            <ActionButton
              variant="secondary"
              onClick={() =>
                site ? onWaypointsChange([...normalizedWaypoints, defaultWaypoint(site, 'hold')]) : undefined
              }
              disabled={!site}
            >
              新增保持點
            </ActionButton>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <ActionButton
              variant="secondary"
              onClick={() => onWaypointsChange([])}
              disabled={normalizedWaypoints.length === 0}
            >
              清空航點
            </ActionButton>
            <ActionButton
              onClick={onSaveRoute}
              disabled={isSavingRoute || !site || normalizedWaypoints.length === 0}
            >
              {isSavingRoute ? '儲存航線中…' : activeRoute ? '更新航線' : '建立航線'}
            </ActionButton>
          </div>

          <div className="rounded-2xl border border-chrome-200 bg-chrome-50/80 px-4 py-4 text-sm leading-6 text-chrome-700">
            地圖只顯示 `1..N` 巡邏航點。航點高度固定 10 公尺，巡航速度固定 1.5 m/s。
            完成航點後，Android 會以 DJI Home Point 作為返航參考。
          </div>

          <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-chrome-950">航點清單</p>
                <p className="mt-1 text-xs leading-5 text-chrome-600">
                  點擊地圖新增航點；拖曳地圖上的數字調整位置；可在這裡直接刪除任一航點。
                </p>
              </div>
              <ActionButton
                variant="secondary"
                className="px-3 py-2"
                onClick={() => onWaypointsChange(normalizedWaypoints.slice(0, -1))}
                disabled={normalizedWaypoints.length === 0}
              >
                刪除最後一點
              </ActionButton>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {normalizedWaypoints.length === 0 ? (
                <span className="rounded-full border border-dashed border-chrome-300 px-3 py-2 text-xs text-chrome-600">
                  尚未設定航點
                </span>
              ) : (
                normalizedWaypoints.map((waypoint, index) => (
                  <button
                    key={`quick-delete-${selectedRouteId}-${index}-${waypoint.lat}-${waypoint.lng}`}
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full border border-chrome-300 bg-white px-3 py-2 text-sm text-chrome-950 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                    onClick={() => removeWaypoint(index)}
                    aria-label={`刪除航點 ${index + 1}`}
                  >
                    <span className="font-mono text-xs">#{index + 1}</span>
                    <span>刪除</span>
                  </button>
                ))
              )}
            </div>
          </div>

          {routeError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {routeError}
            </div>
          ) : null}

          <div className="space-y-3">
            {normalizedWaypoints.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-chrome-300 bg-chrome-50/80 px-4 py-4 text-sm leading-6 text-chrome-700">
                目前沒有巡邏航點。可點擊地圖新增航點，或先使用示範初稿建立短航線。
              </div>
            ) : (
              normalizedWaypoints.map((waypoint, index) => (
                <div
                  key={`${selectedRouteId}-${index}-${waypoint.kind}`}
                  className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-chrome-950">{waypointLabel(index, waypoint)}</p>
                    <ActionButton
                      variant="ghost"
                      className="px-2 py-1 text-red-700"
                      onClick={() => removeWaypoint(index)}
                    >
                      刪除
                    </ActionButton>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <Field label="類型">
                      <Select
                        value={waypoint.kind}
                        onChange={(event) =>
                          updateWaypoint(index, { kind: event.target.value as InspectionWaypoint['kind'] })
                        }
                      >
                        <option value="transit">{formatWaypointKind('transit')}</option>
                        <option value="hold">{formatWaypointKind('hold')}</option>
                      </Select>
                    </Field>

                    <Field label="標籤">
                      <Input value={waypoint.label ?? ''} onChange={(event) => updateWaypoint(index, { label: event.target.value })} />
                    </Field>

                    <Field label="高度 (m)" hint="v1 固定 10 公尺，暫不開放前端調整。">
                      <Input type="number" value={PATROL_ALTITUDE_M} disabled readOnly />
                    </Field>

                    <Field label="緯度">
                      <Input
                        type="number"
                        value={waypoint.lat}
                        onChange={(event) => updateWaypoint(index, { lat: Number(event.target.value) || waypoint.lat })}
                      />
                    </Field>

                    <Field label="經度">
                      <Input
                        type="number"
                        value={waypoint.lng}
                        onChange={(event) => updateWaypoint(index, { lng: Number(event.target.value) || waypoint.lng })}
                      />
                    </Field>

                    <Field label="停留秒數">
                      <Input
                        type="number"
                        value={waypoint.dwellSeconds ?? 0}
                        onChange={(event) => updateWaypoint(index, { dwellSeconds: Number(event.target.value) || 0 })}
                      />
                    </Field>

                    <Field label="航向角">
                      <Input
                        type="number"
                        value={waypoint.headingDeg ?? 0}
                        onChange={(event) => updateWaypoint(index, { headingDeg: Number(event.target.value) || 0 })}
                      />
                    </Field>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Panel>

      <Panel>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">
          航線地圖
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">
          Google Maps 航線底圖
        </h2>

        {site ? (
          <div className="mt-4 space-y-4">
            <GoogleMapCanvas
              siteMap={site.siteMap}
              viewportKey={`${site.siteId}:${selectedRouteId}`}
              routeOverlays={[
                {
                  routeId: selectedRouteId || 'draft',
                  name: routeName || '航線草稿',
                  path: previewPath,
                  active: true,
                },
              ]}
              editableWaypoints={normalizedWaypoints}
              editableLaunchPoints={[]}
              internalEditable
              onMapClick={(point) =>
                onWaypointsChange([
                  ...normalizedWaypoints,
                  {
                    ...defaultWaypoint(site, 'transit'),
                    lat: point.lat,
                    lng: point.lng,
                  },
                ])
              }
              onWaypointMove={(index, point) => updateWaypoint(index, { lat: point.lat, lng: point.lng })}
            />

            <div className="rounded-2xl border border-chrome-200 bg-chrome-50/80 px-4 py-4 text-sm leading-6 text-chrome-700">
              點擊地圖可新增巡邏點；拖拉 `1..N` 會立即調整航線。紅線只表示 Web 產包前的航點順序。
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-chrome-300 bg-chrome-50/80 px-4 py-4 text-sm leading-6 text-chrome-700">
            請先建立並選擇場域，Google Maps 才能顯示巡邏航點並產生任務包。
          </div>
        )}
      </Panel>
    </div>
  )
}
