import { useEffect, useMemo, useState } from 'react';

import { api } from '../../lib/api';
import { useAuthedQuery } from '../../lib/auth-query';
import type { CameraDevice } from '../../lib/types';
import { FactoryTwinWorkspace } from './FactoryTwinWorkspace';
import type { CameraEntity, PersonEntity } from './mirror/domain/entities';
import { livePersonAnchorForCamera } from './mirror/domain/machineCameras';
import { REAL_FACTORY_MOVEMENT_AREA } from './mirror/domain/movementArea';

const JINGCHENG_SITE_ID = 'dd6cbdd3aa744736ad96d2791d689fce';
// 現場人員保留窗:人在時偵測器每 ~10 秒送一次正向觀測維持新鮮;偵測器不再送「0 人」空觀測
// (見 gpu-person-presence main.py),所以人離開後由此窗自然老化清除。90 秒兼顧「不閃爍」與「離開後及時消失」。
const LIVE_PERSON_FRESH_MS = 90_000;
// Clocks differ across the camera edge (Pi), the detector host, and the browser.
// Allow observations that look slightly "in the future" from the client's clock.
const LIVE_PERSON_FUTURE_SKEW_MS = 60_000;
const LIVE_PERSON_BOUNDS_MARGIN_M = 2;

const FACTORY_CAMERA_LABELS: Array<{ ip: string; label: string; order: number }> = [
  { ip: '192.168.1.31', label: '機台周遭', order: 0 },
  { ip: '192.168.1.28', label: '桌面分類', order: 1 },
  { ip: '192.168.1.10', label: '儀表板', order: 2 },
];

function matchingFactoryCamera(camera: CameraDevice): { label: string; order: number } | null {
  const match = FACTORY_CAMERA_LABELS.find((item) => camera.name.includes(item.ip));
  if (!match) return null;
  if (camera.siteId && camera.siteId !== JINGCHENG_SITE_ID) return null;
  return { label: match.label, order: match.order };
}

function cameraSortOrder(camera: CameraDevice): number {
  return matchingFactoryCamera(camera)?.order ?? Number.MAX_SAFE_INTEGER;
}

function toFactoryCamera(camera: CameraDevice): CameraEntity {
  const label = matchingFactoryCamera(camera)?.label ?? camera.name;
  return {
    id: `fw-camera-${camera.cameraId}`,
    type: 'camera',
    name: label,
    position: { x: -1.5 + cameraSortOrder(camera) * 1.5, y: 1.6, z: -6.5 },
    status: camera.lastError ? 'inactive' : 'active',
    source: 'live',
    siteLabel: '靚程工廠 / HC600-01',
    online: !camera.lastError && camera.status !== 'inactive',
    samplingIntervalSeconds: camera.samplingIntervalSeconds || 10,
    feedMode: 'snapshot',
    attrs: {
      platformCameraId: camera.cameraId,
      platformCameraName: camera.name,
      latestFrameId: camera.latestFrame?.frameId ?? null,
      latestFrameCapturedAt: camera.latestFrame?.capturedAt ?? null,
      latestGaugeReadings: camera.latestGaugeReadings,
      latestOcrObservation: camera.latestOcrObservation,
      latestPersonObservation: camera.latestPersonObservation,
      uploadStatus: camera.latestFrame?.uploadStatus ?? null,
      analysisStatus: camera.latestFrame?.analysisStatus ?? null,
      uploadedFrameCount: camera.uploadedFrameCount,
      queuedFrameCount: camera.queuedFrameCount,
      failedFrameCount: camera.failedFrameCount,
      lastFrameAt: camera.lastFrameAt,
      lastHeartbeatAt: camera.lastHeartbeatAt,
      lastError: camera.lastError,
    },
  };
}

function isFreshObservation(timestamp: string, nowMs: number): boolean {
  if (nowMs <= 0) return false;
  const tMs = Date.parse(timestamp);
  if (!Number.isFinite(tMs)) return false;
  const age = nowMs - tMs;
  // Freshness is measured against the platform receive time (accurate NTP clock),
  // tolerating small forward skew so edge/browser clock drift does not hide people.
  return age >= -LIVE_PERSON_FUTURE_SKEW_MS && age <= LIVE_PERSON_FRESH_MS;
}

function isWithinLivePersonBounds(position: { x: number; z: number }): boolean {
  const bounds = REAL_FACTORY_MOVEMENT_AREA.bounds;
  return (
    Number.isFinite(position.x) &&
    Number.isFinite(position.z) &&
    position.x >= bounds.minX - LIVE_PERSON_BOUNDS_MARGIN_M &&
    position.x <= bounds.maxX + LIVE_PERSON_BOUNDS_MARGIN_M &&
    position.z >= bounds.minZ - LIVE_PERSON_BOUNDS_MARGIN_M &&
    position.z <= bounds.maxZ + LIVE_PERSON_BOUNDS_MARGIN_M
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- 測試需直接驗證 live 人員投影邏輯
export function toLivePersons(cameras: CameraDevice[], nowMs: number): PersonEntity[] {
  return cameras.flatMap((camera): PersonEntity[] => {
    const match = matchingFactoryCamera(camera);
    const observation = camera.latestPersonObservation;
    if (!match || !observation) return [];
    // Prefer platform receive time over camera capture time: the Pi's clock can lag,
    // which would otherwise push a just-received observation outside the window.
    const freshnessTimestamp = observation.receivedAt || observation.capturedAt;
    if (!isFreshObservation(freshnessTimestamp, nowMs)) return [];
    if (observation.personCount <= 0) return [];

    const projected = observation.detections.flatMap((detection, index) => {
      const floorPosition = detection.floorPosition;
      if (!floorPosition || !isWithinLivePersonBounds(floorPosition)) return [];

      return [
        {
          id: `fw-live-person-${camera.cameraId}-${observation.observationId}-${index}`,
          type: 'person',
          name: `現場人員 ${match.order + 1}-${index + 1}`,
          role: 'anonymous-presence',
          station: match.label,
          position: { x: floorPosition.x, y: 0.05, z: floorPosition.z },
          status: 'on-duty',
          source: 'live',
          attrs: {
            fixedWorld: true,
            platformCameraId: camera.cameraId,
            platformCameraName: camera.name,
            cameraLabel: match.label,
            observationId: observation.observationId,
            frameId: observation.frameId,
            capturedAt: observation.capturedAt,
            receivedAt: observation.receivedAt,
            calibrationId: observation.calibrationId,
            detectorName: observation.detectorName,
            confidence: detection.confidence,
            bbox: detection.bbox,
            footPoint: detection.footPoint,
          },
        } satisfies PersonEntity,
      ];
    });
    if (projected.length > 0) return projected;

    // 偵測到人但沒有任何有效地板投影(未校正或投影超出廠區)時,
    // 退回「攝影機對映機台旁」的估算位置,聚合成單一現場人員標記。
    const anchor = livePersonAnchorForCamera(`fw-camera-${camera.cameraId}`);
    if (!anchor) return [];
    const confidences = observation.detections
      .map((detection) => detection.confidence)
      .filter((value) => Number.isFinite(value));

    return [
      {
        id: `fw-live-person-${camera.cameraId}-presence`,
        type: 'person',
        name: observation.personCount > 1 ? `現場人員 ×${observation.personCount}` : '現場人員',
        role: 'anonymous-presence',
        station: match.label,
        position: anchor,
        status: 'on-duty',
        source: 'live',
        attrs: {
          fixedWorld: true,
          approximate: true,
          platformCameraId: camera.cameraId,
          platformCameraName: camera.name,
          cameraLabel: match.label,
          observationId: observation.observationId,
          frameId: observation.frameId,
          capturedAt: observation.capturedAt,
          receivedAt: observation.receivedAt,
          calibrationId: observation.calibrationId,
          detectorName: observation.detectorName,
          personCount: observation.personCount,
          ...(confidences.length > 0 ? { confidence: Math.max(...confidences) } : {}),
        },
      } satisfies PersonEntity,
    ];
  });
}

export function FactoryTwinPage() {
  const [nowMs, setNowMs] = useState(0);
  const camerasQuery = useAuthedQuery({
    queryKey: ['factory-twin', 'cameras'],
    queryFn: api.listCameras,
    staleTime: 5_000,
    refetchInterval: 10_000,
  });

  useEffect(() => {
    const updateNow = () => setNowMs(Date.now());
    updateNow();
    const interval = window.setInterval(updateNow, 15_000);
    return () => window.clearInterval(interval);
  }, []);

  const platformCameras = useMemo(() => {
    return [...(camerasQuery.data?.cameras ?? [])]
      .filter((camera) => Boolean(matchingFactoryCamera(camera)))
      .sort((a, b) => cameraSortOrder(a) - cameraSortOrder(b) || a.name.localeCompare(b.name))
      .map(toFactoryCamera);
  }, [camerasQuery.data?.cameras]);

  const livePersons = useMemo(
    () => toLivePersons(camerasQuery.data?.cameras ?? [], nowMs),
    [camerasQuery.data?.cameras, nowMs],
  );
  const onlineCount = platformCameras.filter((camera) => camera.online).length;
  const livePersonCount = livePersons.reduce((total, person) => {
    const count = person.attrs?.personCount;
    return total + (typeof count === 'number' && Number.isFinite(count) && count > 0 ? count : 1);
  }, 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-chrome-200/80 bg-chrome-50/90 px-4 py-1.5 md:px-6">
        <h1 className="font-display text-sm font-semibold tracking-[-0.02em] text-chrome-950">
          靚程工廠 Digital Twin
        </h1>
        <p className="font-mono text-[11px] text-chrome-600">
          {onlineCount} 攝影機在線・現場 {livePersonCount} 人・
          {platformCameras[0]?.samplingIntervalSeconds ?? 10}s・真實資料
        </p>
      </div>

      {camerasQuery.isError ? (
        <div className="border-b border-amber-200 bg-amber-50/90 px-4 py-1.5 text-xs text-amber-900 md:px-6">
          暫時無法讀取 camera metadata，Factory Twin 會保留既有場景，但不會顯示最新平台資料。
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <FactoryTwinWorkspace platformCameras={platformCameras} livePersons={livePersons} />
      </div>
    </div>
  );
}
