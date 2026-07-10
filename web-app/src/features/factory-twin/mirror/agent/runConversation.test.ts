import { beforeEach, describe, expect, it } from 'vitest';

import { buildDemoScenarioEntities } from '../domain/demoScenarios';
import { useFactoryStore } from '../store/factoryStore';
import { useWarehouseDemoStore } from '../store/warehouseDemoStore';
import { runConversation } from './runConversation';

describe('local accelerator demo assistant', () => {
  beforeEach(() => {
    useFactoryStore.setState(useFactoryStore.getInitialState(), true);
    useWarehouseDemoStore.getState().disable();
  });

  it('answers warehouse proposal questions only from the internal simulation', async () => {
    useWarehouseDemoStore.getState().initialize();

    await runConversation('哪個提案搬遷最少？', {
      labelSimulation: true,
      demoScenarioId: 'normal',
      warehousePresentation: true,
    });

    const reply = useFactoryStore.getState().messages.at(-1)?.text ?? '';
    expect(reply).toContain('模擬情境：已切換為「最少搬遷」提案');
    expect(reply).toContain('需搬遷 18 個 SKU');
  });

  it('answers simulated reconciliation with an explicit simulation label', async () => {
    useFactoryStore.getState().setEntities(buildDemoScenarioEntities('plan_gap'));

    await runConversation('今天模擬計畫與實際差多少', {
      labelSimulation: true,
      demoScenarioId: 'plan_gap',
    });

    expect(useFactoryStore.getState().messages.at(-1)?.text).toBe(
      '模擬情境：今日模擬計畫 2460 件，實際 1704 件，差異 -756 件，達成率 69.3%。',
    );
  });

  it('answers from simulated AMRs instead of reporting Jingcheng live availability', async () => {
    useFactoryStore.getState().setEntities(buildDemoScenarioEntities('amr_delay'));

    await runConversation('目前模擬 AMR 情況', {
      labelSimulation: true,
      demoScenarioId: 'amr_delay',
    });

    const reply = useFactoryStore.getState().messages.at(-1)?.text ?? '';
    expect(reply).toContain('模擬情境：AMR-01');
    expect(reply).toContain('AMR-02 待機、電量 28%');
    expect(reply).not.toContain('沒有接入真實 AMR');
  });
});
