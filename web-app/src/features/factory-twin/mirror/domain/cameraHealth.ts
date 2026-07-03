import type { CameraEntity } from './entities';

export type CameraFreshness = 'fresh' | 'stale' | 'offline' | 'no_frame' | 'mock';

export interface CameraHealth {
  state: CameraFreshness;
  label: string;
  detail: string;
}

function attrString(entity: CameraEntity, key: string): string | null {
  const value = entity.attrs?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function attrNumber(entity: CameraEntity, key: string): number | null {
  const value = entity.attrs?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function ageMs(value: string | null, nowMs: number): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Math.max(0, nowMs - parsed) : null;
}

export function platformCameraId(entity: CameraEntity): string | null {
  return attrString(entity, 'platformCameraId');
}

export function latestFrameId(entity: CameraEntity): string | null {
  return attrString(entity, 'latestFrameId');
}

export function latestFrameCapturedAt(entity: CameraEntity): string | null {
  return attrString(entity, 'latestFrameCapturedAt') ?? attrString(entity, 'lastFrameAt');
}

export function cameraAnalysisStatus(entity: CameraEntity): string | null {
  return attrString(entity, 'analysisStatus');
}

export function cameraUploadStatus(entity: CameraEntity): string | null {
  return attrString(entity, 'uploadStatus');
}

export function cameraLastHeartbeatAt(entity: CameraEntity): string | null {
  return attrString(entity, 'lastHeartbeatAt');
}

export function cameraLastError(entity: CameraEntity): string | null {
  return attrString(entity, 'lastError');
}

export function cameraUploadedFrameCount(entity: CameraEntity): number {
  return attrNumber(entity, 'uploadedFrameCount') ?? (latestFrameId(entity) ? 1 : 0);
}

export function cameraRefreshMs(entity: CameraEntity): number {
  return Math.max(1000, (entity.samplingIntervalSeconds || 10) * 1000);
}

export function cameraHasPlatformFrame(entity: CameraEntity): boolean {
  return entity.feedMode === 'snapshot' && Boolean(platformCameraId(entity)) && cameraUploadedFrameCount(entity) > 0;
}

export function cameraFreshness(entity: CameraEntity, nowMs = Date.now()): CameraHealth {
  if (entity.feedMode !== 'snapshot') {
    return {
      state: 'mock',
      label: '模擬',
      detail: '尚未綁定 Fourth Wall CameraDevice',
    };
  }

  const error = cameraLastError(entity);
  const frameCount = cameraUploadedFrameCount(entity);
  if (!latestFrameId(entity) || frameCount <= 0) {
    return {
      state: 'no_frame',
      label: '無畫面',
      detail: '尚未收到雲端最新截圖',
    };
  }

  if (error) {
    return {
      state: 'offline',
      label: '離線',
      detail: error,
    };
  }

  const thresholdMs = Math.max(45_000, (entity.samplingIntervalSeconds || 10) * 3_000);
  const ages = [ageMs(latestFrameCapturedAt(entity), nowMs), ageMs(cameraLastHeartbeatAt(entity), nowMs)].filter(
    (age): age is number => age !== null,
  );

  if (ages.length === 0) {
    return {
      state: entity.online ? 'stale' : 'offline',
      label: entity.online ? '停更' : '離線',
      detail: '缺少 heartbeat / frame 時間',
    };
  }

  const oldestAge = Math.max(...ages);
  if (oldestAge <= thresholdMs) {
    return {
      state: 'fresh',
      label: '同步',
      detail: `最後更新 ${Math.max(0, Math.round(oldestAge / 1000))} 秒前`,
    };
  }

  return {
    state: entity.online ? 'stale' : 'offline',
    label: entity.online ? '停更' : '離線',
    detail: `最後更新已超過 ${Math.round(oldestAge / 60000)} 分鐘`,
  };
}
