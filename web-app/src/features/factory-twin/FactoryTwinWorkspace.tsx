import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { ChatPanel } from './mirror/components/ChatPanel';
import { AgentFeed } from './mirror/components/AgentFeed';
import { DebugPanel } from './mirror/components/DebugPanel';
import { DetailPanel } from './mirror/components/DetailPanel';
import { SimControlPanel } from './mirror/components/SimControlPanel';
import { WarehouseSimulator } from './mirror/components/warehouse/WarehouseSimulator';
import { WarehouseDecisionControls } from './mirror/components/warehouse/WarehouseDecisionControls';
import { WarehouseDecisionInspector } from './mirror/components/warehouse/WarehouseDecisionInspector';
import { buildLiveFactoryEntities, buildMockEntities } from './mirror/domain/mockData';
import {
  buildDemoScenarioEntities,
  getDemoScenario,
  type DemoScenarioId,
} from './mirror/domain/demoScenarios';
import { SPATIAL_ZONES } from './mirror/domain/spatialZones';
import { livePersonAnchorForCamera, readStoredLivePersonAnchor } from './mirror/domain/machineCameras';
import type { CameraEntity, PersonEntity } from './mirror/domain/entities';
import { useLocalAgent } from './mirror/hooks/useLocalAgent';
import {
  DEMO_TWIN_AGENT_SESSION_ID,
  useTwinAgentBridge,
  type TwinAgentLiveDataStatus,
} from './mirror/hooks/useTwinAgentBridge';
import { useSimEngine } from './mirror/sim/simEngine';
import { uid, useFactoryStore } from './mirror/store/factoryStore';
import { useWarehouseDemoStore } from './mirror/store/warehouseDemoStore';
import { FactoryScene } from './mirror/three/FactoryScene';
import { WorkOrderOverlay } from './mirror/three/WorkOrderOverlay';
import './mirror/styles.css';

type FactoryMode = 'factory' | 'warehouse';

const WarehouseDecisionScene = lazy(() => import('./mirror/three/WarehouseDecisionScene'));

class WarehouseSceneBoundary extends Component<
  { children: ReactNode; onReturn: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[WarehouseScene] Failed to render the demo warehouse.', error, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="warehouse-scene-failure" role="alert">
          <span>3D 智慧倉儲暫時無法載入</span>
          <strong>成型工廠仍可正常使用，模擬資料未被修改。</strong>
          <button type="button" onClick={this.props.onReturn}>← 返回成型工廠</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function FactoryDemo({
  liveOnly,
  liveDataStatus,
  demoPresentation,
  demoScenarioId,
  demoSessionId,
  onDemoScenarioChange,
}: {
  liveOnly: boolean;
  liveDataStatus?: TwinAgentLiveDataStatus;
  demoPresentation: boolean;
  demoScenarioId: DemoScenarioId;
  demoSessionId: string;
  onDemoScenarioChange: (scenarioId: DemoScenarioId) => void;
}) {
  const leftOpen = useFactoryStore((s) => s.leftOpen);
  const rightOpen = useFactoryStore((s) => s.rightOpen);
  const toggleLeft = useFactoryStore((s) => s.toggleLeft);
  const toggleRight = useFactoryStore((s) => s.toggleRight);
  const glbLoadState = useFactoryStore((s) => s.glbLoadState);
  const facilitySpace = useWarehouseDemoStore((s) => s.space);
  const warehouseEnabled = useWarehouseDemoStore((s) => s.enabled);
  const transition = useWarehouseDemoStore((s) => s.transition);
  const initializeWarehouse = useWarehouseDemoStore((s) => s.initialize);
  const disableWarehouse = useWarehouseDemoStore((s) => s.disable);
  const beginWarehouseTransition = useWarehouseDemoStore((s) => s.beginTransition);
  const completeWarehouseTransition = useWarehouseDemoStore((s) => s.completeTransition);
  const centerRef = useRef<HTMLElement>(null);
  const compactWarehouseLeftState = useRef<boolean | null>(null);
  const warehousePresentation = demoPresentation && facilitySpace === 'warehouse';

  const restoreCompactWarehousePanels = useCallback(() => {
    const previousLeftOpen = compactWarehouseLeftState.current;
    if (previousLeftOpen === null) return;
    const factoryState = useFactoryStore.getState();
    if (factoryState.leftOpen !== previousLeftOpen) factoryState.toggleLeft();
    compactWarehouseLeftState.current = null;
  }, []);

  const prepareCompactWarehousePanels = useCallback(() => {
    if (compactWarehouseLeftState.current !== null) return;
    if (window.innerWidth <= 1440) {
      const factoryState = useFactoryStore.getState();
      compactWarehouseLeftState.current = factoryState.leftOpen;
      if (factoryState.leftOpen) factoryState.toggleLeft();
    }
  }, []);

  const enterWarehouse = useCallback(() => {
    beginWarehouseTransition('warehouse');
  }, [beginWarehouseTransition]);

  const returnToFactory = useCallback(() => {
    restoreCompactWarehousePanels();
    beginWarehouseTransition('factory');
  }, [beginWarehouseTransition, restoreCompactWarehousePanels]);

  useSimEngine(!liveOnly);
  useLocalAgent(!liveOnly);
  useTwinAgentBridge(liveDataStatus, {
    sessionId: demoPresentation ? demoSessionId : undefined,
    snapshotScope: demoPresentation ? 'accelerator_demo' : liveOnly ? 'organization_live' : 'web_only',
    includeLiveEvidence: !demoPresentation,
    demoScenarioId: demoPresentation ? demoScenarioId : undefined,
  });

  useEffect(() => {
    if (demoPresentation) initializeWarehouse();
    else disableWarehouse();
    return () => {
      restoreCompactWarehousePanels();
      if (demoPresentation) disableWarehouse();
    };
  }, [demoPresentation, disableWarehouse, initializeWarehouse, restoreCompactWarehousePanels]);

  useEffect(() => {
    if (!transition) return;
    const timer = window.setTimeout(completeWarehouseTransition, 920);
    return () => window.clearTimeout(timer);
  }, [completeWarehouseTransition, transition]);

  useEffect(() => {
    if (transition === 'to_warehouse') prepareCompactWarehousePanels();
    if (transition === 'to_factory') restoreCompactWarehousePanels();
  }, [prepareCompactWarehousePanels, restoreCompactWarehousePanels, transition]);

  // 3D 內滾輪縮放只進 OrbitControls，不冒泡到頁面捲動。React onWheel 預設是 passive，
  // 擋不住頁面捲動，需在容器上掛非被動監聽並 preventDefault（標準 R3F 作法）。
  useEffect(() => {
    const el = centerRef.current;
    if (!el) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  const gridCols = `${leftOpen ? '340px' : ''} 1fr ${rightOpen ? '348px' : ''}`.trim();

  return (
    <div
      className="layout"
      style={{ gridTemplateColumns: gridCols }}
      data-facility-space={facilitySpace}
      data-warehouse-enabled={warehouseEnabled ? 'true' : 'false'}
    >
      {leftOpen ? (
        <aside className="col col-left">
          <ChatPanel
            liveOnly={liveOnly}
            demoPresentation={demoPresentation}
            demoScenarioId={demoScenarioId}
            sessionId={demoPresentation ? demoSessionId : undefined}
            warehousePresentation={warehousePresentation}
          />
        </aside>
      ) : null}
      <main className="col col-center" ref={centerRef}>
        {warehousePresentation ? (
          <WarehouseSceneBoundary onReturn={returnToFactory}>
            <Suspense fallback={<div className="warehouse-scene-loading">載入 3D 智慧倉儲…</div>}>
              <WarehouseDecisionScene />
            </Suspense>
          </WarehouseSceneBoundary>
        ) : (
          <FactoryScene
            showWarehousePortal={demoPresentation}
            onEnterWarehouse={demoPresentation ? enterWarehouse : undefined}
          />
        )}
        {demoPresentation && !warehousePresentation && glbLoadState === 'loading' ? (
          <button
            aria-label="立即進入智慧倉儲模擬區"
            className="warehouse-portal-label warehouse-portal-loading-entry"
            type="button"
            onClick={enterWarehouse}
          >
            <span>智慧倉儲模擬區</span>
            <strong>立即進入 →</strong>
          </button>
        ) : null}
        {!demoPresentation ? <WorkOrderOverlay /> : null}
        {warehousePresentation ? (
          <WarehouseDecisionControls />
        ) : !liveOnly ? (
          <SimControlPanel
            demoPresentation={demoPresentation}
            scenarioId={demoScenarioId}
            onScenarioChange={onDemoScenarioChange}
          />
        ) : null}
        {!liveOnly && !warehousePresentation ? <AgentFeed /> : null}
        {!liveOnly && !warehousePresentation ? <DebugPanel /> : null}
        {transition ? (
          <div className={`facility-transition ${transition}`} role="status" aria-live="polite">
            <span>{transition === 'to_warehouse' ? '前往智慧倉儲區' : '返回成型工廠'}</span>
            <i />
          </div>
        ) : null}
        <button
          className={`edge-handle left ${leftOpen ? 'open' : ''}`}
          onClick={toggleLeft}
          aria-label={leftOpen ? '收起 AI 對話' : '打開 AI 對話'}
          title={leftOpen ? '收起 AI 對話' : '打開 AI 對話'}
          type="button"
        >
          {leftOpen ? '<' : '>'}
        </button>
        <button
          className={`edge-handle right ${rightOpen ? 'open' : ''}`}
          onClick={toggleRight}
          aria-label={rightOpen ? '收起詳細資訊' : '打開詳細資訊'}
          title={rightOpen ? '收起詳細資訊' : '打開詳細資訊'}
          type="button"
        >
          {rightOpen ? '>' : '<'}
        </button>
      </main>
      {rightOpen ? (
        <aside className="col col-right">
          {warehousePresentation ? <WarehouseDecisionInspector /> : <DetailPanel />}
        </aside>
      ) : null}
    </div>
  );
}

export function FactoryTwinWorkspace({
  platformCameras,
  livePersons,
  liveOnly = false,
  liveDataStatus,
  demoPresentation = false,
}: {
  platformCameras: CameraEntity[];
  livePersons: PersonEntity[];
  liveOnly?: boolean;
  liveDataStatus?: TwinAgentLiveDataStatus;
  demoPresentation?: boolean;
}) {
  const [mode, setMode] = useState<FactoryMode>('factory');
  const [demoScenarioId, setDemoScenarioId] = useState<DemoScenarioId>('normal');
  const [demoSessionId, setDemoSessionId] = useState(DEMO_TWIN_AGENT_SESSION_ID);
  const seededMode = useRef<string | null>(null);
  const resetWorkspace = useFactoryStore((s) => s.resetWorkspace);
  const setPlatformCameras = useFactoryStore((s) => s.setPlatformCameras);
  const setLivePersons = useFactoryStore((s) => s.setLivePersons);
  const setProbedCoord = useFactoryStore((s) => s.setProbedCoord);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('anchorPicker') !== '1') return;
    const store = useFactoryStore.getState();
    if (!store.debugOpen) store.toggleDebug();
    if (!store.probedCoord) {
      const anchor = readStoredLivePersonAnchor() ?? livePersonAnchorForCamera('fw-camera-hc600-01-anchor-preview');
      if (anchor) setProbedCoord({ x: anchor.x, z: anchor.z });
    }
  }, [setProbedCoord]);

  const withSpatialZones = useCallback((entities: ReturnType<typeof buildMockEntities>) => {
    if (!liveOnly) {
      for (const zone of SPATIAL_ZONES) entities[zone.id] = zone;
    }
    return entities;
  }, [liveOnly]);

  useLayoutEffect(() => {
    const workspaceKey = liveOnly ? 'live' : demoPresentation ? 'accelerator-demo' : 'simulation';
    if (seededMode.current === workspaceKey) return;
    seededMode.current = workspaceKey;
    const entities = withSpatialZones(
      liveOnly
        ? buildLiveFactoryEntities()
        : demoPresentation
          ? buildDemoScenarioEntities('normal')
          : buildMockEntities(),
    );
    resetWorkspace(
      entities,
      liveOnly
        ? '4WALL AI 已連上靚程工廠的真實資料。可問「01機台現在狀況」、「今天計畫與實際對帳」或「現場有人嗎」。'
        : demoPresentation
          ? '模擬情境：4WALL 展示工廠已載入。機台、人員、AMR、產量與對帳皆為模擬資料；靚程授權影像只作即時連線展示。'
          : '靚程工廠數位分身已載入。可問「小明在哪」、「HC600 今天狀況」，或輸入「派小明去處理 HC600」。',
    );
  }, [demoPresentation, liveOnly, resetWorkspace, withSpatialZones]);

  const applyDemoScenario = useCallback(
    (scenarioId: DemoScenarioId) => {
      if (!demoPresentation) return;
      const scenario = getDemoScenario(scenarioId);
      const entities = withSpatialZones(buildDemoScenarioEntities(scenarioId));
      setDemoScenarioId(scenarioId);
      setDemoSessionId(uid('demo-twin-session'));
      resetWorkspace(
        entities,
        `模擬情境：${scenario.label}已載入。${scenario.summary}`,
      );
      useFactoryStore.getState().pushSimEvent({
        atMs: 0,
        type: 'control',
        important: true,
        message: scenario.eventMessage,
      });
    },
    [demoPresentation, resetWorkspace, withSpatialZones],
  );

  useEffect(() => {
    setPlatformCameras(platformCameras);
  }, [platformCameras, setPlatformCameras]);

  useEffect(() => {
    setLivePersons(livePersons);
  }, [livePersons, setLivePersons]);

  const activeMode: FactoryMode = liveOnly || demoPresentation ? 'factory' : mode;
  const onlineCameraCount = platformCameras.filter((camera) => camera.online).length;
  const demoFacilitySpace = useWarehouseDemoStore((state) => state.space);

  return (
    <div className="factory-twin-shell">
      <div className="app">
        <div className="factory-twin-modebar">
          <div>
            <span className="factory-twin-kicker">
              {demoPresentation
                ? `Accelerator Demo / ${demoFacilitySpace === 'warehouse' ? '智慧倉儲' : '成型產線'}`
                : 'Mirror Factory'}
            </span>
            <strong>
              {demoPresentation
                ? '4WALL 展示工廠'
                : activeMode === 'factory'
                  ? '靚程工廠即時戰情室'
                  : '倉儲情境模擬'}
            </strong>
          </div>
          {demoPresentation ? (
            <div className="demo-source-status" aria-label="展示資料來源">
              <span className="simulation">{demoFacilitySpace === 'warehouse' ? '倉儲模擬提案' : '模擬營運數據'}</span>
              <span className="live-evidence">
                {platformCameras.length > 0
                  ? `靚程授權影像 ${onlineCameraCount}/${platformCameras.length} 在線`
                  : '靚程授權影像尚無資料'}
              </span>
            </div>
          ) : !liveOnly ? (
            <div className="mode-switch" role="group" aria-label="工廠數位分身模式">
              <button className={mode === 'factory' ? 'active' : ''} onClick={() => setMode('factory')} type="button">
                工廠戰情室
              </button>
              <button className={mode === 'warehouse' ? 'active' : ''} onClick={() => setMode('warehouse')} type="button">
                倉儲模擬
              </button>
            </div>
          ) : null}
        </div>
        {activeMode === 'warehouse' ? (
          <WarehouseSimulator />
        ) : (
          <FactoryDemo
            liveOnly={liveOnly}
            liveDataStatus={liveDataStatus}
            demoPresentation={demoPresentation}
            demoScenarioId={demoScenarioId}
            demoSessionId={demoSessionId}
            onDemoScenarioChange={applyDemoScenario}
          />
        )}
      </div>
    </div>
  );
}
