import type { ReactNode } from 'react';

import { useFactoryStore } from '../store/factoryStore';
import { MachineDetail } from './panels/MachineDetail';
import { CameraMonitor } from './panels/CameraMonitor';
import { WarehouseDetail } from './panels/WarehouseDetail';
import { AmrDetail } from './panels/AmrDetail';
import { DroneDetail } from './panels/DroneDetail';
import { PersonLineChat } from './panels/PersonLineChat';
import { LivePersonDetail } from './panels/LivePersonDetail';

export function DetailPanel({ openBmcDetail }: { openBmcDetail?: ReactNode } = {}) {
  const id = useFactoryStore((s) => s.selectedId);
  const entity = useFactoryStore((s) => (id ? s.entities[id] : null));

  if (!entity) {
    return (
      <div className="detail empty">
        <div className="panel-title">詳細資訊</div>
        <div className="detail-hint">
          點選場景中的人員、機台或 Pi5 / OpenBMC 節點，或用左側對話查詢。HC600-01 的監視器在機台詳情內。
        </div>
      </div>
    );
  }

  switch (entity.type) {
    case 'person':
      if (entity.source === 'live') return <LivePersonDetail entity={entity} />;
      return <PersonLineChat entity={entity} />;
    case 'machine':
      return <MachineDetail entity={entity} />;
    case 'camera':
      return <CameraMonitor entity={entity} />;
    case 'device':
      if (entity.deviceKind === 'openbmc_pi5') {
        return openBmcDetail ?? (
          <div className="detail">
            <div className="panel-title">Pi5 / OpenBMC</div>
            <div className="detail-note">OpenBMC 詳細資訊目前無法載入。</div>
          </div>
        );
      }
      return null;
    case 'zone':
      return <WarehouseDetail entity={entity} />;
    case 'amr':
      return <AmrDetail entity={entity} />;
    case 'drone':
      return <DroneDetail entity={entity} />;
    default:
      return null;
  }
}
