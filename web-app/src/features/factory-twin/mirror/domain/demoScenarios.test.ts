import { describe, expect, it } from 'vitest';

import { buildDemoScenarioEntities, buildDemoSimulationContext } from './demoScenarios';

describe('accelerator demo scenarios', () => {
  it('never replaces HC600-01 live-only metrics with simulated values', () => {
    const entities = buildDemoScenarioEntities('plan_gap');
    const machine = entities['m-hc600'];

    expect(machine).toMatchObject({ source: 'live', status: 'unknown', todayCount: 0 });
    expect(machine.attrs).toMatchObject({ liveMetricsOnly: true });
  });

  it('creates deterministic machine alarm and AMR delay scenarios', () => {
    const alarm = buildDemoScenarioEntities('machine_alarm');
    const amrDelay = buildDemoScenarioEntities('amr_delay');

    expect(alarm['m-hc600-003']).toMatchObject({ status: 'alarm', temperature: 98, todayCount: 331 });
    expect(amrDelay['amr-02']).toMatchObject({ status: 'idle', battery: 28 });
    expect(amrDelay['m-hc600-004']).toMatchObject({ status: 'idle', todayCount: 470 });
  });

  it('builds a simulated daily reconciliation from the selected scenario', () => {
    const entities = buildDemoScenarioEntities('plan_gap');
    const context = buildDemoSimulationContext('plan_gap', entities);

    expect(context).toMatchObject({
      mode: 'simulation',
      scenarioId: 'plan_gap',
      scenarioLabel: '計畫落後',
      totals: { plan: 2460, actual: 1704, delta: -756, attainmentRate: 69.3 },
    });
    expect(context.planVsActual).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ machineId: 'm-hc600-003', plan: 470, actual: 345, status: 'behind' }),
      ]),
    );
  });
});
