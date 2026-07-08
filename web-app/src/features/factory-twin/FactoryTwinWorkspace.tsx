import { useEffect, useRef, useState } from 'react';
import { ChatPanel } from './mirror/components/ChatPanel';
import { AgentFeed } from './mirror/components/AgentFeed';
import { DebugPanel } from './mirror/components/DebugPanel';
import { DetailPanel } from './mirror/components/DetailPanel';
import { SimControlPanel } from './mirror/components/SimControlPanel';
import { WarehouseSimulator } from './mirror/components/warehouse/WarehouseSimulator';
import { buildMockEntities } from './mirror/domain/mockData';
import { SPATIAL_ZONES } from './mirror/domain/spatialZones';
import type { CameraEntity, PersonEntity } from './mirror/domain/entities';
import { useLocalAgent } from './mirror/hooks/useLocalAgent';
import { useTwinAgentBridge } from './mirror/hooks/useTwinAgentBridge';
import { useSimEngine } from './mirror/sim/simEngine';
import { useFactoryStore, uid } from './mirror/store/factoryStore';
import { FactoryScene } from './mirror/three/FactoryScene';
import { WorkOrderOverlay } from './mirror/three/WorkOrderOverlay';
import './mirror/styles.css';

type FactoryMode = 'factory' | 'warehouse';

function FactoryDemo() {
  const leftOpen = useFactoryStore((s) => s.leftOpen);
  const rightOpen = useFactoryStore((s) => s.rightOpen);
  const toggleLeft = useFactoryStore((s) => s.toggleLeft);
  const toggleRight = useFactoryStore((s) => s.toggleRight);
  const centerRef = useRef<HTMLElement>(null);

  useSimEngine(true);
  useLocalAgent();
  useTwinAgentBridge();

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
          <ChatPanel />
        </aside>
      ) : null}
      <main className="col col-center" ref={centerRef}>
        <FactoryScene />
        <WorkOrderOverlay />
        <SimControlPanel />
        <AgentFeed />
        <DebugPanel />
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
}: {
  platformCameras: CameraEntity[];
  livePersons: PersonEntity[];
}) {
  const [mode, setMode] = useState<FactoryMode>('factory');
  const seeded = useRef(false);
  const setEntities = useFactoryStore((s) => s.setEntities);
  const addMessage = useFactoryStore((s) => s.addMessage);
  const setPlatformCameras = useFactoryStore((s) => s.setPlatformCameras);
  const setLivePersons = useFactoryStore((s) => s.setLivePersons);

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    const entities = buildMockEntities();
    for (const zone of SPATIAL_ZONES) entities[zone.id] = zone;
    setEntities(entities);
    addMessage({
      id: uid('msg'),
      role: 'assistant',
      text: '靚程工廠數位分身已載入。可問「小明在哪」、「HC600 今天狀況」，或輸入「派小明去處理 HC600」。',
    });
  }, [addMessage, setEntities]);

  useEffect(() => {
    setPlatformCameras(platformCameras);
  }, [platformCameras, setPlatformCameras]);

  useEffect(() => {
    setLivePersons(livePersons);
  }, [livePersons, setLivePersons]);

  return (
    <div className="factory-twin-shell">
      <div className="app">
        <div className="factory-twin-modebar">
          <div>
            <span className="factory-twin-kicker">Mirror Factory</span>
            <strong>{mode === 'factory' ? '靚程工廠數位分身' : '倉儲情境模擬'}</strong>
          </div>
          <div className="mode-switch" role="group" aria-label="Factory Twin mode">
            <button className={mode === 'factory' ? 'active' : ''} onClick={() => setMode('factory')} type="button">
              工廠戰情室
            </button>
            <button className={mode === 'warehouse' ? 'active' : ''} onClick={() => setMode('warehouse')} type="button">
              倉儲模擬
            </button>
          </div>
        </div>
        {mode === 'warehouse' ? <WarehouseSimulator /> : <FactoryDemo />}
      </div>
    </div>
  );
}
