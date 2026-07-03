// ============================================================================
//  ENTITY SCHEMA  —  the spatial digital-twin data model
//  Every entity carries `source: 'sim' | 'live'`. This is the seam that lets us
//  ship a fully simulated demo today and swap in real data later WITHOUT touching
//  the UI: the simulation engine only mutates `source: 'sim'` entities, and a real
//  data feed simply flips `source` to 'live' and pushes updates to the same store.
// ============================================================================

export type EntityType = 'person' | 'machine' | 'camera' | 'zone' | 'amr' | 'drone';
export type DataSource = 'sim' | 'live';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface BaseEntity {
  id: string;
  type: EntityType;
  name: string;
  position: Vec3; // world coordinates, matching the GLB scene
  status: string;
  source: DataSource; // 'sim' | 'live'  <- the swap seam
  meshRef?: string; // glTF node name to bind to (P1+: click on real geometry)
  aliases?: string[]; // names users may say in chat, e.g. HC600-03 or 3 號成型機
  subsystemId?: string; // which subsystem governs this entity
  attrs?: Record<string, unknown>;
}

export interface PersonEntity extends BaseEntity {
  type: 'person';
  role: string;
  station?: string;
  lineUserId?: string; // mock LINE id (real LINE Messaging API wired later)
}

export type MachineStatus = 'running' | 'idle' | 'alarm' | 'maintenance';
export interface MachineEntity extends BaseEntity {
  type: 'machine';
  status: MachineStatus;
  model: string;
  oee: number; // %
  temperature: number; // °C
  cycleTimeSec: number;
  todayCount: number;
  alarms: number;
}

// Mirrors Fourth Wall `CameraDevice`: cameras are JPEG snapshot pollers, not live streams.
// feedMode 'snapshot' polls GET {VITE_API_BASE_URL}/v1/cameras/{id}/latest-frame/image.
export interface CameraEntity extends BaseEntity {
  type: 'camera';
  status: 'active' | 'inactive';
  siteLabel: string; // e.g. 靚程工廠
  online: boolean;
  samplingIntervalSeconds: number; // refresh cadence (Fourth Wall default 10s)
  feedMode: 'mock' | 'snapshot';
}

export interface InventoryItem {
  sku: string;
  name: string;
  qty: number;
  turnover: 'high' | 'mid' | 'low';
}
export interface ZoneEntity extends BaseEntity {
  type: 'zone';
  capacity: number;
  used: number;
  skuCount: number;
  inventory: InventoryItem[];
}

export interface AmrEntity extends BaseEntity {
  type: 'amr';
  battery: number; // %
  task: string | null;
  route?: Vec3[];
}

export interface DroneEntity extends BaseEntity {
  type: 'drone';
  battery: number; // %
  flying: boolean;
  waypoints: Vec3[];
}

export type Entity =
  | PersonEntity
  | MachineEntity
  | CameraEntity
  | ZoneEntity
  | AmrEntity
  | DroneEntity;

export const ENTITY_LABEL: Record<EntityType, string> = {
  person: '人員',
  machine: '機台',
  camera: '監視器',
  zone: '倉儲區',
  amr: 'AMR',
  drone: '無人機',
};

export const STATUS_LABEL: Record<string, string> = {
  running: '運轉中',
  idle: '待機',
  alarm: '告警',
  maintenance: '保養中',
  'on-duty': '在崗',
  active: '在線',
  inactive: '離線',
  moving: '移動中',
  standby: '待命',
  normal: '正常',
};

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}
