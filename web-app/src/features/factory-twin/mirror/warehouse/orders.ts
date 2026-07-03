import { createRng, pickWeighted } from './random';
import type { WarehouseSku } from './skus';

export type OrderScenario = 'normal' | 'peak' | 'custom';

export interface WarehouseOrderLine {
  skuId: string;
  qty: number;
}

export interface WarehouseOrder {
  id: string;
  lines: WarehouseOrderLine[];
}

export interface OrderScenarioConfig {
  scenario: OrderScenario;
  seed: number;
  customOrderCount?: number;
}

function scenarioSize(scenario: OrderScenario, customOrderCount?: number): { orders: number; minLines: number; maxLines: number; multiplier: number } {
  if (scenario === 'peak') return { orders: 460, minLines: 3, maxLines: 8, multiplier: 1.55 };
  if (scenario === 'custom') return { orders: customOrderCount ?? 260, minLines: 2, maxLines: 7, multiplier: 1.2 };
  return { orders: 180, minLines: 1, maxLines: 5, multiplier: 1 };
}

export function generateOrders(skus: WarehouseSku[], config: OrderScenarioConfig): WarehouseOrder[] {
  const rng = createRng(`orders-${config.seed}-${config.scenario}`);
  const size = scenarioSize(config.scenario, config.customOrderCount);
  const orders: WarehouseOrder[] = [];

  for (let orderIndex = 0; orderIndex < size.orders; orderIndex += 1) {
    const lineCount = size.minLines + Math.floor(rng() * (size.maxLines - size.minLines + 1));
    const seen = new Set<string>();
    const lines: WarehouseOrderLine[] = [];
    for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
      let sku = pickWeighted(skus, (item) => item.demandWeight * size.multiplier, rng);
      let guard = 0;
      while (seen.has(sku.id) && guard < 8) {
        sku = pickWeighted(skus, (item) => item.demandWeight * size.multiplier, rng);
        guard += 1;
      }
      seen.add(sku.id);
      lines.push({ skuId: sku.id, qty: 1 + Math.floor(rng() * (sku.turnover === 'high' ? 5 : 3)) });
    }
    orders.push({ id: `ORD-${config.scenario}-${orderIndex.toString().padStart(4, '0')}`, lines });
  }

  return orders;
}
