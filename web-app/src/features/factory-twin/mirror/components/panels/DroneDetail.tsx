import type { DroneEntity } from '../../domain/entities';
import { useFactoryStore } from '../../store/factoryStore';

export function DroneDetail({ entity }: { entity: DroneEntity }) {
  const patch = useFactoryStore((s) => s.patchEntity);

  return (
    <div className="detail">
      <div className="panel-title">無人機航點</div>
      <h3 className="detail-name">{entity.name}</h3>
      <div className="cam-meta">
        {entity.flying ? '飛行中' : '待命'}・電量 {entity.battery}%
      </div>

      <ol className="wp">
        {entity.waypoints.map((w, i) => (
          <li key={i}>
            WP{i + 1} ({w.x.toFixed(0)}, {w.y.toFixed(0)}, {w.z.toFixed(0)})
          </li>
        ))}
      </ol>

      <div className="detail-actions">
        <button className="btn" onClick={() => patch(entity.id, { flying: true, status: 'flying' })}>
          開始航點飛行
        </button>
        <button className="btn ghost" onClick={() => patch(entity.id, { flying: false, status: 'standby' })}>
          降落
        </button>
      </div>
      <div className="detail-note">P1+：在 3D 地圖點選新增/排序航點。</div>
    </div>
  );
}
