import { createWarehouseLayout, type StorageSlot, type WarehouseLayout } from './layout';
import { generateOrders, type WarehouseOrder } from './orders';
import { routeOrders, type AgvRoute, type RoutingResult } from './routing';
import { generateSkus, type WarehouseSku } from './skus';
import { assignSkusToSlots, type SlottingResult, type SlottingStrategy } from './slotting';

export type WarehousePlanObjective = 'minimum_moves' | 'shortest_distance' | 'maximum_throughput';

export interface WarehouseDecisionScenario {
  seed: number;
  skuCount: number;
  affectedFamilyId: string;
  familyDemandIncreasePercent: number;
  workstationId: string;
  workstationOutageMinutes: number;
  agvCount: number;
  maxRelocations: number;
  shiftMinutes: number;
}

export interface WarehouseRelocation {
  skuId: string;
  skuName: string;
  familyId: string;
  fromSlotId: string;
  toSlotId: string;
  logicalBins: number;
  reason: string;
}

export interface WarehouseDecisionKpis {
  completedOrders: number;
  lateOrders: number;
  serviceLevelPercent: number;
  totalAgvDistance: number;
  averageDistancePerOrder: number;
  throughputPerHour: number;
  averageQueueMinutes: number;
  completionMinutes: number;
  distanceReductionPercent: number;
  throughputGainPercent: number;
  queueReductionPercent: number;
}

interface WarehousePlanBase {
  id: string;
  objective: WarehousePlanObjective;
  label: string;
}

export interface WarehouseReadyPlan extends WarehousePlanBase {
  status: 'ready';
  strategy: SlottingStrategy;
  relocationCount: number;
  relocations: WarehouseRelocation[];
  kpis: WarehouseDecisionKpis;
  routes: AgvRoute[];
  cellPickCounts: Record<string, number>;
  maxCellPicks: number;
  assumptions: string[];
  warnings: string[];
  equivalentTo?: string;
}

export interface WarehouseInfeasiblePlan extends WarehousePlanBase {
  status: 'infeasible';
  reason: string;
}

export type WarehouseDecisionPlan = WarehouseReadyPlan | WarehouseInfeasiblePlan;

export interface WarehouseDecisionPlanSet {
  id: string;
  summaryHash: string;
  generatedAtLabel: string;
  source: 'simulation';
  disclaimer: string;
  scenario: WarehouseDecisionScenario;
  layout: WarehouseLayout;
  orderCount: number;
  baseline: WarehouseDecisionKpis;
  plans: WarehouseDecisionPlan[];
  recommendedPlanId: string | null;
}

export interface WarehouseAssistantSummary {
  source: 'simulation';
  status: 'ready';
  disclaimer: string;
  planSetId: string;
  summaryHash: string;
  scenario: {
    demandChange: string;
    outage: string;
    agvCount: number;
    maxRelocations: number;
    shiftMinutes: number;
  };
  recommendedPlanId: string | null;
  selectedPlanId: string | null;
  plans: WarehouseAssistantPlanSummary[];
  assumptions: string[];
}

export interface WarehouseAssistantPlanSummary {
  id: string;
  label: string;
  status: 'ready' | 'infeasible';
  relocationCount?: number;
  completedOrders?: number;
  lateOrders?: number;
  serviceLevelPercent?: number;
  totalAgvDistance?: number;
  distanceReductionPercent?: number;
  throughputPerHour?: number;
  throughputGainPercent?: number;
  averageQueueMinutes?: number;
  reason?: string;
}

export const DEFAULT_WAREHOUSE_DECISION_SCENARIO: WarehouseDecisionScenario = {
  seed: 42,
  skuCount: 12_480,
  affectedFamilyId: 'A',
  familyDemandIncreasePercent: 40,
  workstationId: 'WS-03',
  workstationOutageMinutes: 120,
  agvCount: 4,
  maxRelocations: 80,
  shiftMinutes: 480,
};

const OBJECTIVE_LABELS: Record<WarehousePlanObjective, string> = {
  minimum_moves: '最少搬遷',
  shortest_distance: '最短距離',
  maximum_throughput: '最大產能',
};

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(Number.isFinite(value) ? value : min)));
}

export function normalizeWarehouseDecisionScenario(
  scenario: WarehouseDecisionScenario,
): WarehouseDecisionScenario {
  return {
    seed: clampInteger(scenario.seed, 1, 999_999),
    skuCount: clampInteger(scenario.skuCount, 500, 15_360),
    affectedFamilyId: String(scenario.affectedFamilyId || 'A').trim().toUpperCase().slice(0, 2),
    familyDemandIncreasePercent: clampInteger(scenario.familyDemandIncreasePercent, 0, 300),
    workstationId: /^WS-0[1-3]$/.test(scenario.workstationId) ? scenario.workstationId : 'WS-03',
    workstationOutageMinutes: clampInteger(scenario.workstationOutageMinutes, 0, 480),
    agvCount: clampInteger(scenario.agvCount, 1, 12),
    maxRelocations: clampInteger(scenario.maxRelocations, 0, 300),
    shiftMinutes: clampInteger(scenario.shiftMinutes, 120, 720),
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function stableHash(value: unknown): string {
  const input = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function percentChange(current: number, baseline: number, lowerIsBetter: boolean): number {
  if (baseline <= 0) return 0;
  const raw = ((current - baseline) / baseline) * 100;
  return lowerIsBetter ? -raw : raw;
}

function kpisFromRouting(routing: RoutingResult, baseline?: RoutingResult): WarehouseDecisionKpis {
  return {
    completedOrders: routing.completedOrders,
    lateOrders: routing.lateOrders,
    serviceLevelPercent: routing.serviceLevelPercent,
    totalAgvDistance: routing.totalDistance,
    averageDistancePerOrder: routing.averageDistancePerOrder,
    throughputPerHour: routing.picksPerHour,
    averageQueueMinutes: routing.averageQueueMinutes,
    completionMinutes: routing.completionMinutes,
    distanceReductionPercent: baseline ? percentChange(routing.totalDistance, baseline.totalDistance, true) : 0,
    throughputGainPercent: baseline ? percentChange(routing.picksPerHour, baseline.picksPerHour, false) : 0,
    queueReductionPercent: baseline
      ? percentChange(routing.averageQueueMinutes, baseline.averageQueueMinutes, true)
      : 0,
  };
}

function countOrderDemand(orders: WarehouseOrder[]): Map<string, number> {
  const demand = new Map<string, number>();
  for (const order of orders) {
    for (const line of order.lines) demand.set(line.skuId, (demand.get(line.skuId) ?? 0) + line.qty);
  }
  return demand;
}

interface RelocationCandidate {
  sku: WarehouseSku;
  from: StorageSlot;
  to: StorageSlot;
  score: number;
}

function rankRelocations(
  skus: WarehouseSku[],
  orders: WarehouseOrder[],
  baseline: SlottingResult,
  target: SlottingResult,
  scenario: WarehouseDecisionScenario,
  objective: WarehousePlanObjective,
): RelocationCandidate[] {
  const orderDemand = countOrderDemand(orders);
  return skus
    .flatMap((sku): RelocationCandidate[] => {
      const from = baseline.skuToSlot.get(sku.id);
      const to = target.skuToSlot.get(sku.id);
      if (!from || !to || from.id === to.id) return [];
      const distanceGain = from.distanceToDock - to.distanceToDock;
      const demand = orderDemand.get(sku.id) ?? 0;
      const affectedFamilyBoost = sku.familyId === scenario.affectedFamilyId ? 2.4 : 1;
      const objectiveBoost = objective === 'maximum_throughput' ? affectedFamilyBoost : 1;
      const score = Math.max(0.05, distanceGain + 0.5) * (1 + demand) * objectiveBoost;
      return [{ sku, from, to, score }];
    })
    .sort((left, right) => right.score - left.score || left.sku.id.localeCompare(right.sku.id));
}

function buildBlendedSlotting(
  skus: WarehouseSku[],
  baseline: SlottingResult,
  candidates: RelocationCandidate[],
  budget: number,
  strategy: SlottingStrategy,
  logicalBinsPerSlot: number,
  affectedFamilyId: string,
): { slotting: SlottingResult; relocations: WarehouseRelocation[] } {
  const slotLoads = new Map(baseline.slotSkuCount);
  const selected: RelocationCandidate[] = [];
  for (const candidate of candidates) {
    if (selected.length >= Math.max(0, budget)) break;
    const targetLoad = slotLoads.get(candidate.to.id) ?? 0;
    if (targetLoad >= logicalBinsPerSlot) continue;
    slotLoads.set(candidate.from.id, Math.max(0, (slotLoads.get(candidate.from.id) ?? 1) - 1));
    slotLoads.set(candidate.to.id, targetLoad + 1);
    selected.push(candidate);
  }
  const movedBySku = new Map(selected.map((candidate) => [candidate.sku.id, candidate]));
  const skuToSlot = new Map<string, StorageSlot>();
  const slotSkuCount = new Map<string, number>();
  const cellSkuCount = new Map<string, number>();

  for (const sku of skus) {
    const slot = movedBySku.get(sku.id)?.to ?? baseline.skuToSlot.get(sku.id);
    if (!slot) continue;
    skuToSlot.set(sku.id, slot);
    slotSkuCount.set(slot.id, (slotSkuCount.get(slot.id) ?? 0) + 1);
    cellSkuCount.set(slot.cellId, (cellSkuCount.get(slot.cellId) ?? 0) + 1);
  }

  const relocations = selected.map(({ sku, from, to }) => ({
    skuId: sku.id,
    skuName: sku.name,
    familyId: sku.familyId,
    fromSlotId: from.id,
    toSlotId: to.id,
    logicalBins: 1,
    reason:
      sku.familyId === affectedFamilyId
        ? `${sku.familyId} 系列需求上升，移近主要揀貨動線`
        : '依周轉率與訂單關聯縮短揀貨距離',
  }));

  return { slotting: { strategy, skuToSlot, slotSkuCount, cellSkuCount }, relocations };
}

function routeForScenario(
  layout: WarehouseLayout,
  orders: WarehouseOrder[],
  slotting: SlottingResult,
  scenario: WarehouseDecisionScenario,
): RoutingResult {
  return routeOrders(layout, orders, slotting, scenario.agvCount, 'nn-2opt', {
    planningHorizonMinutes: scenario.shiftMinutes,
    workstationOutages:
      scenario.workstationOutageMinutes > 0
        ? [
            {
              workstationId: scenario.workstationId,
              startMinute: 0,
              durationMinutes: scenario.workstationOutageMinutes,
            },
          ]
        : [],
  });
}

function buildReadyPlan(
  objective: WarehousePlanObjective,
  strategy: SlottingStrategy,
  relocationBudget: number,
  skus: WarehouseSku[],
  orders: WarehouseOrder[],
  layout: WarehouseLayout,
  baselineSlotting: SlottingResult,
  targetSlotting: SlottingResult,
  baselineRouting: RoutingResult,
  scenario: WarehouseDecisionScenario,
): WarehouseDecisionPlan {
  const candidates = rankRelocations(skus, orders, baselineSlotting, targetSlotting, scenario, objective);
  const { slotting, relocations } = buildBlendedSlotting(
    skus,
    baselineSlotting,
    candidates,
    Math.min(relocationBudget, scenario.maxRelocations),
    strategy,
    layout.logicalBinsPerSlot,
    scenario.affectedFamilyId,
  );
  const routing = routeForScenario(layout, orders, slotting, scenario);
  const minimumCompletedOrders = Math.floor(baselineRouting.completedOrders * 0.95);
  const id = `warehouse-${objective}-${stableHash({ scenario, relocationIds: relocations.map((item) => item.skuId) })}`;

  if (routing.completedOrders < minimumCompletedOrders) {
    return {
      id,
      objective,
      label: OBJECTIVE_LABELS[objective],
      status: 'infeasible',
      reason: `此方案在 ${scenario.shiftMinutes} 分鐘內只能完成 ${routing.completedOrders} 單，低於服務底線 ${minimumCompletedOrders} 單。`,
    };
  }

  const kpis = kpisFromRouting(routing, baselineRouting);
  const cellPickCounts = Object.fromEntries(routing.cellPickCounts);
  return {
    id,
    objective,
    label: OBJECTIVE_LABELS[objective],
    status: 'ready',
    strategy,
    relocationCount: relocations.length,
    relocations,
    kpis,
    routes: routing.routes,
    cellPickCounts,
    maxCellPicks: Math.max(1, ...Object.values(cellPickCounts)),
    assumptions: [
      `${scenario.shiftMinutes} 分鐘單班模擬`,
      `${scenario.agvCount} 台 AMR，速度與裝卸時間固定`,
      `${scenario.workstationId} 於班次開始停機 ${scenario.workstationOutageMinutes} 分鐘`,
      `最多搬遷 ${scenario.maxRelocations} 個 SKU`,
    ],
    warnings: [
      '結果是模擬提案，需經主管確認後才能轉成現場任務',
      '尚未串接正式 WMS、WCS 與現場安全聯鎖',
    ],
  };
}

function chooseRecommendedPlan(plans: WarehouseDecisionPlan[]): string | null {
  const ready = plans.filter((plan): plan is WarehouseReadyPlan => plan.status === 'ready');
  if (!ready.length) return null;
  return [...ready].sort((left, right) => {
    const leftScore = left.kpis.serviceLevelPercent * 8 + left.kpis.throughputGainPercent * 2 - left.relocationCount * 0.03;
    const rightScore = right.kpis.serviceLevelPercent * 8 + right.kpis.throughputGainPercent * 2 - right.relocationCount * 0.03;
    return rightScore - leftScore || left.id.localeCompare(right.id);
  })[0].id;
}

function markEquivalentPlans(plans: WarehouseDecisionPlan[]): void {
  const ready = plans.filter((plan): plan is WarehouseReadyPlan => plan.status === 'ready');
  for (let index = 0; index < ready.length; index += 1) {
    for (let previous = 0; previous < index; previous += 1) {
      const left = ready[index];
      const right = ready[previous];
      if (
        left.relocationCount === right.relocationCount &&
        Math.abs(left.kpis.totalAgvDistance - right.kpis.totalAgvDistance) < 0.001 &&
        Math.abs(left.kpis.throughputPerHour - right.kpis.throughputPerHour) < 0.001
      ) {
        left.equivalentTo = right.id;
        break;
      }
    }
  }
}

function retargetPlan(
  source: WarehouseDecisionPlan,
  objective: WarehousePlanObjective,
): WarehouseDecisionPlan {
  const id = `warehouse-${objective}-${stableHash({ sourcePlanId: source.id, objective })}`;
  if (source.status === 'infeasible') {
    return { ...source, id, objective, label: OBJECTIVE_LABELS[objective] };
  }
  return {
    ...source,
    id,
    objective,
    label: OBJECTIVE_LABELS[objective],
    equivalentTo: undefined,
  };
}

function chooseObjectiveCandidate(
  candidates: WarehouseDecisionPlan[],
  objective: WarehousePlanObjective,
  compare: (left: WarehouseReadyPlan, right: WarehouseReadyPlan) => number,
): WarehouseDecisionPlan {
  const ready = candidates
    .filter((plan): plan is WarehouseReadyPlan => plan.status === 'ready')
    .sort((left, right) => compare(left, right) || left.id.localeCompare(right.id));
  return retargetPlan(ready[0] ?? candidates[0], objective);
}

export function buildWarehouseDecisionPlanSet(
  input: WarehouseDecisionScenario = DEFAULT_WAREHOUSE_DECISION_SCENARIO,
): WarehouseDecisionPlanSet {
  const scenario = normalizeWarehouseDecisionScenario(input);
  const layout = createWarehouseLayout();
  const skus = generateSkus(scenario.skuCount, scenario.seed);
  const orders = generateOrders(skus, {
    scenario: 'peak',
    seed: scenario.seed,
    planningHorizonMinutes: scenario.shiftMinutes,
    demandAdjustments: {
      [scenario.affectedFamilyId]: 1 + scenario.familyDemandIncreasePercent / 100,
    },
  });
  const baselineSlotting = assignSkusToSlots(skus, layout, 'random', scenario.seed + 101);
  const velocitySlotting = assignSkusToSlots(skus, layout, 'velocity', scenario.seed);
  const abcSlotting = assignSkusToSlots(skus, layout, 'abc', scenario.seed);
  const baselineRouting = routeForScenario(layout, orders, baselineSlotting, scenario);

  const candidates = [
    buildReadyPlan(
      'minimum_moves',
      'velocity',
      Math.min(18, scenario.maxRelocations),
      skus,
      orders,
      layout,
      baselineSlotting,
      velocitySlotting,
      baselineRouting,
      scenario,
    ),
    buildReadyPlan(
      'shortest_distance',
      'velocity',
      scenario.maxRelocations,
      skus,
      orders,
      layout,
      baselineSlotting,
      velocitySlotting,
      baselineRouting,
      scenario,
    ),
    buildReadyPlan(
      'shortest_distance',
      'abc',
      scenario.maxRelocations,
      skus,
      orders,
      layout,
      baselineSlotting,
      abcSlotting,
      baselineRouting,
      scenario,
    ),
    buildReadyPlan(
      'maximum_throughput',
      'velocity',
      scenario.maxRelocations,
      skus,
      orders,
      layout,
      baselineSlotting,
      velocitySlotting,
      baselineRouting,
      scenario,
    ),
    buildReadyPlan(
      'maximum_throughput',
      'abc',
      scenario.maxRelocations,
      skus,
      orders,
      layout,
      baselineSlotting,
      abcSlotting,
      baselineRouting,
      scenario,
    ),
  ];
  const plans = [
    chooseObjectiveCandidate(
      candidates,
      'minimum_moves',
      (left, right) =>
        left.relocationCount - right.relocationCount ||
        left.kpis.totalAgvDistance - right.kpis.totalAgvDistance,
    ),
    chooseObjectiveCandidate(
      candidates,
      'shortest_distance',
      (left, right) =>
        left.kpis.totalAgvDistance - right.kpis.totalAgvDistance ||
        left.kpis.averageQueueMinutes - right.kpis.averageQueueMinutes ||
        left.relocationCount - right.relocationCount,
    ),
    chooseObjectiveCandidate(
      candidates,
      'maximum_throughput',
      (left, right) =>
        right.kpis.completedOrders - left.kpis.completedOrders ||
        left.kpis.lateOrders - right.kpis.lateOrders ||
        right.kpis.throughputPerHour - left.kpis.throughputPerHour ||
        left.relocationCount - right.relocationCount,
    ),
  ];
  markEquivalentPlans(plans);

  const id = `warehouse-plan-set-${stableHash(scenario)}`;
  const planSetWithoutHash = {
    id,
    generatedAtLabel: `固定種子 ${scenario.seed}`,
    source: 'simulation' as const,
    disclaimer: '模擬提案，不可直接執行',
    scenario,
    layout,
    orderCount: orders.length,
    baseline: kpisFromRouting(baselineRouting),
    plans,
    recommendedPlanId: chooseRecommendedPlan(plans),
  };
  const summaryHash = stableHash({
    id,
    scenario,
    plans: plans.map((plan) =>
      plan.status === 'ready'
        ? { id: plan.id, relocationCount: plan.relocationCount, kpis: plan.kpis }
        : { id: plan.id, reason: plan.reason },
    ),
  });
  return { ...planSetWithoutHash, summaryHash };
}

export function buildWarehouseAssistantSummary(
  planSet: WarehouseDecisionPlanSet,
  selectedPlanId: string | null = planSet.recommendedPlanId,
): WarehouseAssistantSummary {
  return {
    source: 'simulation',
    status: 'ready',
    disclaimer: planSet.disclaimer,
    planSetId: planSet.id,
    summaryHash: planSet.summaryHash,
    scenario: {
      demandChange: `${planSet.scenario.affectedFamilyId} 系列需求 +${planSet.scenario.familyDemandIncreasePercent}%`,
      outage: `${planSet.scenario.workstationId} 停機 ${planSet.scenario.workstationOutageMinutes} 分鐘`,
      agvCount: planSet.scenario.agvCount,
      maxRelocations: planSet.scenario.maxRelocations,
      shiftMinutes: planSet.scenario.shiftMinutes,
    },
    recommendedPlanId: planSet.recommendedPlanId,
    selectedPlanId,
    plans: planSet.plans.map((plan) =>
      plan.status === 'ready'
        ? {
            id: plan.id,
            label: plan.label,
            status: plan.status,
            relocationCount: plan.relocationCount,
            completedOrders: plan.kpis.completedOrders,
            lateOrders: plan.kpis.lateOrders,
            serviceLevelPercent: Number(plan.kpis.serviceLevelPercent.toFixed(1)),
            totalAgvDistance: Number(plan.kpis.totalAgvDistance.toFixed(1)),
            distanceReductionPercent: Number(plan.kpis.distanceReductionPercent.toFixed(1)),
            throughputPerHour: Number(plan.kpis.throughputPerHour.toFixed(1)),
            throughputGainPercent: Number(plan.kpis.throughputGainPercent.toFixed(1)),
            averageQueueMinutes: Number(plan.kpis.averageQueueMinutes.toFixed(1)),
          }
        : { id: plan.id, label: plan.label, status: plan.status, reason: plan.reason },
    ),
    assumptions: [
      '所有結果來自 4WALL 展示工廠的合成資料',
      '3D 畫面負責呈現，KPI 由固定種子的離散事件模擬計算',
      '提案沒有直接控制真實 AMR 或寫入 WMS/WCS',
    ],
  };
}

export function readyWarehousePlans(planSet: WarehouseDecisionPlanSet | null): WarehouseReadyPlan[] {
  return planSet?.plans.filter((plan): plan is WarehouseReadyPlan => plan.status === 'ready') ?? [];
}
