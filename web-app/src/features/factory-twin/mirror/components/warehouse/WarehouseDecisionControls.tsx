import { useEffect, useRef, useState } from 'react';
import { readyWarehousePlans } from '../../warehouse/decision';
import { useWarehouseDemoStore } from '../../store/warehouseDemoStore';

export function WarehouseDecisionControls() {
  const scenario = useWarehouseDemoStore((state) => state.scenario);
  const planSet = useWarehouseDemoStore((state) => state.planSet);
  const selectedPlanId = useWarehouseDemoStore((state) => state.selectedPlanId);
  const updateScenario = useWarehouseDemoStore((state) => state.updateScenario);
  const runScenario = useWarehouseDemoStore((state) => state.runScenario);
  const selectPlan = useWarehouseDemoStore((state) => state.selectPlan);
  const beginTransition = useWarehouseDemoStore((state) => state.beginTransition);
  const [busy, setBusy] = useState(false);
  const runTimerRef = useRef<number | null>(null);
  const plans = readyWarehousePlans(planSet);

  useEffect(() => () => {
    if (runTimerRef.current !== null) window.clearTimeout(runTimerRef.current);
  }, []);

  const generate = () => {
    setBusy(true);
    runTimerRef.current = window.setTimeout(() => {
      runScenario();
      setBusy(false);
      runTimerRef.current = null;
    }, 20);
  };

  return (
    <section className="warehouse-decision-console" aria-label="倉儲決策模擬控制">
      <div className="warehouse-decision-head">
        <div>
          <span>倉儲情境</span>
          <strong>{planSet ? `${planSet.orderCount} 筆模擬訂單 · ${planSet.generatedAtLabel}` : '建立模擬中'}</strong>
        </div>
        <div className="warehouse-decision-head-actions">
          <button type="button" className="warehouse-back" onClick={() => beginTransition('factory')}>
            ← 成型工廠
          </button>
          <span className="warehouse-proposal-badge">模擬提案</span>
        </div>
      </div>

      <div className="warehouse-scenario-fields">
        <label>
          <span>A 系列需求</span>
          <div><b>+</b><input aria-label="A 系列需求增幅" type="number" min={0} max={300} value={scenario.familyDemandIncreasePercent} onChange={(event) => updateScenario({ familyDemandIncreasePercent: Number(event.target.value) || 0 })} /><b>%</b></div>
        </label>
        <label>
          <span>WS-03 停機</span>
          <div><input aria-label="WS-03 停機分鐘" type="number" min={0} max={480} value={scenario.workstationOutageMinutes} onChange={(event) => updateScenario({ workstationOutageMinutes: Number(event.target.value) || 0 })} /><b>分</b></div>
        </label>
        <label>
          <span>AMR</span>
          <div><input aria-label="AMR 數量" type="number" min={1} max={12} value={scenario.agvCount} onChange={(event) => updateScenario({ agvCount: Number(event.target.value) || 1 })} /><b>台</b></div>
        </label>
        <label>
          <span>搬遷上限</span>
          <div><input aria-label="搬遷上限" type="number" min={0} max={300} value={scenario.maxRelocations} onChange={(event) => updateScenario({ maxRelocations: Number(event.target.value) || 0 })} /><b>SKU</b></div>
        </label>
        <button className="warehouse-generate" type="button" onClick={generate} disabled={busy}>
          {busy ? '計算中…' : '產生三套提案'}
        </button>
      </div>

      <div className="warehouse-plan-tabs" role="tablist" aria-label="倉儲提案">
        {plans.map((plan) => (
          <button
            type="button"
            role="tab"
            aria-selected={plan.id === selectedPlanId}
            className={plan.id === selectedPlanId ? 'active' : ''}
            key={plan.id}
            onClick={() => selectPlan(plan.id)}
          >
            <span>{plan.label}</span>
            <strong>{plan.relocationCount} 搬遷 · 距離 {plan.kpis.distanceReductionPercent >= 0 ? '-' : '+'}{Math.abs(plan.kpis.distanceReductionPercent).toFixed(1)}%</strong>
          </button>
        ))}
      </div>
    </section>
  );
}
