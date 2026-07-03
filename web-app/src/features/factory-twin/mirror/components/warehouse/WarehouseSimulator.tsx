import { useMemo, useState } from 'react';
import type { WarehousePoint } from '../../warehouse/layout';
import { improvementPercent } from '../../warehouse/metrics';
import type { OrderScenario } from '../../warehouse/orders';
import type { AgvRoute, RouteOptimizer } from '../../warehouse/routing';
import { runWarehouseSimulation, type WarehouseSimulationResult } from '../../warehouse/simulate';
import type { SlottingStrategy } from '../../warehouse/slotting';

type RouteViewMode = 'single' | 'all';

const SCENARIOS: Array<{ id: OrderScenario; label: string }> = [
  { id: 'normal', label: '正常' },
  { id: 'peak', label: '尖峰爆量' },
  { id: 'custom', label: '自訂' },
];

const STRATEGIES: Array<{ id: SlottingStrategy; label: string }> = [
  { id: 'velocity', label: '周轉率分級' },
  { id: 'random', label: '隨機' },
  { id: 'abc', label: 'ABC' },
];

const OPTIMIZERS: Array<{ id: RouteOptimizer; label: string }> = [
  { id: 'nn-2opt', label: 'NN + 2-opt' },
  { id: 'nn', label: 'NN' },
];

const ROUTE_COLORS = ['#d9a441', '#3d6e70', '#b0432c', '#6e7b3d', '#1a1a18', '#a87c1c', '#2b5052', '#7d7869'];

function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString('zh-TW', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function scenarioLabel(scenario: OrderScenario): string {
  return SCENARIOS.find((item) => item.id === scenario)?.label ?? scenario;
}

function heatColor(ratio: number): string {
  if (ratio >= 0.78) return '#b0432c';
  if (ratio >= 0.58) return '#d9a441';
  if (ratio >= 0.36) return '#c7bea3';
  if (ratio >= 0.18) return '#d8cfb6';
  return '#3d6e70';
}

function pointsAttr(points: WarehousePoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

function routeColor(index: number): string {
  return ROUTE_COLORS[index % ROUTE_COLORS.length];
}

function KpiCard({ label, value, suffix, tone }: { label: string; value: string; suffix?: string; tone?: 'hot' | 'good' }) {
  return (
    <div className={`warehouse-kpi ${tone ?? ''}`}>
      <span>{label}</span>
      <strong>
        {value}
        {suffix ? <em>{suffix}</em> : null}
      </strong>
    </div>
  );
}

function RouteToolbar({
  result,
  selectedAgvId,
  setSelectedAgvId,
  routeMode,
  setRouteMode,
}: {
  result: WarehouseSimulationResult;
  selectedAgvId: string;
  setSelectedAgvId: (id: string) => void;
  routeMode: RouteViewMode;
  setRouteMode: (mode: RouteViewMode) => void;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', margin: '8px 0' }}>
      <div className="warehouse-segment" aria-label="路徑顯示模式">
        <button className={routeMode === 'single' ? 'active' : ''} onClick={() => setRouteMode('single')} type="button">
          單台
        </button>
        <button className={routeMode === 'all' ? 'active' : ''} onClick={() => setRouteMode('all')} type="button">
          全部
        </button>
      </div>
      <div className="warehouse-segment" aria-label="AGV 選擇" style={{ flexWrap: 'wrap' }}>
        {result.routes.map((route) => (
          <button
            key={route.agvId}
            className={routeMode === 'single' && selectedAgvId === route.agvId ? 'active teal' : ''}
            onClick={() => {
              setRouteMode('single');
              setSelectedAgvId(route.agvId);
            }}
            type="button"
            style={{ minWidth: 68 }}
          >
            {route.agvId}
          </button>
        ))}
      </div>
    </div>
  );
}

function RouteLegend({ routes }: { routes: AgvRoute[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', marginTop: 8, fontFamily: 'var(--font-display)', fontSize: 11 }}>
      {routes.map((route, index) => (
        <span key={route.agvId} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <i style={{ width: 18, height: 3, background: routeColor(index), display: 'inline-block' }} />
          {route.agvId}
        </span>
      ))}
    </div>
  );
}

function RouteSummary({ route, routeMode }: { route: AgvRoute; routeMode: RouteViewMode }) {
  return (
    <div className="warehouse-compare-line" style={{ paddingTop: 8 }}>
      <span>{routeMode === 'single' ? route.agvId : '全部 AGV'}</span>
      <strong>
        {routeMode === 'single'
          ? `${formatNumber(route.distance, 0)} m · ${route.orderIds.length} 單 · ${formatNumber(route.picks)} picks · ${route.waypoints.length} 點`
          : '每台 AGV 直接使用 routes.waypoints 繪製'}
      </strong>
    </div>
  );
}

function Heatmap({ result, optimizerGain }: { result: WarehouseSimulationResult; optimizerGain: number }) {
  const [routeMode, setRouteMode] = useState<RouteViewMode>('single');
  const [selectedAgvId, setSelectedAgvId] = useState('AGV-01');
  const selectedRoute = result.routes.find((route) => route.agvId === selectedAgvId) ?? result.routes[0];
  const visibleRoutes = routeMode === 'all' ? result.routes : selectedRoute ? [selectedRoute] : [];

  return (
    <section className="warehouse-panel warehouse-map-panel">
      <div className="warehouse-panel-head">
        <h2>料架揀貨熱力圖（俯視）</h2>
        <span>
          SKU {formatNumber(result.skus.length)} · 儲位 {formatNumber(result.layout.slotCount)}
        </span>
      </div>

      <RouteToolbar
        result={result}
        selectedAgvId={selectedRoute?.agvId ?? selectedAgvId}
        setSelectedAgvId={setSelectedAgvId}
        routeMode={routeMode}
        setRouteMode={setRouteMode}
      />

      <div className="warehouse-map-wrap">
        <div
          className="warehouse-heatmap"
          style={{ gridTemplateColumns: `repeat(${result.layout.columns}, 1fr)` }}
          aria-label="warehouse heatmap"
        >
          {result.layout.cells.map((cell) => {
            const picks = result.cellPickCounts[cell.id] ?? 0;
            const ratio = picks / result.maxCellPicks;
            return (
              <div
                key={cell.id}
                className="warehouse-cell"
                style={{ background: heatColor(ratio) }}
                title={`${cell.id}: ${picks} picks`}
              />
            );
          })}
        </div>
        <svg
          className="warehouse-route"
          viewBox={`0 0 ${result.layout.columns} ${result.layout.rows + 1.6}`}
          preserveAspectRatio="none"
          aria-label="AGV true route overlay"
        >
          {visibleRoutes.map((route, index) => {
            const routeIndex = result.routes.findIndex((item) => item.agvId === route.agvId);
            return (
              <polyline
                key={route.agvId}
                points={pointsAttr(route.waypoints)}
                fill="none"
                stroke={routeColor(routeIndex >= 0 ? routeIndex : index)}
                strokeWidth={routeMode === 'single' ? 0.1 : 0.07}
                strokeOpacity={routeMode === 'single' ? 0.96 : 0.42}
                strokeLinejoin="miter"
                strokeDasharray={routeMode === 'single' ? '0.3 0.18' : undefined}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
          <circle cx={result.layout.agvStart.x} cy={result.layout.agvStart.y} r="0.16" fill="#d9a441" stroke="#1a1a18" strokeWidth="0.05" />
          <circle cx={result.layout.dock.x} cy={result.layout.dock.y} r="0.16" fill="#3d6e70" stroke="#1a1a18" strokeWidth="0.05" />
        </svg>
        <span className="warehouse-map-tag agv">AGV 起點</span>
        <span className="warehouse-map-tag dock">出貨口</span>
      </div>

      {selectedRoute ? <RouteSummary route={selectedRoute} routeMode={routeMode} /> : null}
      <RouteLegend routes={result.routes} />
      <div className="warehouse-legend">
        <span>低周轉</span>
        <i className="low" />
        <i className="cold" />
        <i className="warm" />
        <i className="hot" />
        <span>熱銷（靠道靠出口）</span>
        {result.options.routeOptimizer === 'nn-2opt' ? <span>2-opt 再降 {formatNumber(Math.max(0, optimizerGain), 1)}%</span> : null}
      </div>
    </section>
  );
}

function ComparisonPanel({
  current,
  random,
  velocity,
  normalReference,
  optimizerGain,
}: {
  current: WarehouseSimulationResult;
  random: WarehouseSimulationResult;
  velocity: WarehouseSimulationResult;
  normalReference: WarehouseSimulationResult;
  optimizerGain: number;
}) {
  const agvDistanceGain = improvementPercent(velocity.metrics.totalAgvDistance, random.metrics.totalAgvDistance);
  const scenarioDistanceDelta =
    ((current.metrics.totalAgvDistance - normalReference.metrics.totalAgvDistance) /
      Math.max(1, normalReference.metrics.totalAgvDistance)) *
    100;
  const queueDelta = current.metrics.averageQueueMinutes - normalReference.metrics.averageQueueMinutes;

  return (
    <aside className="warehouse-side">
      <section className="warehouse-hero-metric">
        <span>周轉率分級 VS 隨機擺放</span>
        <strong>{agvDistanceGain >= 0 ? '-' : '+'}{Math.abs(Math.round(agvDistanceGain))}%</strong>
        <em>AGV 行駛距離</em>
      </section>

      <div className="warehouse-kpi-grid">
        <KpiCard label="AGV 平均距離" value={formatNumber(current.metrics.averageDistancePerOrder, 1)} suffix="m/單" />
        <KpiCard label="揀貨吞吐" value={formatNumber(current.metrics.throughputPerHour, 0)} suffix="/hr" tone="good" />
        <KpiCard label="工作站排隊" value={formatNumber(current.metrics.averageQueueMinutes, 1)} suffix="分" tone="hot" />
        <KpiCard label="料架使用率" value={formatNumber(current.metrics.storageUtilization, 0)} suffix="%" />
      </div>

      <section className="warehouse-panel compact">
        <h2>情境比較</h2>
        <div className="warehouse-compare-line">
          <span>正常</span>
          <strong>AGV {formatNumber(normalReference.metrics.averageDistancePerOrder, 1)} m · 完成 {formatNumber(normalReference.metrics.completionMinutes, 1)} 分</strong>
        </div>
        <div className="warehouse-compare-line bad">
          <span>{scenarioLabel(current.options.scenario)}</span>
          <strong>AGV {formatNumber(current.metrics.averageDistancePerOrder, 1)} m · 完成 {formatNumber(current.metrics.completionMinutes, 1)} 分</strong>
        </div>
        <div className="warehouse-compare-line good">
          <span>路由演算法</span>
          <strong>{current.options.routeOptimizer === 'nn-2opt' ? `NN + 2-opt（再降 ${formatNumber(Math.max(0, optimizerGain), 1)}%）` : 'Nearest neighbor'}</strong>
        </div>
        <p>
          {current.options.scenario === 'peak'
            ? `尖峰爆量讓總距離增加 ${formatNumber(Math.max(0, scenarioDistanceDelta), 0)}%，工作站排隊 +${formatNumber(Math.max(0, queueDelta), 1)} 分。`
            : `切到尖峰爆量可驗證熱區、排隊與 AGV 距離如何拖慢 ${scenarioLabel(current.options.scenario)} 情境。`}
        </p>
      </section>
    </aside>
  );
}

export function WarehouseSimulator() {
  const [scenario, setScenario] = useState<OrderScenario>('normal');
  const [strategy, setStrategy] = useState<SlottingStrategy>('velocity');
  const [routeOptimizer, setRouteOptimizer] = useState<RouteOptimizer>('nn-2opt');
  const [agvCount, setAgvCount] = useState(4);
  const [seedInput, setSeedInput] = useState('42');
  const [runConfig, setRunConfig] = useState({ scenario, strategy, routeOptimizer, agvCount, seed: 42 });

  const seed = Number(seedInput) || 42;
  const current = useMemo(() => runWarehouseSimulation(runConfig), [runConfig]);
  const random = useMemo(() => runWarehouseSimulation({ ...runConfig, strategy: 'random' }), [runConfig]);
  const velocity = useMemo(() => runWarehouseSimulation({ ...runConfig, strategy: 'velocity' }), [runConfig]);
  const normalReference = useMemo(() => runWarehouseSimulation({ ...runConfig, scenario: 'normal' }), [runConfig]);
  const nnReference = useMemo(() => runWarehouseSimulation({ ...runConfig, routeOptimizer: 'nn' }), [runConfig]);
  const optimizerGain = improvementPercent(current.metrics.totalAgvDistance, nnReference.metrics.totalAgvDistance);

  return (
    <main className="warehouse-mode">
      <section
        className="warehouse-controls"
        aria-label="倉儲模擬控制列"
        style={{ gridTemplateColumns: 'minmax(200px, 1fr) minmax(250px, 1.25fr) minmax(180px, 0.85fr) 74px 92px 132px' }}
      >
        <div className="warehouse-control-group">
          <span>情境</span>
          <div className="warehouse-segment">
            {SCENARIOS.map((item) => (
              <button key={item.id} className={scenario === item.id ? 'active' : ''} onClick={() => setScenario(item.id)} type="button">
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="warehouse-control-group">
          <span>擺放策略</span>
          <div className="warehouse-segment">
            {STRATEGIES.map((item) => (
              <button key={item.id} className={strategy === item.id ? 'active teal' : ''} onClick={() => setStrategy(item.id)} type="button">
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="warehouse-control-group">
          <span>路由</span>
          <div className="warehouse-segment">
            {OPTIMIZERS.map((item) => (
              <button
                key={item.id}
                className={routeOptimizer === item.id ? 'active' : ''}
                onClick={() => setRouteOptimizer(item.id)}
                type="button"
                style={{ minWidth: 88 }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <label className="warehouse-field">
          <span>AGV</span>
          <input value={agvCount} min={1} max={12} type="number" onChange={(event) => setAgvCount(Number(event.target.value) || 1)} />
        </label>
        <label className="warehouse-field">
          <span>Seed</span>
          <input value={seedInput} inputMode="numeric" onChange={(event) => setSeedInput(event.target.value)} />
        </label>
        <button
          className="warehouse-run"
          type="button"
          onClick={() =>
            setRunConfig({
              scenario,
              strategy,
              routeOptimizer,
              agvCount: Math.max(1, Math.min(12, agvCount)),
              seed,
            })
          }
        >
          執行模擬 ↗
        </button>
      </section>

      <section className="warehouse-content">
        <Heatmap result={current} optimizerGain={optimizerGain} />
        <ComparisonPanel
          current={current}
          random={random}
          velocity={velocity}
          normalReference={normalReference}
          optimizerGain={optimizerGain}
        />
      </section>

      <footer className="warehouse-footer">
        <span>資料來源：mock SKU / order / WMS generator；source: sim</span>
        <span>執行 {formatNumber(current.runtimeMs, 1)} ms · 訂單 {formatNumber(current.orders.length)} · AGV {current.options.agvCount}</span>
      </footer>
    </main>
  );
}
