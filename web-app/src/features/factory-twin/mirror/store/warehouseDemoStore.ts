import { create } from 'zustand';
import {
  buildWarehouseDecisionPlanSet,
  DEFAULT_WAREHOUSE_DECISION_SCENARIO,
  normalizeWarehouseDecisionScenario,
  type WarehouseDecisionPlanSet,
  type WarehouseDecisionScenario,
} from '../warehouse/decision';

export type DemoFacilitySpace = 'factory' | 'warehouse';
export type DemoFacilityTransition = 'to_warehouse' | 'to_factory' | null;

interface WarehouseDemoState {
  enabled: boolean;
  space: DemoFacilitySpace;
  transition: DemoFacilityTransition;
  scenario: WarehouseDecisionScenario;
  planSet: WarehouseDecisionPlanSet | null;
  selectedPlanId: string | null;
  initialize: () => void;
  disable: () => void;
  beginTransition: (target: DemoFacilitySpace) => void;
  completeTransition: () => void;
  updateScenario: (patch: Partial<WarehouseDecisionScenario>) => void;
  runScenario: () => void;
  selectPlan: (planId: string) => void;
}

const INITIAL_SCENARIO = { ...DEFAULT_WAREHOUSE_DECISION_SCENARIO };

export const useWarehouseDemoStore = create<WarehouseDemoState>((set, get) => ({
  enabled: false,
  space: 'factory',
  transition: null,
  scenario: INITIAL_SCENARIO,
  planSet: null,
  selectedPlanId: null,
  initialize: () => {
    if (get().enabled) return;
    const planSet = buildWarehouseDecisionPlanSet(get().scenario);
    set({
      enabled: true,
      space: 'factory',
      transition: null,
      planSet,
      selectedPlanId: planSet.recommendedPlanId,
    });
  },
  disable: () =>
    set({
      enabled: false,
      space: 'factory',
      transition: null,
      scenario: { ...INITIAL_SCENARIO },
      planSet: null,
      selectedPlanId: null,
    }),
  beginTransition: (target) => {
    if (!get().enabled || target === get().space) return;
    set({ transition: target === 'warehouse' ? 'to_warehouse' : 'to_factory' });
  },
  completeTransition: () => {
    const transition = get().transition;
    if (!transition) return;
    set({ space: transition === 'to_warehouse' ? 'warehouse' : 'factory', transition: null });
  },
  updateScenario: (patch) => set((state) => ({ scenario: { ...state.scenario, ...patch } })),
  runScenario: () => {
    if (!get().enabled) return;
    const scenario = normalizeWarehouseDecisionScenario(get().scenario);
    const planSet = buildWarehouseDecisionPlanSet(scenario);
    set({ scenario, planSet, selectedPlanId: planSet.recommendedPlanId });
  },
  selectPlan: (planId) => {
    const exists = get().planSet?.plans.some((plan) => plan.id === planId && plan.status === 'ready');
    if (exists) set({ selectedPlanId: planId });
  },
}));
