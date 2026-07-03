import type { CameraEntity } from './entities';

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
  return machineId === 'm-hc600' ? HC600_01_CAMERAS : [];
}
