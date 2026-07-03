import { useState } from 'react';
import { useFactoryStore, type SimSpeed } from '../store/factoryStore';
import { formatSimTime } from '../sim/simClock';

const SPEEDS: SimSpeed[] = [1, 2, 4];

export function SimControlPanel() {
  const [scenarioBusy, setScenarioBusy] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const paused = useFactoryStore((s) => s.simPaused);
  const speed = useFactoryStore((s) => s.simSpeed);
  const simTimeMs = useFactoryStore((s) => s.simTimeMs);
  const events = useFactoryStore((s) => s.simEvents);
  const entities = useFactoryStore((s) => s.entities);
  const setPaused = useFactoryStore((s) => s.setSimPaused);
  const setSpeed = useFactoryStore((s) => s.setSimSpeed);
  const triggerAlarm = useFactoryStore((s) => s.triggerMachineAlarm);
  const pushEvent = useFactoryStore((s) => s.pushSimEvent);
  const addAgentNotification = useFactoryStore((s) => s.addAgentNotification);

  const machines = Object.values(entities).filter((entity) => entity.type === 'machine' && entity.source === 'sim');
  const preferredMachine = machines.find((machine) => machine.status === 'running') ?? machines[0];

  const triggerCoverageScenario = async () => {
    setScenarioBusy(true);
    try {
      const target = preferredMachine ?? machines[0];
      const message = target
        ? `覆蓋缺口情境：${target.name} 附近人員離站，良率開始下降，建議班長確認現場覆蓋。`
        : '覆蓋缺口情境：工廠人員覆蓋不足，建議班長確認現場。';
      pushEvent({
        atMs: simTimeMs,
        type: 'control',
        entityId: target?.id,
        important: true,
        message,
      });
      addAgentNotification({
        id: `local-coverage-${Date.now()}`,
        auditId: `local-audit-${Date.now()}`,
        title: '覆蓋缺口 → 良率風險',
        message,
        severity: 'warning',
        entityId: target?.id,
        createdAtMs: Date.now(),
        lineMode: 'mock',
      });
      if (target) triggerAlarm(target.id);
    } finally {
      setScenarioBusy(false);
    }
  };

  if (minimized) {
    return (
      <section className="sim-console minimized" aria-label="模擬控制已最小化">
        <div className="sim-console-head">
          <div>
            <div className="sim-title">即時模擬</div>
            <div className="sim-time">
              {formatSimTime(simTimeMs)} 班別時間 · {events.length} 事件
            </div>
          </div>
          <button
            className="sim-mini-button"
            onPointerDown={(event) => {
              event.preventDefault();
              setMinimized(false);
            }}
            type="button"
            aria-label="展開即時模擬"
            title="展開即時模擬"
          >
            +
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="sim-console" aria-label="模擬控制">
      <div className="sim-console-head">
        <div>
          <div className="sim-title">即時模擬</div>
          <div className="sim-time">{formatSimTime(simTimeMs)} 班別時間</div>
        </div>
        <div className="sim-head-actions">
          <button className={`sim-play ${paused ? 'paused' : ''}`} onClick={() => setPaused(!paused)} type="button">
            {paused ? '播放' : '暫停'}
          </button>
          <button
            className="sim-mini-button"
            onPointerDown={(event) => {
              event.preventDefault();
              setMinimized(true);
            }}
            type="button"
            aria-label="最小化即時模擬"
            title="最小化即時模擬"
          >
            -
          </button>
        </div>
      </div>

      <div className="sim-controls">
        <div className="sim-segment" role="group" aria-label="模擬速度">
          {SPEEDS.map((s) => (
            <button key={s} className={speed === s ? 'active' : ''} onClick={() => setSpeed(s)} type="button">
              {s}x
            </button>
          ))}
        </div>
        <button className="sim-trigger" onClick={() => triggerAlarm(preferredMachine?.id ?? null)} type="button">
          指定告警
        </button>
        <button className="sim-trigger ghost" onClick={() => triggerAlarm(null)} type="button">
          隨機告警
        </button>
        <button className="sim-trigger wide" onClick={triggerCoverageScenario} type="button" disabled={scenarioBusy}>
          覆蓋缺口 → 良率下降
        </button>
      </div>

      <div className="sim-events" aria-label="模擬事件流">
        {events.length === 0 ? (
          <div className="sim-empty">等待模擬事件</div>
        ) : (
          events.slice(0, 9).map((event) => (
            <div key={event.id} className={`sim-event ${event.type}`}>
              {event.message}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
