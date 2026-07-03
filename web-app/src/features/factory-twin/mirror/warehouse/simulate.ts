import { createWarehouseLayout, type WarehouseLayout } from './layout';
import { buildMetrics, type WarehouseMetrics } from './metrics';
import { generateOrders, type OrderScenario, type WarehouseOrder } from './orders';
import { routeOrders, type AgvRoute, type RouteOptimizer } from './routing';
import { generateSkus, type WarehouseSku } from './skus';
import { assignSkusToSlots, type SlottingStrategy } from './slotting';

export interface WarehouseSimulationOptions {
  scenario: OrderScenario;
  strategy: SlottingStrategy;
  agvCount: number;
  seed: number;
  skuCount?: number;
  routeOptimizer?: RouteOptimizer;
}

export interface WarehouseSimulationResult {
  options: Required<WarehouseSimulationOptions>;
  layout: WarehouseLayout;
  skus: WarehouseSku[];
  orders: WarehouseOrder[];
  metrics: WarehouseMetrics;
  cellPickCounts: Record<string, number>;
  maxCellPicks: number;
  routes: AgvRoute[];
  runtimeMs: number;
}

export function runWarehouseSimulation(options: WarehouseSimulationOptions): WarehouseSimulationResult {
  const started = performance.now();
  const fullOptions: Required<WarehouseSimulationOptions> = {
    skuCount: options.skuCount ?? 12480,
    scenario: options.scenario,
    strategy: options.strategy,
    agvCount: options.agvCount,
    seed: options.seed,
    routeOptimizer: options.routeOptimizer ?? 'nn-2opt',
  };
  const layout = createWarehouseLayout();
  const skus = generateSkus(fullOptions.skuCount, fullOptions.seed);
  const slotting = assignSkusToSlots(skus, layout, fullOptions.strategy, fullOptions.seed);
  const orders = generateOrders(skus, { scenario: fullOptions.scenario, seed: fullOptions.seed });
  const routing = routeOrders(layout, orders, slotting, fullOptions.agvCount, fullOptions.routeOptimizer);
  const cellPickCounts = Object.fromEntries(routing.cellPickCounts);
  const maxCellPicks = Math.max(1, ...Object.values(cellPickCounts));

  return {
    options: fullOptions,
    layout,
    skus,
    orders,
    metrics: buildMetrics(layout, routing, skus.length),
    cellPickCounts,
    maxCellPicks,
    routes: routing.routes,
    runtimeMs: performance.now() - started,
  };
}
