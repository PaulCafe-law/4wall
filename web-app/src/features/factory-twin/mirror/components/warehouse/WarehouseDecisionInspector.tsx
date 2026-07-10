import { readyWarehousePlans } from '../../warehouse/decision';
import { useWarehouseDemoStore } from '../../store/warehouseDemoStore';

function number(value: number, digits = 0): string {
  return value.toLocaleString('zh-TW', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function distanceDelta(value: number): string {
  return `較基準 ${value >= 0 ? '-' : '+'}${number(Math.abs(value), 1)}%`;
}

function throughputDelta(value: number): string {
  return `較基準 ${value >= 0 ? '+' : '-'}${number(Math.abs(value), 1)}%`;
}

export function WarehouseDecisionInspector() {
  const planSet = useWarehouseDemoStore((state) => state.planSet);
  const selectedPlanId = useWarehouseDemoStore((state) => state.selectedPlanId);
  const selectPlan = useWarehouseDemoStore((state) => state.selectPlan);
  const plans = readyWarehousePlans(planSet);
  const selected = plans.find((plan) => plan.id === selectedPlanId) ?? plans[0];

  if (!planSet || !selected) {
    return <div className="warehouse-inspector-loading">正在建立倉儲提案…</div>;
  }

  return (
    <div className="warehouse-inspector">
      <header>
        <span>WAREHOUSE DECISION TWIN</span>
        <h2>{selected.label}</h2>
        <p>{planSet.disclaimer}</p>
      </header>

      <nav aria-label="選擇倉儲提案">
        {plans.map((plan, index) => (
          <button key={plan.id} className={plan.id === selected.id ? 'active' : ''} type="button" onClick={() => selectPlan(plan.id)}>
            <span>0{index + 1}</span>
            <strong>{plan.label}</strong>
          </button>
        ))}
      </nav>

      <section className="warehouse-inspector-kpis" aria-label="提案指標">
        <div>
          <span>完成訂單</span>
          <strong>{number(selected.kpis.completedOrders)}</strong>
          <small>逾期 {number(selected.kpis.lateOrders)} 單</small>
        </div>
        <div>
          <span>服務水準</span>
          <strong>{number(selected.kpis.serviceLevelPercent, 1)}%</strong>
          <small>單班 {planSet.scenario.shiftMinutes} 分鐘</small>
        </div>
        <div>
          <span>AMR 距離</span>
          <strong>{number(selected.kpis.totalAgvDistance, 0)} m</strong>
          <small>{distanceDelta(selected.kpis.distanceReductionPercent)}</small>
        </div>
        <div>
          <span>揀貨吞吐</span>
          <strong>{number(selected.kpis.throughputPerHour, 0)}/hr</strong>
          <small>{throughputDelta(selected.kpis.throughputGainPercent)}</small>
        </div>
        <div>
          <span>平均排隊</span>
          <strong>{number(selected.kpis.averageQueueMinutes, 1)} 分</strong>
          <small>WS-03 停機 {planSet.scenario.workstationOutageMinutes} 分</small>
        </div>
        <div>
          <span>搬遷規模</span>
          <strong>{selected.relocationCount} SKU</strong>
          <small>上限 {planSet.scenario.maxRelocations}</small>
        </div>
      </section>

      <section className="warehouse-relocation-list">
        <div className="warehouse-inspector-section-head">
          <h3>優先搬遷清單</h3>
          <span>{selected.relocationCount} 筆</span>
        </div>
        <ol>
          {selected.relocations.slice(0, 14).map((item) => (
            <li key={item.skuId}>
              <div>
                <strong>{item.skuName}</strong>
                <span>{item.skuId} · {item.logicalBins} 格</span>
              </div>
              <p>{item.fromSlotId} → {item.toSlotId}</p>
            </li>
          ))}
        </ol>
      </section>

      <footer>
        <strong>假設</strong>
        <p>{selected.assumptions.join('；')}。</p>
        <span>提案編號 {planSet.id} · 摘要 {planSet.summaryHash}</span>
      </footer>
    </div>
  );
}
