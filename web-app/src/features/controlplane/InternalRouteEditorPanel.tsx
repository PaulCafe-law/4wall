import { ActionButton, Field, Input, Panel, Select } from '../../components/ui'
import { GoogleMapCanvas } from '../maps/GoogleMapCanvas'
import type { InspectionRoute, InspectionWaypoint, LaunchPoint, Site } from '../../lib/types'

function waypointLabel(index: number, waypoint: InspectionWaypoint) {
  return waypoint.label?.trim() || `巡邏點 ${index + 1}`
}

function formatLaunchPointKind(kind: LaunchPoint['kind']) {
  return kind === 'backup' ? '備用起降點' : '主要起降點'
}

function formatWaypointKind(kind: InspectionWaypoint['kind']) {
  if (kind === 'hold') return '保持點'
  return '巡邏點'
}

function defaultLaunchPoint(site: Site): LaunchPoint {
  return {
    launchPointId: 'launch-draft',
    label: `${site.name} 起降點`,
    kind: 'primary',
    lat: site.location.lat,
    lng: site.location.lng,
    headingDeg: 180,
    altitudeM: 0,
    isActive: true,
  }
}

function defaultWaypoint(site: Site, kind: InspectionWaypoint['kind']): InspectionWaypoint {
  const baseOffset = kind === 'hold' ? 0.00022 : 0.00012
  return {
    kind,
    lat: site.location.lat + baseOffset,
    lng: site.location.lng + baseOffset,
    altitudeM: kind === 'hold' ? 28 : 36,
    label: kind === 'hold' ? `${site.name} 保持點` : `${site.name} 巡邏點`,
    headingDeg: 0,
    dwellSeconds: kind === 'hold' ? 8 : 0,
  }
}

function draftPath(launchPoint: LaunchPoint | null, waypoints: InspectionWaypoint[]) {
  if (!launchPoint || waypoints.length === 0) return []
  return [
    { lat: launchPoint.lat, lng: launchPoint.lng },
    ...waypoints.map((waypoint) => ({ lat: waypoint.lat, lng: waypoint.lng })),
    { lat: launchPoint.lat, lng: launchPoint.lng },
  ]
}

export function InternalRouteEditorPanel({
  site,
  routes,
  selectedRouteId,
  routeName,
  routeDescription,
  launchPoint,
  waypoints,
  routeError,
  isSavingRoute,
  onSelectedRouteIdChange,
  onRouteNameChange,
  onRouteDescriptionChange,
  onLaunchPointChange,
  onWaypointsChange,
  onSeedDemoDraft,
  onSaveRoute,
}: {
  site: Site | null
  routes: InspectionRoute[]
  selectedRouteId: string
  routeName: string
  routeDescription: string
  launchPoint: LaunchPoint | null
  waypoints: InspectionWaypoint[]
  routeError: string | null
  isSavingRoute: boolean
  onSelectedRouteIdChange: (value: string) => void
  onRouteNameChange: (value: string) => void
  onRouteDescriptionChange: (value: string) => void
  onLaunchPointChange: (value: LaunchPoint) => void
  onWaypointsChange: (value: InspectionWaypoint[]) => void
  onSeedDemoDraft: () => void
  onSaveRoute: () => void
}) {
  const activeRoute = routes.find((route) => route.routeId === selectedRouteId) ?? null
  const previewPath = draftPath(launchPoint, waypoints)

  return (
    <div className="grid gap-6 xl:grid-cols-[0.78fr_1.22fr]">
      <Panel>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">
          內部航線權限
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">
          Google Maps 航點編輯器
        </h2>
        <p className="mt-3 text-sm text-chrome-700">
          保全巡檢 v1 只規劃起降點與巡邏航點。客戶提供場域與需求，最終航線由內部規劃團隊發布。
        </p>
        <div className="mt-4 grid gap-4">
          <Field label="編輯模式">
            <Select
              value={selectedRouteId}
              onChange={(event) => onSelectedRouteIdChange(event.target.value)}
            >
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
            <Input
              value={routeDescription}
              onChange={(event) => onRouteDescriptionChange(event.target.value)}
            />
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
              新增巡邏點
            </ActionButton>
            <ActionButton
              variant="secondary"
              onClick={() =>
                site ? onWaypointsChange([...waypoints, defaultWaypoint(site, 'hold')]) : undefined
              }
              disabled={!site}
            >
              新增保持點
            </ActionButton>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <ActionButton
              variant="secondary"
              onClick={() => site && onLaunchPointChange(defaultLaunchPoint(site))}
              disabled={!site}
            >
              重設起降點
            </ActionButton>
            <ActionButton
              variant="secondary"
              onClick={() => onWaypointsChange([])}
              disabled={waypoints.length === 0}
            >
              清空點位
            </ActionButton>
            <ActionButton
              onClick={onSaveRoute}
              disabled={isSavingRoute || !site || !launchPoint || waypoints.length === 0}
            >
              {isSavingRoute ? '儲存航線中…' : activeRoute ? '更新航線' : '建立航線'}
            </ActionButton>
          </div>
          <div className="rounded-2xl border border-chrome-200 bg-chrome-50/80 px-4 py-4 text-sm text-chrome-700">
            地圖上的 `L` 是起降點，`1..N` 是巡邏航點。紅線會永遠以
            {' `L → 航點 → L` '}
            顯示閉合巡邏迴路；回到起降點是固定規則，不另外新增最後一個航點。
          </div>
          {routeError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {routeError}
            </div>
          ) : null}

          <div className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-chrome-950">起降點</p>
              {launchPoint ? (
                <span className="rounded-full bg-chrome-100 px-3 py-1 text-xs text-chrome-700">
                  {formatLaunchPointKind(launchPoint.kind)}
                </span>
              ) : null}
            </div>
            {!launchPoint ? (
              <p className="mt-3 text-sm text-chrome-700">目前沒有起降點。請先重設起降點或使用示範初稿。</p>
            ) : (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Field label="標籤">
                  <Input
                    value={launchPoint.label}
                    onChange={(event) =>
                      onLaunchPointChange({
                        ...launchPoint,
                        label: event.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="類型">
                  <Select
                    value={launchPoint.kind}
                    onChange={(event) =>
                      onLaunchPointChange({
                        ...launchPoint,
                        kind: event.target.value as LaunchPoint['kind'],
                      })
                    }
                  >
                    <option value="primary">主要起降點</option>
                    <option value="backup">備用起降點</option>
                  </Select>
                </Field>
                <Field label="緯度">
                  <Input
                    type="number"
                    value={launchPoint.lat}
                    onChange={(event) =>
                      onLaunchPointChange({
                        ...launchPoint,
                        lat: Number(event.target.value) || launchPoint.lat,
                      })
                    }
                  />
                </Field>
                <Field label="經度">
                  <Input
                    type="number"
                    value={launchPoint.lng}
                    onChange={(event) =>
                      onLaunchPointChange({
                        ...launchPoint,
                        lng: Number(event.target.value) || launchPoint.lng,
                      })
                    }
                  />
                </Field>
              </div>
            )}
          </div>

          <div className="space-y-3">
            {waypoints.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-chrome-300 bg-chrome-50/80 px-4 py-4 text-sm text-chrome-700">
                目前沒有巡邏航點。可以先使用示範初稿，或直接點地圖新增第一個巡邏點。
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
                        <option value="transit">{formatWaypointKind('transit')}</option>
                        <option value="hold">{formatWaypointKind('hold')}</option>
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
                    <Field label="航向角">
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
              routeOverlays={[
                {
                  routeId: selectedRouteId || 'draft',
                  name: routeName || '航線草稿',
                  path: previewPath,
                  active: true,
                },
              ]}
              editableWaypoints={waypoints}
              editableLaunchPoints={launchPoint ? [launchPoint] : []}
              internalEditable
              onMapClick={(point) =>
                onWaypointsChange([
                  ...waypoints,
                  {
                    ...defaultWaypoint(site, 'transit'),
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
              onLaunchPointMove={(index, point) => {
                if (!launchPoint || index !== 0) return
                onLaunchPointChange({ ...launchPoint, lat: point.lat, lng: point.lng })
              }}
            />
            <div className="rounded-2xl border border-chrome-200 bg-chrome-50/80 px-4 py-4 text-sm text-chrome-700">
              點擊地圖可新增巡邏點；拖拉 `L` 或 `1..N` 會立即調整航線。紅線只表示發布前的閉合巡邏路徑。
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-chrome-300 bg-chrome-50/80 px-4 py-4 text-sm text-chrome-700">
            請先建立並選擇場域，Google Maps 才能用起降點與巡邏航點顯示閉合巡邏迴路。
          </div>
        )}
      </Panel>
    </div>
  )
}
