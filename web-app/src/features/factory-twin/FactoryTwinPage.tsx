import { useEffect, useMemo, useState } from 'react';

import { Metric, Panel, ShellSection } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuthedQuery } from '../../lib/auth-query';
import type { CameraDevice } from '../../lib/types';
import { FactoryTwinWorkspace } from './FactoryTwinWorkspace';
import type { CameraEntity, PersonEntity } from './mirror/domain/entities';
import { REAL_FACTORY_MOVEMENT_AREA } from './mirror/domain/movementArea';

const JINGCHENG_SITE_ID = 'dd6cbdd3aa744736ad96d2791d689fce';
const LIVE_PERSON_FRESH_MS = 60_000;
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

function isFreshObservation(capturedAt: string, nowMs: number): boolean {
  if (nowMs <= 0) return false;
  const capturedAtMs = Date.parse(capturedAt);
  return Number.isFinite(capturedAtMs) && nowMs - capturedAtMs >= 0 && nowMs - capturedAtMs <= LIVE_PERSON_FRESH_MS;
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

function toLivePersons(cameras: CameraDevice[], nowMs: number): PersonEntity[] {
  return cameras.flatMap((camera) => {
    const match = matchingFactoryCamera(camera);
    const observation = camera.latestPersonObservation;
    if (!match || !observation || !isFreshObservation(observation.capturedAt, nowMs)) return [];

    return observation.detections.flatMap((detection, index) => {
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

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="工廠數位分身"
        title="靚程工廠 Digital Twin"
        subtitle="即時檢視工廠 3D 數位分身；攝影機截圖、儀表讀值與現場人員位置使用平台資料來源。"
      />

      <div className="grid gap-4 md:grid-cols-5">
        <Metric label="固定攝影機" value={platformCameras.length} hint="已綁定至數位分身的平台攝影機" />
        <Metric label="在線" value={onlineCount} hint="最近有心跳、可取得最新截圖" />
        <Metric label="現場人數" value={livePersons.length} hint="60 秒內且投影有效的匿名人員" />
        <Metric
          label="快照更新"
          value={`${platformCameras[0]?.samplingIntervalSeconds ?? 10}s`}
          hint="攝影機設定的截圖間隔"
        />
        <Metric label="資料來源" value="真實資料" hint="3D 場景顯示實際攝影機、儀表與匿名人員資料" />
      </div>

      {camerasQuery.isError ? (
        <Panel className="border-amber-200 bg-amber-50/85">
          <p className="text-sm text-amber-900">
            暫時無法讀取 camera metadata，Factory Twin 會保留既有場景，但不會顯示最新平台資料。
          </p>
        </Panel>
      ) : null}

      <FactoryTwinWorkspace platformCameras={platformCameras} livePersons={livePersons} />
    </div>
  );
}
