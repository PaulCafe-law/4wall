import { createRng } from './random';

export type TurnoverClass = 'high' | 'mid' | 'low';

export interface WarehouseSku {
  id: string;
  name: string;
  familyId: string;
  turnover: TurnoverClass;
  demandWeight: number;
  volume: number;
  source: 'sim' | 'live';
}

const PART_NAMES = ['濾芯', '煞車片', '油封組', '保險桿支架', '皮帶', '感測器', '螺絲包', '水箱蓋', '後視鏡座'];

export function generateSkus(count = 12480, seed = 42): WarehouseSku[] {
  const rng = createRng(`sku-${seed}`);
  const skus: WarehouseSku[] = [];

  for (let i = 0; i < count; i += 1) {
    const p = rng();
    const turnover: TurnoverClass = p < 0.06 ? 'high' : p < 0.32 ? 'mid' : 'low';
    const demandBase = turnover === 'high' ? 260 : turnover === 'mid' ? 11 : 0.8;
    const variance = 0.55 + rng() * 0.9;
    const volume = Number((0.2 + rng() * (turnover === 'high' ? 1.1 : 2.8)).toFixed(2));
    skus.push({
      id: `SKU-${(100000 + i).toString()}`,
      name: `${PART_NAMES[i % PART_NAMES.length]} ${String.fromCharCode(65 + (i % 26))}-${(i % 97).toString().padStart(2, '0')}`,
      familyId: String.fromCharCode(65 + (i % 26)),
      turnover,
      demandWeight: demandBase * variance,
      volume,
      source: 'sim',
    });
  }

  return skus;
}
