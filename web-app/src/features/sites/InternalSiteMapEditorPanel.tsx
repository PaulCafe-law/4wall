import {
  ActionButton,
  Field,
  Input,
  Panel,
  Select,
} from '../../components/ui'
import { GoogleMapCanvas, type RouteOverlay } from '../maps/GoogleMapCanvas'
import type { InspectionViewpoint, LaunchPoint, Site } from '../../lib/types'

export type SitePlacementMode = 'launch' | 'viewpoint' | null

function nextLaunchPoint(
  site: Site,
  count: number,
  point?: { lat: number; lng: number },
): LaunchPoint {
  return {
    launchPointId: `draft-launch-${count + 1}`,
    label: `${site.name} 起降點 ${count + 1}`,
    kind: count === 0 ? 'primary' : 'backup',
    lat: point?.lat ?? site.siteMap.center.lat,
    lng: point?.lng ?? site.siteMap.center.lng,
    headingDeg: 180,
    altitudeM: 0,
    isActive: true,
  }
}

function nextViewpoint(
  site: Site,
  count: number,
  point?: { lat: number; lng: number },
): InspectionViewpoint {
  return {
    viewpointId: `draft-viewpoint-${count + 1}`,
    label: `${site.name} 視角點 ${count + 1}`,
    purpose: count === 0 ? 'overview' : 'facade',
    lat: point?.lat ?? site.siteMap.center.lat,
    lng: point?.lng ?? site.siteMap.center.lng,
    headingDeg: 180,
    altitudeM: 32,
    distanceToFacadeM: 12,
    isActive: true,
  }
}

export function InternalSiteMapEditorPanel({
  site,
  launchPoints,
  viewpoints,
  baseMapType,
  routeOverlays,
  placementMode,
  isSaving,
  error,
  onBaseMapTypeChange,
  onPlacementModeChange,
  onLaunchPointsChange,
  onViewpointsChange,
  onSave,
}: {
  site: Site
  launchPoints: LaunchPoint[]
  viewpoints: InspectionViewpoint[]
  baseMapType: Site['siteMap']['baseMapType']
  routeOverlays: RouteOverlay[]
  placementMode: SitePlacementMode
  isSaving: boolean
  error: string | null
  onBaseMapTypeChange: (value: Site['siteMap']['baseMapType']) => void
  onPlacementModeChange: (value: SitePlacementMode) => void
  onLaunchPointsChange: (value: LaunchPoint[]) => void
  onViewpointsChange: (value: InspectionViewpoint[]) => void
  onSave: () => void
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[0.78fr_1.22fr]">
      <Panel>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">
          internal site authority
        </p>
        <h3 className="mt-2 font-display text-2xl font-semibold text-chrome-950">
          Google Maps 場域規劃
        </h3>
        <p className="mt-3 text-sm text-chrome-700">
          起降點與視角點只由 internal 在 Google Maps 上維護。customer
          只看到結果，不直接修改場域幾何。
        </p>

        <div className="mt-4 grid gap-4">
          <Field label="底圖模式">
            <Select
              value={baseMapType}
              onChange={(event) =>
                onBaseMapTypeChange(event.target.value as Site['siteMap']['baseMapType'])
              }
            >
              <option value="satellite">衛星檢視</option>
              <option value="roadmap">地圖</option>
              <option value="hybrid">混合</option>
            </Select>
          </Field>

          <div className="grid gap-3 md:grid-cols-3">
            <ActionButton
              variant={placementMode === 'launch' ? 'primary' : 'secondary'}
              onClick={() => onPlacementModeChange(placementMode === 'launch' ? null : 'launch')}
            >
              {placementMode === 'launch' ? '取消新增起降點' : '點地圖新增起降點'}
            </ActionButton>
            <ActionButton
              variant={placementMode === 'viewpoint' ? 'primary' : 'secondary'}
              onClick={() =>
                onPlacementModeChange(placementMode === 'viewpoint' ? null : 'viewpoint')
              }
            >
              {placementMode === 'viewpoint' ? '取消新增視角點' : '點地圖新增視角點'}
            </ActionButton>
            <ActionButton variant="secondary" onClick={onSave} disabled={isSaving}>
              {isSaving ? '儲存中…' : '儲存場域地圖'}
            </ActionButton>
          </div>

          <div className="rounded-2xl border border-chrome-200 bg-chrome-50/80 px-4 py-4 text-sm text-chrome-700">
            {placementMode === 'launch'
              ? '在地圖上點一下即可新增起降點。新增後可直接拖拉 L 點位調整位置。'
              : placementMode === 'viewpoint'
                ? '在地圖上點一下即可新增視角點。新增後可直接拖拉 V 點位調整位置。'
                : '目前可直接拖拉 L / V 點位，也可切換到新增模式在地圖上放置新點。'}
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-3">
              <p className="font-medium text-chrome-950">起降點</p>
              {launchPoints.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-chrome-300 bg-chrome-50/80 px-4 py-4 text-sm text-chrome-700">
                  目前沒有起降點。可直接在地圖上新增起降點，或手動補齊其餘參數。
                </div>
              ) : (
                launchPoints.map((point, index) => (
                  <div
                    key={point.launchPointId}
                    className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-chrome-950">L{index + 1}</p>
                      <ActionButton
                        variant="ghost"
                        className="px-2 py-1 text-red-700"
                        onClick={() =>
                          onLaunchPointsChange(
                            launchPoints.filter((_, launchIndex) => launchIndex !== index),
                          )
                        }
                      >
                        刪除
                      </ActionButton>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <Field label="名稱">
                        <Input
                          value={point.label}
                          onChange={(event) =>
                            onLaunchPointsChange(
                              launchPoints.map((current, launchIndex) =>
                                launchIndex === index
                                  ? { ...current, label: event.target.value }
                                  : current,
                              ),
                            )
                          }
                        />
                      </Field>
                      <Field label="類型">
                        <Select
                          value={point.kind}
                          onChange={(event) =>
                            onLaunchPointsChange(
                              launchPoints.map((current, launchIndex) =>
                                launchIndex === index
                                  ? { ...current, kind: event.target.value as LaunchPoint['kind'] }
                                  : current,
                              ),
                            )
                          }
                        >
                          <option value="primary">primary</option>
                          <option value="backup">backup</option>
                        </Select>
                      </Field>
                      <Field label="緯度">
                        <Input
                          type="number"
                          value={point.lat}
                          onChange={(event) =>
                            onLaunchPointsChange(
                              launchPoints.map((current, launchIndex) =>
                                launchIndex === index
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
                          value={point.lng}
                          onChange={(event) =>
                            onLaunchPointsChange(
                              launchPoints.map((current, launchIndex) =>
                                launchIndex === index
                                  ? { ...current, lng: Number(event.target.value) || current.lng }
                                  : current,
                              ),
                            )
                          }
                        />
                      </Field>
                      <Field label="朝向角度">
                        <Input
                          type="number"
                          value={point.headingDeg ?? 0}
                          onChange={(event) =>
                            onLaunchPointsChange(
                              launchPoints.map((current, launchIndex) =>
                                launchIndex === index
                                  ? { ...current, headingDeg: Number(event.target.value) || 0 }
                                  : current,
                              ),
                            )
                          }
                        />
                      </Field>
                      <Field label="高度 (m)">
                        <Input
                          type="number"
                          value={point.altitudeM ?? 0}
                          onChange={(event) =>
                            onLaunchPointsChange(
                              launchPoints.map((current, launchIndex) =>
                                launchIndex === index
                                  ? { ...current, altitudeM: Number(event.target.value) || 0 }
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

            <div className="space-y-3">
              <p className="font-medium text-chrome-950">視角點</p>
              {viewpoints.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-chrome-300 bg-chrome-50/80 px-4 py-4 text-sm text-chrome-700">
                  目前沒有視角點。可直接在地圖上新增視角點，或手動補齊巡檢視角參數。
                </div>
              ) : (
                viewpoints.map((point, index) => (
                  <div
                    key={point.viewpointId}
                    className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-chrome-950">V{index + 1}</p>
                      <ActionButton
                        variant="ghost"
                        className="px-2 py-1 text-red-700"
                        onClick={() =>
                          onViewpointsChange(
                            viewpoints.filter((_, viewpointIndex) => viewpointIndex !== index),
                          )
                        }
                      >
                        刪除
                      </ActionButton>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <Field label="名稱">
                        <Input
                          value={point.label}
                          onChange={(event) =>
                            onViewpointsChange(
                              viewpoints.map((current, viewpointIndex) =>
                                viewpointIndex === index
                                  ? { ...current, label: event.target.value }
                                  : current,
                              ),
                            )
                          }
                        />
                      </Field>
                      <Field label="用途">
                        <Select
                          value={point.purpose}
                          onChange={(event) =>
                            onViewpointsChange(
                              viewpoints.map((current, viewpointIndex) =>
                                viewpointIndex === index
                                  ? {
                                      ...current,
                                      purpose:
                                        event.target.value as InspectionViewpoint['purpose'],
                                    }
                                  : current,
                              ),
                            )
                          }
                        >
                          <option value="overview">overview</option>
                          <option value="facade">facade</option>
                          <option value="detail">detail</option>
                        </Select>
                      </Field>
                      <Field label="緯度">
                        <Input
                          type="number"
                          value={point.lat}
                          onChange={(event) =>
                            onViewpointsChange(
                              viewpoints.map((current, viewpointIndex) =>
                                viewpointIndex === index
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
                          value={point.lng}
                          onChange={(event) =>
                            onViewpointsChange(
                              viewpoints.map((current, viewpointIndex) =>
                                viewpointIndex === index
                                  ? { ...current, lng: Number(event.target.value) || current.lng }
                                  : current,
                              ),
                            )
                          }
                        />
                      </Field>
                      <Field label="朝向角度">
                        <Input
                          type="number"
                          value={point.headingDeg ?? 0}
                          onChange={(event) =>
                            onViewpointsChange(
                              viewpoints.map((current, viewpointIndex) =>
                                viewpointIndex === index
                                  ? { ...current, headingDeg: Number(event.target.value) || 0 }
                                  : current,
                              ),
                            )
                          }
                        />
                      </Field>
                      <Field label="高度 (m)">
                        <Input
                          type="number"
                          value={point.altitudeM ?? 0}
                          onChange={(event) =>
                            onViewpointsChange(
                              viewpoints.map((current, viewpointIndex) =>
                                viewpointIndex === index
                                  ? { ...current, altitudeM: Number(event.target.value) || 0 }
                                  : current,
                              ),
                            )
                          }
                        />
                      </Field>
                      <Field label="離立面距離 (m)">
                        <Input
                          type="number"
                          value={point.distanceToFacadeM ?? 0}
                          onChange={(event) =>
                            onViewpointsChange(
                              viewpoints.map((current, viewpointIndex) =>
                                viewpointIndex === index
                                  ? {
                                      ...current,
                                      distanceToFacadeM: Number(event.target.value) || 0,
                                    }
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
        </div>
      </Panel>

      <Panel>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">
          site map
        </p>
        <h3 className="mt-2 font-display text-2xl font-semibold text-chrome-950">
          Google Maps 場域底圖
        </h3>
        <div className="mt-4 space-y-4">
          <GoogleMapCanvas
            siteMap={{
              ...site.siteMap,
              baseMapType,
              launchPoints,
              viewpoints,
            }}
            routeOverlays={routeOverlays}
            editableLaunchPoints={launchPoints}
            editableViewpoints={viewpoints}
            internalEditable
            onMapClick={(point) => {
              if (placementMode === 'launch') {
                onLaunchPointsChange([
                  ...launchPoints,
                  nextLaunchPoint(site, launchPoints.length, point),
                ])
                onPlacementModeChange(null)
                return
              }
              if (placementMode === 'viewpoint') {
                onViewpointsChange([
                  ...viewpoints,
                  nextViewpoint(site, viewpoints.length, point),
                ])
                onPlacementModeChange(null)
              }
            }}
            onLaunchPointMove={(index, point) =>
              onLaunchPointsChange(
                launchPoints.map((current, launchIndex) =>
                  launchIndex === index ? { ...current, lat: point.lat, lng: point.lng } : current,
                ),
              )
            }
            onViewpointMove={(index, point) =>
              onViewpointsChange(
                viewpoints.map((current, viewpointIndex) =>
                  viewpointIndex === index
                    ? { ...current, lat: point.lat, lng: point.lng }
                    : current,
                ),
              )
            }
          />
          <div className="rounded-2xl border border-chrome-200 bg-chrome-50/80 px-4 py-4 text-sm text-chrome-700">
            L 點位代表起降點，V 點位代表巡檢視角點。兩者都由 internal 直接在 Google Maps
            上規劃，並與 route waypoint 分開保存。
          </div>
        </div>
      </Panel>
    </div>
  )
}
