import { clear_overlays } from '../actions/actions';
import { machineUsesLiveMetricsOnly } from '../domain/entities';
import { useFactoryStore } from '../store/factoryStore';

export type AppMode = 'factory' | 'warehouse';

interface TopBarProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
}

export function TopBar({ mode, onModeChange }: TopBarProps) {
  const entities = useFactoryStore((s) => s.entities);
  const toggleDebug = useFactoryStore((s) => s.toggleDebug);
  const list = Object.values(entities);
  const people = list.filter((e) => e.type === 'person').length;
  const machines = list.filter((e) => e.type === 'machine').length;
  const alarms = list.filter((e) => e.type === 'machine' && !machineUsesLiveMetricsOnly(e) && e.alarms > 0).length;

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-dot" />
        MIRROR FACTORY
        <span className="brand-sub">
          {mode === 'warehouse' ? '倉儲數位分身 · 情境模擬' : '工廠數位分身戰情室'}
        </span>
      </div>

      <div className="mode-switch" role="group" aria-label="模式切換">
        <button className={mode === 'factory' ? 'active' : ''} onClick={() => onModeChange('factory')} type="button">
          主控室
        </button>
        <button className={mode === 'warehouse' ? 'active' : ''} onClick={() => onModeChange('warehouse')} type="button">
          倉儲模擬
        </button>
      </div>

      {mode === 'factory' ? (
        <>
          <div className="topbar-stats">
            <span className="pill live">
              <span className="dot" /> 即時模擬
            </span>
            <span className="pill">人員 {people}</span>
            <span className="pill">機台 {machines}</span>
            <span className={`pill ${alarms ? 'bad' : ''}`}>告警 {alarms}</span>
          </div>
          <button className="btn ghost" onClick={() => toggleDebug()} type="button">
            GLB 除錯
          </button>
          <button className="btn ghost" onClick={() => clear_overlays()} type="button">
            清除標記
          </button>
        </>
      ) : (
        <button className="btn ghost topbar-alone" onClick={() => onModeChange('factory')} type="button">
          回主控室
        </button>
      )}
    </header>
  );
}
