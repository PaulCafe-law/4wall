import { useMemo } from 'react';

import { Metric, Panel, ShellSection } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuthedQuery } from '../../lib/auth-query';
import type { CameraDevice } from '../../lib/types';
import { FactoryTwinWorkspace } from './FactoryTwinWorkspace';
import type { CameraEntity } from './mirror/domain/entities';

const JINGCHENG_SITE_ID = 'dd6cbdd3aa744736ad96d2791d689fce';
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

export function FactoryTwinPage() {
  const camerasQuery = useAuthedQuery({
    queryKey: ['factory-twin', 'cameras'],
    queryFn: api.listCameras,
    staleTime: 5_000,
    refetchInterval: 10_000,
  });

  const platformCameras = useMemo(() => {
    return [...(camerasQuery.data?.cameras ?? [])]
      .filter((camera) => Boolean(matchingFactoryCamera(camera)))
      .sort((a, b) => cameraSortOrder(a) - cameraSortOrder(b) || a.name.localeCompare(b.name))
      .map(toFactoryCamera);
  }, [camerasQuery.data?.cameras]);

  const onlineCount = platformCameras.filter((camera) => camera.online).length;

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="工廠數位分身"
        title="靚程工廠 Digital Twin"
        subtitle="即時檢視工廠 3D 數位分身；攝影機截圖與儀表讀值使用與平台相同的資料來源。"
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="固定攝影機" value={platformCameras.length} hint="已綁定至數位分身的平台攝影機" />
        <Metric label="在線" value={onlineCount} hint="最近有心跳、可取得最新截圖" />
        <Metric
          label="快照更新"
          value={`${platformCameras[0]?.samplingIntervalSeconds ?? 10}s`}
          hint="監視器畫面輪詢間隔"
        />
        <Metric label="資料模式" value="模擬＋實況" hint="3D 情境為模擬資料；攝影機與儀表讀值為現場實況" />
      </div>

      {camerasQuery.isError ? (
        <Panel className="border-amber-200 bg-amber-50/85">
          <p className="text-sm text-amber-900">
            暫時讀不到第四面牆 camera metadata；Factory Twin 會保留本地監視器 fallback。
          </p>
        </Panel>
      ) : null}

      <FactoryTwinWorkspace platformCameras={platformCameras} />
    </div>
  );
}
