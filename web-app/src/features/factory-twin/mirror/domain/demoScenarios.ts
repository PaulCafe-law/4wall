import type { AmrEntity, Entity, MachineEntity } from './entities';
import { buildMockEntities } from './mockData';

export type DemoScenarioId = 'normal' | 'machine_alarm' | 'amr_delay' | 'plan_gap';

export interface DemoScenarioDefinition {
  id: DemoScenarioId;
  label: string;
  shortLabel: string;
  summary: string;
  eventMessage: string;
  plans: Record<string, number>;
  machinePatches?: Record<string, Partial<MachineEntity>>;
  amrPatches?: Record<string, Partial<AmrEntity>>;
}

export interface DemoPlanVsActual {
  machineId: string;
  machineName: string;
  plan: number;
  actual: number;
  delta: number;
  status: 'on_track' | 'behind';
}

export interface DemoSimulationContext {
  mode: 'simulation';
  scenarioId: DemoScenarioId;
  scenarioLabel: string;
  summary: string;
  disclaimer: string;
  planVsActual: DemoPlanVsActual[];
  totals: {
    plan: number;
    actual: number;
    delta: number;
    attainmentRate: number;
  };
}

const BASE_PLANS = {
  'm-hc600-002': 320,
  'm-hc600-003': 430,
  'm-hc600-004': 560,
  'm-hc600-005': 340,
  'm-hc600-006': 400,
  'm-hc600-007': 280,
};

export const DEMO_SCENARIOS: DemoScenarioDefinition[] = [
  {
    id: 'normal',
    label: '正常生產',
    shortLabel: '正常',
    summary: '六台模擬機台整體接近今日計畫，AMR 依排程搬運原料。',
    eventMessage: '正常生產情境已載入：機台與 AMR 依今日排程運作。',
    plans: BASE_PLANS,
    machinePatches: {
      'm-hc600-002': { status: 'running', oee: 84, temperature: 71, todayCount: 305, alarms: 0 },
      'm-hc600-003': { status: 'running', oee: 89, temperature: 76, todayCount: 412, alarms: 0 },
      'm-hc600-004': { status: 'running', oee: 86, temperature: 74, todayCount: 548, alarms: 0 },
      'm-hc600-005': { status: 'maintenance', oee: 64, temperature: 58, todayCount: 318, alarms: 2 },
      'm-hc600-006': { status: 'running', oee: 83, temperature: 75, todayCount: 382, alarms: 0 },
      'm-hc600-007': { status: 'idle', oee: 69, temperature: 61, todayCount: 255, alarms: 0 },
    },
  },
  {
    id: 'machine_alarm',
    label: '機台異常',
    shortLabel: '機台異常',
    summary: 'HC600-03 溫度升高並進入告警，今日產量開始落後。',
    eventMessage: '機台異常情境已載入：HC600-03 溫度升高，等待維修人員處理。',
    plans: BASE_PLANS,
    machinePatches: {
      'm-hc600-003': { status: 'alarm', oee: 52, temperature: 98, todayCount: 331, alarms: 1 },
    },
  },
  {
    id: 'amr_delay',
    label: 'AMR 延遲',
    shortLabel: 'AMR 延遲',
    summary: 'AMR-02 電量偏低且原料配送延遲，HC600-04 有待料風險。',
    eventMessage: 'AMR 延遲情境已載入：AMR-02 等待充電，HC600-04 原料配送延後。',
    plans: BASE_PLANS,
    machinePatches: {
      'm-hc600-004': { status: 'idle', oee: 68, temperature: 66, todayCount: 470, alarms: 0 },
    },
    amrPatches: {
      'amr-02': { status: 'idle', battery: 28, task: '等待充電，PP-NAT 配送延遲' },
    },
  },
  {
    id: 'plan_gap',
    label: '計畫落後',
    shortLabel: '計畫落後',
    summary: '多台模擬機台低於今日計畫，需要調整生產優先順序。',
    eventMessage: '計畫落後情境已載入：模擬產線整體進度低於今日計畫。',
    plans: {
      'm-hc600-002': 340,
      'm-hc600-003': 470,
      'm-hc600-004': 560,
      'm-hc600-005': 360,
      'm-hc600-006': 430,
      'm-hc600-007': 300,
    },
    machinePatches: {
      'm-hc600-002': { status: 'idle', oee: 58, temperature: 62, todayCount: 214, alarms: 0 },
      'm-hc600-003': { status: 'running', oee: 73, temperature: 79, todayCount: 345, alarms: 0 },
      'm-hc600-004': { status: 'running', oee: 70, temperature: 76, todayCount: 421, alarms: 0 },
      'm-hc600-005': { status: 'maintenance', oee: 49, temperature: 58, todayCount: 226, alarms: 2 },
      'm-hc600-006': { status: 'running', oee: 69, temperature: 78, todayCount: 310, alarms: 0 },
      'm-hc600-007': { status: 'idle', oee: 55, temperature: 61, todayCount: 188, alarms: 0 },
    },
  },
];

export function getDemoScenario(id: DemoScenarioId): DemoScenarioDefinition {
  return DEMO_SCENARIOS.find((scenario) => scenario.id === id) ?? DEMO_SCENARIOS[0];
}

export function buildDemoScenarioEntities(id: DemoScenarioId): Record<string, Entity> {
  const entities = buildMockEntities();
  const scenario = getDemoScenario(id);
  for (const [entityId, patch] of Object.entries(scenario.machinePatches ?? {})) {
    const entity = entities[entityId];
    if (entity?.type === 'machine' && entity.source === 'sim') {
      entities[entityId] = { ...entity, ...patch } as MachineEntity;
    }
  }
  for (const [entityId, patch] of Object.entries(scenario.amrPatches ?? {})) {
    const entity = entities[entityId];
    if (entity?.type === 'amr' && entity.source === 'sim') {
      entities[entityId] = { ...entity, ...patch } as AmrEntity;
    }
  }
  return entities;
}

export function buildDemoSimulationContext(
  id: DemoScenarioId,
  entities: Record<string, Entity>,
): DemoSimulationContext {
  const scenario = getDemoScenario(id);
  const planVsActual: DemoPlanVsActual[] = Object.entries(scenario.plans).flatMap(([machineId, plan]) => {
    const entity = entities[machineId];
    if (entity?.type !== 'machine' || entity.source !== 'sim') return [];
    const actual = entity.todayCount;
    return [
      {
        machineId,
        machineName: entity.name,
        plan,
        actual,
        delta: actual - plan,
        status: actual >= plan * 0.9 ? 'on_track' : 'behind',
      },
    ];
  });
  const totalPlan = planVsActual.reduce((total, item) => total + item.plan, 0);
  const totalActual = planVsActual.reduce((total, item) => total + item.actual, 0);
  return {
    mode: 'simulation',
    scenarioId: scenario.id,
    scenarioLabel: scenario.label,
    summary: scenario.summary,
    disclaimer: '以下機台、人員、AMR、產量與對帳數字皆為模擬情境',
    planVsActual,
    totals: {
      plan: totalPlan,
      actual: totalActual,
      delta: totalActual - totalPlan,
      attainmentRate: totalPlan > 0 ? Math.round((totalActual / totalPlan) * 1000) / 10 : 0,
    },
  };
}
