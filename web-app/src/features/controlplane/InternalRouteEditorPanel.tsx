import {
  ActionButton,
  Field,
  Input,
  Panel,
  Select,
} from '../../components/ui'
import { GoogleMapCanvas } from '../maps/GoogleMapCanvas'
import { routeOverlaysFromRoutes } from '../maps/route-overlays'
import type { InspectionRoute, InspectionWaypoint, Site } from '../../lib/types'

function waypointLabel(index: number, waypoint: InspectionWaypoint) {
  return waypoint.label?.trim() || `Waypoint ${index + 1}`
}

function defaultWaypoint(site: Site, kind: InspectionWaypoint['kind']): InspectionWaypoint {
  return {
    kind,
    lat: site.siteMap.center.lat,
    lng: site.siteMap.center.lng,
    altitudeM: kind === 'inspection_viewpoint' ? 32 : 40,
    label:
      kind === 'inspection_viewpoint'
        ? `${site.name} 視角點`
        : kind === 'hold'
          ? `${site.name} 保持點`
          : `${site.name} 轉場點`,
    headingDeg: kind === 'inspection_viewpoint' ? 180 : 0,
    dwellSeconds: kind === 'inspection_viewpoint' ? 18 : 0,
  }
}

export function InternalRouteEditorPanel({
  site,
  routes,
  selectedRouteId,
  routeName,
  routeDescription,
  waypoints,
  routeError,
  isSaving,
  onSelectedRouteIdChange,
  onRouteNameChange,
  onRouteDescriptionChange,
  onWaypointsChange,
  onSeedDemoDraft,
  onSave,
}: {
  site: Site | null
  routes: InspectionRoute[]
  selectedRouteId: string
  routeName: string
  routeDescription: string
  waypoints: InspectionWaypoint[]
  routeError: string | null
  isSaving: boolean
  onSelectedRouteIdChange: (value: string) => void
  onRouteNameChange: (value: string) => void
  onRouteDescriptionChange: (value: string) => void
  onWaypointsChange: (value: InspectionWaypoint[]) => void
  onSeedDemoDraft: () => void
  onSave: () => void
}) {
  const activeRoute = routes.find((route) => route.routeId === selectedRouteId) ?? null

  return (
    <div className="grid gap-6 xl:grid-cols-[0.78fr_1.22fr]">
      <Panel>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">internal route authority</p>
        <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">Google Maps waypoint 編輯器</h2>
        <p className="mt-3 text-sm text-chrome-700">
          這一區只給 internal 使用。客戶只提供場域與需求，最終 waypoint/route authority 由內部規劃團隊持有。
        </p>
        <div className="mt-4 grid gap-4">
          <Field label="編輯模式">
            <Select value={selectedRouteId} onChange={(event) => onSelectedRouteIdChange(event.target.value)}>
              <option value="new">新增 route 草稿</option>
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
                site ? onWaypointsChange([...waypoints, defaultWaypoint(site, 'transit')]) : undefined
              }
              disabled={!site}
            >
              新增轉場點
            </ActionButton>
            <ActionButton
              variant="secondary"
              onClick={() =>
                site ? onWaypointsChange([...waypoints, defaultWaypoint(site, 'inspection_viewpoint')]) : undefined
              }
              disabled={!site}
            >
              新增視角點
            </ActionButton>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <ActionButton
              variant="secondary"
              onClick={() =>
                site ? onWaypointsChange([...waypoints, defaultWaypoint(site, 'hold')]) : undefined
              }
              disabled={!site}
            >
              新增保持點
            </ActionButton>
            <ActionButton
              variant="secondary"
              onClick={() => onWaypointsChange([])}
              disabled={waypoints.length === 0}
            >
              清空點位
            </ActionButton>
            <ActionButton onClick={onSave} disabled={isSaving || !site || waypoints.length === 0}>
              {isSaving ? '儲存中…' : activeRoute ? '更新航線' : '建立航線'}
            </ActionButton>
          </div>
          {routeError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {routeError}
            </div>
          ) : null}
          <div className="space-y-3">
            {waypoints.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-chrome-300 bg-chrome-50/80 px-4 py-4 text-sm text-chrome-700">
                目前沒有 waypoint。可用示範初稿快速帶入，或在地圖上點擊新增點位。
              </div>
            ) : (
              waypoints.map((waypoint, index) => (
                <div
                  key={`${selectedRouteId}-${index}-${waypoint.kind}`}
                  className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-chrome-950">{waypointLabel(index, waypoint)}</p>
                    <ActionButton
                      variant="ghost"
                      className="px-2 py-1 text-red-700"
                      onClick={() =>
                        onWaypointsChange(waypoints.filter((_, waypointIndex) => waypointIndex !== index))
                      }
                    >
                      刪除
                    </ActionButton>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <Field label="類型">
                      <Select
                        value={waypoint.kind}
                        onChange={(event) =>
                          onWaypointsChange(
                            waypoints.map((current, waypointIndex) =>
                              waypointIndex === index
                                ? { ...current, kind: event.target.value as InspectionWaypoint['kind'] }
                                : current,
                            ),
                          )
                        }
                      >
                        <option value="transit">transit</option>
                        <option value="inspection_viewpoint">inspection_viewpoint</option>
                        <option value="hold">hold</option>
                      </Select>
                    </Field>
                    <Field label="標籤">
                      <Input
                        value={waypoint.label ?? ''}
                        onChange={(event) =>
                          onWaypointsChange(
                            waypoints.map((current, waypointIndex) =>
                              waypointIndex === index ? { ...current, label: event.target.value } : current,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field label="高度 (m)">
                      <Input
                        type="number"
                        value={waypoint.altitudeM}
                        onChange={(event) =>
                          onWaypointsChange(
                            waypoints.map((current, waypointIndex) =>
                              waypointIndex === index
                                ? { ...current, altitudeM: Number(event.target.value) || current.altitudeM }
                                : current,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field label="緯度">
                      <Input
                        type="number"
                        value={waypoint.lat}
                        onChange={(event) =>
                          onWaypointsChange(
                            waypoints.map((current, waypointIndex) =>
                              waypointIndex === index
                                ? { ...current, lat: Number(event.target.value) || current.lat }
                                : current,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field label="經度">
                      <Input
                        type="number"
                        value={waypoint.lng}
                        onChange={(event) =>
                          onWaypointsChange(
                            waypoints.map((current, waypointIndex) =>
                              waypointIndex === index
                                ? { ...current, lng: Number(event.target.value) || current.lng }
                                : current,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field label="停留秒數">
                      <Input
                        type="number"
                        value={waypoint.dwellSeconds ?? 0}
                        onChange={(event) =>
                          onWaypointsChange(
                            waypoints.map((current, waypointIndex) =>
                              waypointIndex === index
                                ? { ...current, dwellSeconds: Number(event.target.value) || 0 }
                                : current,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field label="朝向角度">
                      <Input
                        type="number"
                        value={waypoint.headingDeg ?? 0}
                        onChange={(event) =>
                          onWaypointsChange(
                            waypoints.map((current, waypointIndex) =>
                              waypointIndex === index
                                ? { ...current, headingDeg: Number(event.target.value) || 0 }
                                : current,
                            ),
                          )
                        }
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
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">route map</p>
        <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">Google Maps 航線底圖</h2>
        {site ? (
          <div className="mt-4 space-y-4">
            <GoogleMapCanvas
              siteMap={site.siteMap}
              routeOverlays={[
                ...routeOverlaysFromRoutes(routes).map((route: { routeId: string; name: string; path: Array<{ lat: number; lng: number }>; active?: boolean }) => ({
                  ...route,
                  active: route.routeId !== selectedRouteId,
                })),
                {
                  routeId: selectedRouteId || 'draft',
                  name: routeName || 'route draft',
                  path: waypoints.map((waypoint) => ({ lat: waypoint.lat, lng: waypoint.lng })),
                  active: true,
                },
              ]}
              editableWaypoints={waypoints}
              internalEditable
              onMapClick={(point) =>
                onWaypointsChange([
                  ...waypoints,
                  {
                    ...(defaultWaypoint(site, 'transit')),
                    lat: point.lat,
                    lng: point.lng,
                  },
                ])
              }
              onWaypointMove={(index, point) =>
                onWaypointsChange(
                  waypoints.map((waypoint, waypointIndex) =>
                    waypointIndex === index ? { ...waypoint, lat: point.lat, lng: point.lng } : waypoint,
                  ),
                )
              }
            />
            <div className="rounded-2xl border border-chrome-200 bg-chrome-50/80 px-4 py-4 text-sm text-chrome-700">
              點擊地圖可新增一個 transit 點。拖拉 marker 可直接調整 waypoint 位置，細部 heading / dwell / altitude 則在左側表單修正。
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-chrome-300 bg-chrome-50/80 px-4 py-4 text-sm text-chrome-700">
            先選定 site，Google Maps 航線編輯器才有地圖脈絡與 waypoint authority。
          </div>
        )}
      </Panel>
    </div>
  )
}
