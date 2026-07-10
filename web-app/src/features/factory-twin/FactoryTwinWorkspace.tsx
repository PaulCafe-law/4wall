import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChatPanel } from './mirror/components/ChatPanel';
import { AgentFeed } from './mirror/components/AgentFeed';
import { DebugPanel } from './mirror/components/DebugPanel';
import { DetailPanel } from './mirror/components/DetailPanel';
import { SimControlPanel } from './mirror/components/SimControlPanel';
import { WarehouseSimulator } from './mirror/components/warehouse/WarehouseSimulator';
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
import { FactoryScene } from './mirror/three/FactoryScene';
import { WorkOrderOverlay } from './mirror/three/WorkOrderOverlay';
import './mirror/styles.css';

type FactoryMode = 'factory' | 'warehouse';

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
  const centerRef = useRef<HTMLElement>(null);

  useSimEngine(!liveOnly);
  useLocalAgent(!liveOnly);
  useTwinAgentBridge(liveDataStatus, {
    sessionId: demoPresentation ? demoSessionId : undefined,
    bindOrganization: !demoPresentation,
    includeLiveEvidence: !demoPresentation,
    demoScenarioId: demoPresentation ? demoScenarioId : undefined,
  });

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
    <div className="layout" style={{ gridTemplateColumns: gridCols }}>
      {leftOpen ? (
        <aside className="col col-left">
          <ChatPanel
            liveOnly={liveOnly}
            demoPresentation={demoPresentation}
            demoScenarioId={demoScenarioId}
            sessionId={demoPresentation ? demoSessionId : undefined}
          />
        </aside>
      ) : null}
      <main className="col col-center" ref={centerRef}>
        <FactoryScene />
        {!demoPresentation ? <WorkOrderOverlay /> : null}
        {!liveOnly ? (
          <SimControlPanel
            demoPresentation={demoPresentation}
            scenarioId={demoScenarioId}
            onScenarioChange={onDemoScenarioChange}
          />
        ) : null}
        {!liveOnly ? <AgentFeed /> : null}
        {!liveOnly ? <DebugPanel /> : null}
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
          <DetailPanel />
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

  return (
    <div className="factory-twin-shell">
      <div className="app">
        <div className="factory-twin-modebar">
          <div>
            <span className="factory-twin-kicker">{demoPresentation ? 'Accelerator Demo' : 'Mirror Factory'}</span>
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
              <span className="simulation">模擬營運數據</span>
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
