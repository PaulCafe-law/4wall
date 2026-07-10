import { beforeEach, describe, expect, it } from 'vitest';
import { createWarehouseLayout } from './layout';
import { generateOrders } from './orders';
import { generateSkus } from './skus';
import {
  buildWarehouseAssistantSummary,
  buildWarehouseDecisionPlanSet,
  DEFAULT_WAREHOUSE_DECISION_SCENARIO,
  readyWarehousePlans,
} from './decision';
import { useWarehouseDemoStore } from '../store/warehouseDemoStore';

describe('warehouse decision demo', () => {
  beforeEach(() => {
    useWarehouseDemoStore.getState().disable();
  });

  it('models 15,360 logical bins in a 12 by 8 by 4 visible warehouse', () => {
    const layout = createWarehouseLayout();
    expect(layout.columns).toBe(12);
    expect(layout.rows).toBe(8);
    expect(layout.levels).toBe(4);
    expect(layout.workstations).toHaveLength(3);
    expect(layout.slotCount).toBe(384);
    expect(layout.logicalBinCount).toBe(15_360);
  });

  it('produces deterministic plan ids, metrics and compact assistant summaries', () => {
    const first = buildWarehouseDecisionPlanSet(DEFAULT_WAREHOUSE_DECISION_SCENARIO);
    const second = buildWarehouseDecisionPlanSet(DEFAULT_WAREHOUSE_DECISION_SCENARIO);

    expect(second.id).toBe(first.id);
    expect(second.summaryHash).toBe(first.summaryHash);
    expect(second.plans).toEqual(first.plans);
    const plans = readyWarehousePlans(first);
    expect(plans).toHaveLength(3);
    const minimum = plans.find((plan) => plan.objective === 'minimum_moves')!;
    const shortest = plans.find((plan) => plan.objective === 'shortest_distance')!;
    const throughput = plans.find((plan) => plan.objective === 'maximum_throughput')!;
    expect(minimum.relocationCount).toBeLessThanOrEqual(shortest.relocationCount);
    expect(minimum.relocationCount).toBeLessThanOrEqual(throughput.relocationCount);
    expect(shortest.kpis.totalAgvDistance).toBeLessThanOrEqual(minimum.kpis.totalAgvDistance);
    expect(shortest.kpis.totalAgvDistance).toBeLessThanOrEqual(throughput.kpis.totalAgvDistance);
    expect(throughput.kpis.completedOrders).toBeGreaterThanOrEqual(minimum.kpis.completedOrders);
    expect(throughput.kpis.completedOrders).toBeGreaterThanOrEqual(shortest.kpis.completedOrders);
    expect(plans.flatMap((plan) => plan.relocations).every((item) => item.logicalBins === 1)).toBe(true);
    expect(JSON.stringify(buildWarehouseAssistantSummary(first)).length).toBeLessThan(20_000);
  });

  it('applies the requested family demand multiplier to generated orders', () => {
    const skus = generateSkus(2_600, 42);
    const baseline = generateOrders(skus, { scenario: 'peak', seed: 42 });
    const increased = generateOrders(skus, {
      scenario: 'peak',
      seed: 42,
      demandAdjustments: { A: 2.5 },
    });
    const familyBySku = new Map(skus.map((sku) => [sku.id, sku.familyId]));
    const countA = (orders: typeof baseline) =>
      orders.flatMap((order) => order.lines).filter((line) => familyBySku.get(line.skuId) === 'A').length;

    expect(countA(increased)).toBeGreaterThan(countA(baseline));
  });

  it('does not build the large simulation until the internal demo initializes it', () => {
    expect(useWarehouseDemoStore.getState().planSet).toBeNull();
    expect(useWarehouseDemoStore.getState().enabled).toBe(false);

    useWarehouseDemoStore.getState().initialize();

    expect(useWarehouseDemoStore.getState().enabled).toBe(true);
    expect(useWarehouseDemoStore.getState().space).toBe('factory');
    expect(useWarehouseDemoStore.getState().planSet?.source).toBe('simulation');
  });
});
