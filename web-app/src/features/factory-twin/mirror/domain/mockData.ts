// Seed data for the factory twin. Demo-only entities are source: 'sim'.
// Positions are in scene world units (x: left-right, z: depth, y: up).
import type { Entity } from './entities';

export function buildMockEntities(): Record<string, Entity> {
  const list: Entity[] = [
    // ---- machines (aligned to the real factory.glb nodes) ----
    {
      id: 'm-hc600', type: 'machine', name: 'HC600-01 成型機', position: { x: 0, y: 0, z: -3 },
      source: 'live', subsystemId: 'sub-defect', status: 'unknown', model: 'HC600',
      aliases: ['HC600', 'HC600-01', 'HC600.001', '塑膠成型機HC600.001', '1號成型機', '一號成型機'],
      attrs: { liveMetricsOnly: true },
      oee: 0, temperature: 0, cycleTimeSec: 0, todayCount: 0, alarms: 0,
    },
    {
      id: 'm-hc600-002', type: 'machine', name: 'HC600-02 成型機', position: { x: -7, y: 0, z: -3 },
      source: 'sim', subsystemId: 'sub-defect', status: 'idle', model: 'HC600',
      aliases: ['HC600-02', 'HC600.002', '塑膠成型機HC600.002', '2號成型機', '二號成型機'],
      oee: 71, temperature: 62, cycleTimeSec: 35, todayCount: 288, alarms: 0,
    },
    {
      id: 'm-hc600-003', type: 'machine', name: 'HC600-03 成型機', position: { x: 7, y: 0, z: -3 },
      source: 'sim', subsystemId: 'sub-defect', status: 'running', model: 'HC600',
      aliases: ['HC600-03', 'HC600.003', '塑膠成型機HC600.003', '3號成型機', '三號成型機'],
      oee: 89, temperature: 76, cycleTimeSec: 31, todayCount: 390, alarms: 0,
    },
    {
      id: 'm-hc600-004', type: 'machine', name: 'HC600-04 成型機', position: { x: -13, y: 0, z: -3 },
      source: 'sim', subsystemId: 'sub-defect', status: 'running', model: 'HC600',
      aliases: ['HC600-04', 'HC600.004', '塑膠成型機HC600.004', '4號成型機', '四號成型機'],
      oee: 80, temperature: 73, cycleTimeSec: 33, todayCount: 530, alarms: 0,
    },
    {
      id: 'm-hc600-005', type: 'machine', name: 'HC600-05 成型機', position: { x: 13, y: 0, z: -3 },
      source: 'sim', subsystemId: 'sub-defect', status: 'maintenance', model: 'HC600',
      aliases: ['HC600-05', 'HC600.005', '塑膠成型機HC600.005', '5號成型機', '五號成型機'],
      oee: 64, temperature: 58, cycleTimeSec: 34, todayCount: 318, alarms: 2,
    },
    {
      id: 'm-hc600-006', type: 'machine', name: 'HC600-06 成型機', position: { x: -17, y: 0, z: 0 },
      source: 'sim', subsystemId: 'sub-defect', status: 'running', model: 'HC600',
      aliases: ['HC600-06', 'HC600.006', '塑膠成型機HC600.006', '6號成型機', '六號成型機'],
      oee: 83, temperature: 75, cycleTimeSec: 32, todayCount: 366, alarms: 0,
    },
    {
      id: 'm-hc600-007', type: 'machine', name: 'HC600-07 成型機', position: { x: 17, y: 0, z: 0 },
      source: 'sim', subsystemId: 'sub-defect', status: 'idle', model: 'HC600',
      aliases: ['HC600-07', 'HC600.007', '塑膠成型機HC600.007', '7號成型機', '七號成型機'],
      oee: 69, temperature: 61, cycleTimeSec: 36, todayCount: 241, alarms: 0,
    },
    // ---- people ----
    {
      id: 'p-xiaoming', type: 'person', name: '小明', position: { x: -1.5, y: 0, z: 1 },
      source: 'sim', subsystemId: 'sub-pos', status: 'on-duty', role: '成型操作員',
      station: 'HC600', lineUserId: 'U-xiaoming',
    },
    {
      id: 'p-ahua', type: 'person', name: '阿華', position: { x: 8, y: 0, z: 2 },
      source: 'sim', subsystemId: 'sub-pos', status: 'on-duty', role: '成型技師', station: 'HC600-03', lineUserId: 'U-ahua',
    },
    {
      id: 'p-meiling', type: 'person', name: '美玲', position: { x: -10, y: 0, z: 3 },
      source: 'sim', subsystemId: 'sub-pos', status: 'on-duty', role: '品保工程師', lineUserId: 'U-meiling',
    },
    {
      id: 'p-zhiqiang', type: 'person', name: '志強', position: { x: 12, y: 0, z: 0 },
      source: 'sim', subsystemId: 'sub-pos', status: 'on-duty', role: '維修技師', lineUserId: 'U-zhiqiang',
    },
    {
      id: 'p-lin', type: 'person', name: '林班長', position: { x: -5, y: 0, z: 6 },
      source: 'sim', subsystemId: 'sub-pos', status: 'on-duty', role: '生產班長', lineUserId: 'U-lin',
    },

    // ---- warehouse zone ----
    {
      id: 'zone-a', type: 'zone', name: '倉儲 A 區', position: { x: 14, y: 0, z: 6 },
      source: 'sim', status: 'normal', capacity: 1200, used: 842, skuCount: 36,
      inventory: [
        { sku: 'PN-1001', name: '保險桿支架', qty: 120, turnover: 'high' },
        { sku: 'PN-2087', name: '油封組', qty: 64, turnover: 'mid' },
        { sku: 'PN-3312', name: '煞車片', qty: 240, turnover: 'high' },
        { sku: 'PN-4590', name: '濾芯', qty: 18, turnover: 'low' },
      ],
    },

    // ---- AMR ----
    {
      id: 'amr-01', type: 'amr', name: 'AMR-01', position: { x: -8, y: 0, z: 8 },
      source: 'sim', subsystemId: 'sub-pos', status: 'idle', battery: 82, task: null,
      route: [{ x: -8, y: 0, z: 8 }, { x: 0, y: 0, z: 4 }, { x: 8, y: 0, z: 8 }],
    },
    {
      id: 'amr-02', type: 'amr', name: 'AMR-02', position: { x: 4, y: 0, z: 8 },
      source: 'sim', subsystemId: 'sub-pos', status: 'moving', battery: 57,
      task: '搬運 PP-NAT → HC600-04',
      route: [{ x: 4, y: 0, z: 8 }, { x: 10, y: 0, z: 6 }, { x: 14, y: 0, z: 6 }],
    },

    // ---- drone ----
    {
      id: 'uav-01', type: 'drone', name: '巡檢無人機-01', position: { x: 0, y: 4, z: 9 },
      source: 'sim', status: 'standby', battery: 74, flying: false,
      waypoints: [{ x: -10, y: 4, z: 8 }, { x: 0, y: 5, z: 0 }, { x: 10, y: 4, z: 8 }],
    },
  ];

  const map: Record<string, Entity> = {};
  for (const e of list) map[e.id] = e;
  return map;
}

/**
 * Customer factory mode keeps the physical machine map but removes every
 * simulated person, vehicle, warehouse metric, and production value.
 */
export function buildLiveFactoryEntities(): Record<string, Entity> {
  const liveEntities: Record<string, Entity> = {};
  for (const entity of Object.values(buildMockEntities())) {
    if (entity.type !== 'machine') continue;
    liveEntities[entity.id] = {
      ...entity,
      source: 'live',
      status: 'unknown',
      oee: 0,
      temperature: 0,
      cycleTimeSec: 0,
      todayCount: 0,
      alarms: 0,
      attrs: { ...entity.attrs, liveMetricsOnly: true },
    };
  }
  return liveEntities;
}
