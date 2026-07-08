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

// 攝影機偵測到人但沒有有效地板投影時,把 live 人員放在「機台前方作業走道」——
// 和模擬操作員(z 正向、站在機台前)同一排,看起來就是自然站在機台旁的人,
// 而不是卡在機台側邊/後方的一個抽象點。
export const LIVE_PERSON_MACHINE_OFFSET_X_M = 0.8;
export const LIVE_PERSON_MACHINE_OFFSET_Z_M = 2.4;

export function machineIdForCamera(cameraEntityId: string): string | null {
  if (HC600_01_CAMERAS.some((camera) => camera.id === cameraEntityId)) return PLATFORM_CAMERA_MACHINE_ID;
  if (cameraEntityId.startsWith('fw-camera-')) return PLATFORM_CAMERA_MACHINE_ID;
  return null;
}

export function livePersonAnchorForCamera(cameraEntityId: string): Vec3 | null {
  const machineId = machineIdForCamera(cameraEntityId);
  if (!machineId) return null;
  const machine = buildMockEntities()[machineId];
  if (!machine || machine.type !== 'machine') return null;
  return {
    x: machine.position.x + LIVE_PERSON_MACHINE_OFFSET_X_M,
    y: 0.05,
    z: machine.position.z + LIVE_PERSON_MACHINE_OFFSET_Z_M,
  };
}
