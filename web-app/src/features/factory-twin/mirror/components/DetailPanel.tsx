import { useFactoryStore } from '../store/factoryStore';
import { MachineDetail } from './panels/MachineDetail';
import { CameraMonitor } from './panels/CameraMonitor';
import { WarehouseDetail } from './panels/WarehouseDetail';
import { AmrDetail } from './panels/AmrDetail';
import { DroneDetail } from './panels/DroneDetail';
import { PersonLineChat } from './panels/PersonLineChat';

export function DetailPanel() {
  const id = useFactoryStore((s) => s.selectedId);
  const entity = useFactoryStore((s) => (id ? s.entities[id] : null));

  if (!entity) {
    return (
      <div className="detail empty">
        <div className="panel-title">詳細資訊</div>
        <div className="detail-hint">
          點選場景中的人員 / 機台 / 倉儲 / AMR / 無人機，或用左側對話查詢。HC600-01 的監視器在機台詳情內。
        </div>
      </div>
    );
  }

  switch (entity.type) {
    case 'person':
      return <PersonLineChat entity={entity} />;
    case 'machine':
      return <MachineDetail entity={entity} />;
    case 'camera':
      return <CameraMonitor entity={entity} />;
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
