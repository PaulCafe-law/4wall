import type { StorageSlot, WarehouseLayout } from './layout';
import { shuffle } from './random';
import type { WarehouseSku } from './skus';

export type SlottingStrategy = 'velocity' | 'random' | 'abc';

export interface SlottingResult {
  strategy: SlottingStrategy;
  skuToSlot: Map<string, StorageSlot>;
  slotSkuCount: Map<string, number>;
  cellSkuCount: Map<string, number>;
}

function scoreSlot(slot: StorageSlot): number {
  return slot.distanceToDock * 2.4 + slot.distanceToMainAisle * 1.2 + slot.level * 0.06;
}

function scoreSkuForVelocity(sku: WarehouseSku): number {
  const turnoverBoost = sku.turnover === 'high' ? 100000 : sku.turnover === 'mid' ? 30000 : 0;
  return turnoverBoost + sku.demandWeight * 100 - sku.volume;
}

export function assignSkusToSlots(
  skus: WarehouseSku[],
  layout: WarehouseLayout,
  strategy: SlottingStrategy,
  seed = 42,
): SlottingResult {
  const slots =
    strategy === 'random'
      ? shuffle(layout.slots, () => {
          const x = Math.sin(seed++) * 10000;
          return x - Math.floor(x);
        })
      : [...layout.slots].sort((a, b) => scoreSlot(a) - scoreSlot(b));

  const orderedSkus =
    strategy === 'random'
      ? shuffle(skus, () => {
          const x = Math.sin(seed++ * 1.37) * 10000;
          return x - Math.floor(x);
        })
      : strategy === 'abc'
        ? [...skus].sort((a, b) => b.demandWeight / Math.max(b.volume, 0.1) - a.demandWeight / Math.max(a.volume, 0.1))
        : [...skus].sort((a, b) => scoreSkuForVelocity(b) - scoreSkuForVelocity(a));

  const skuToSlot = new Map<string, StorageSlot>();
  const slotSkuCount = new Map<string, number>();
  const cellSkuCount = new Map<string, number>();

  orderedSkus.forEach((sku, index) => {
    const slot = slots[index % slots.length];
    skuToSlot.set(sku.id, slot);
    slotSkuCount.set(slot.id, (slotSkuCount.get(slot.id) ?? 0) + 1);
    cellSkuCount.set(slot.cellId, (cellSkuCount.get(slot.cellId) ?? 0) + 1);
  });

  return { strategy, skuToSlot, slotSkuCount, cellSkuCount };
}
