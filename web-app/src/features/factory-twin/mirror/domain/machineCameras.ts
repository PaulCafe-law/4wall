import type { CameraEntity, Vec3 } from './entities';
import { buildMockEntities } from './mockData';

export const HC600_01_CAMERAS: CameraEntity[] = [
  {
    id: 'fw-hc600-01-overview',
    type: 'camera',
    name: 'HC600-01 上方全景',
    position: { x: 0, y: 0, z: 0 },
    source: 'sim',
    status: 'active',
    siteLabel: '靚程工廠 / HC600-01',
    online: true,
    samplingIntervalSeconds: 10,
    feedMode: 'mock',
  },
  {
    id: 'fw-hc600-01-mold',
    type: 'camera',
    name: 'HC600-01 模具側',
    position: { x: 0, y: 0, z: 0 },
    source: 'sim',
    status: 'active',
    siteLabel: '靚程工廠 / HC600-01',
    online: true,
    samplingIntervalSeconds: 10,
    feedMode: 'mock',
  },
  {
    id: 'fw-hc600-01-operator',
    type: 'camera',
    name: 'HC600-01 操作側',
    position: { x: 0, y: 0, z: 0 },
    source: 'sim',
    status: 'active',
    siteLabel: '靚程工廠 / HC600-01',
    online: true,
    samplingIntervalSeconds: 10,
    feedMode: 'mock',
  },
];

export function camerasForMachine(machineId: string): CameraEntity[] {
  return machineId === PLATFORM_CAMERA_MACHINE_ID ? HC600_01_CAMERAS : [];
}

// camerasForMachine 的反向:靚程廠內的攝影機(sim 三支與平台 fw-camera-* 三支
// 「機台周遭/桌面分類/儀表板」)目前全數對映 HC600-01 成型機,與 MachineDetail
// 直接以 platformCameras 呈現 m-hc600 監視器選單的對映一致。
export const PLATFORM_CAMERA_MACHINE_ID = 'm-hc600';

// HC600-01 的攝影機人員偵測目前只代表「這台機台旁有人」。
// 不採用尚未校準好的地板投影,固定放在 GLB 中 01 機台旁的作業側。
export const LIVE_PERSON_MACHINE_OFFSET_X_M = 3.64;
export const LIVE_PERSON_MACHINE_OFFSET_Z_M = 3.51;
export const HC600_01_LIVE_PERSON_ANCHOR_STORAGE_KEY = 'fourwall:factory-twin:hc600-01-live-person-anchor';
export const HC600_01_LIVE_PERSON_ANCHOR_CHANGED_EVENT = 'fourwall:factory-twin:hc600-01-live-person-anchor-changed';

function validAnchor(value: unknown): Vec3 | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<Vec3>;
  const x = Number(candidate.x);
  const y = Number(candidate.y ?? 0.05);
  const z = Number(candidate.z);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return { x, y, z };
}

export function readStoredLivePersonAnchor(): Vec3 | null {
  const storage = globalThis.localStorage;
  if (!storage) return null;
  const raw = storage.getItem(HC600_01_LIVE_PERSON_ANCHOR_STORAGE_KEY);
  if (!raw) return null;
  try {
    return validAnchor(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function broadcastLivePersonAnchorPreview(anchor: Vec3 | null): void {
  globalThis.dispatchEvent?.(
    new CustomEvent(HC600_01_LIVE_PERSON_ANCHOR_CHANGED_EVENT, { detail: anchor }),
  );
}

export function writeStoredLivePersonAnchor(anchor: Vec3): Vec3 {
  const cleanAnchor = validAnchor(anchor) ?? anchor;
  globalThis.localStorage?.setItem(HC600_01_LIVE_PERSON_ANCHOR_STORAGE_KEY, JSON.stringify(cleanAnchor));
  broadcastLivePersonAnchorPreview(cleanAnchor);
  return cleanAnchor;
}

export function clearStoredLivePersonAnchor(): void {
  globalThis.localStorage?.removeItem(HC600_01_LIVE_PERSON_ANCHOR_STORAGE_KEY);
  broadcastLivePersonAnchorPreview(null);
}

export function machineIdForCamera(cameraEntityId: string): string | null {
  if (HC600_01_CAMERAS.some((camera) => camera.id === cameraEntityId)) return PLATFORM_CAMERA_MACHINE_ID;
  if (cameraEntityId.startsWith('fw-camera-')) return PLATFORM_CAMERA_MACHINE_ID;
  return null;
}

export function livePersonAnchorForCamera(cameraEntityId: string, override?: Vec3 | null): Vec3 | null {
  const machineId = machineIdForCamera(cameraEntityId);
  if (!machineId) return null;
  if (override && machineId === PLATFORM_CAMERA_MACHINE_ID) return override;
  const machine = buildMockEntities()[machineId];
  if (!machine || machine.type !== 'machine') return null;
  return {
    x: machine.position.x + LIVE_PERSON_MACHINE_OFFSET_X_M,
    y: 0.05,
    z: machine.position.z + LIVE_PERSON_MACHINE_OFFSET_Z_M,
  };
}
