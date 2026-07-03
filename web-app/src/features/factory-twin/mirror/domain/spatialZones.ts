// Functional AREAS of the real factory (not mesh-bound objects). Positions are in the
// real GLB world frame (building ≈ x[-9.8,9.8] × z[-23,23], floor y≈0). attrs.fixedWorld
// keeps FitToGlb from remapping them; attrs.sizeX/sizeZ size the floor footprint marker.
//
// These coordinates are BEST-GUESS — use the GLB debug "座標探針" (click the floor) to read
// exact world X/Z and adjust here, or tell Claude to move a zone.
import type { ZoneEntity } from './entities';

export const SPATIAL_ZONES: ZoneEntity[] = [
  {
    id: 'zone-a',
    type: 'zone',
    name: '塑膠粒倉儲 A',
    // pinned via coord probe: corners (1.6,-19.87)(1.57,-22.81)(9.64,-23.31)(9.64,-19.87)
    position: { x: 5.6, y: 0.05, z: -21.6 },
    source: 'sim',
    status: 'normal',
    capacity: 1200,
    used: 842,
    skuCount: 12,
    inventory: [
      { sku: 'PP-NAT', name: 'PP 原料粒（沙包）', qty: 320, turnover: 'high' },
      { sku: 'ABS-BLK', name: 'ABS 黑色粒', qty: 180, turnover: 'mid' },
      { sku: 'PC-CLR', name: 'PC 透明粒', qty: 96, turnover: 'low' },
    ],
    attrs: { fixedWorld: true, sizeX: 8.1, sizeZ: 3.4, color: '#d9a441', desc: '裝塑膠粒的沙包堆放區' },
  },
  {
    id: 'zone-dock',
    type: 'zone',
    name: '卸貨 / 送貨區',
    // pinned via coord probe: corners (0.42,4.91)(2.61,7.91)
    position: { x: 1.5, y: 0.05, z: 6.4 },
    source: 'sim',
    status: 'normal',
    capacity: 0,
    used: 0,
    skuCount: 0,
    inventory: [],
    attrs: { fixedWorld: true, sizeX: 2.2, sizeZ: 3.0, color: '#c0492f', desc: '卡車停靠卸貨與成品送貨區' },
  },
  {
    id: 'zone-mold',
    type: 'zone',
    name: '模具倉庫',
    // pinned via coord probe: corners (-1.98,-13.13)(1.8,-17.35)
    position: { x: -0.1, y: 0.05, z: -15.2 },
    source: 'sim',
    status: 'normal',
    capacity: 200,
    used: 128,
    skuCount: 48,
    inventory: [
      { sku: 'MOLD-HC600', name: 'HC600 模具', qty: 6, turnover: 'high' },
      { sku: 'MOLD-HC600-02', name: 'HC600-02 模具', qty: 4, turnover: 'mid' },
    ],
    attrs: { fixedWorld: true, sizeX: 3.8, sizeZ: 4.2, color: '#6e7b3d', desc: '密閉牆面空間，存放射出成型模具' },
  },
  {
    id: 'zone-stage',
    type: 'zone',
    name: '鍍膜件待運區',
    // pinned via coord probe: corners (-2.2,4.78)(0.38,-11.98)
    position: { x: -0.9, y: 0.05, z: -3.6 },
    source: 'sim',
    status: 'normal',
    capacity: 600,
    used: 410,
    skuCount: 24,
    inventory: [
      { sku: 'PT-A01', name: '鍍膜外殼 A（待送）', qty: 240, turnover: 'high' },
      { sku: 'PT-B02', name: '鍍膜面板 B（待送）', qty: 170, turnover: 'mid' },
    ],
    attrs: { fixedWorld: true, sizeX: 2.6, sizeZ: 16.8, color: '#e6dcc6', desc: '長廊區，鍍膜完成的塑射件包待送貨' },
  },
];
