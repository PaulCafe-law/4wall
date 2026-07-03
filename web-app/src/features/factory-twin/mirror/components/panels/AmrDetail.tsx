import { useState } from 'react';
import type { AmrEntity } from '../../domain/entities';
import { statusLabel } from '../../domain/entities';
import { useFactoryStore } from '../../store/factoryStore';

export function AmrDetail({ entity }: { entity: AmrEntity }) {
  const patch = useFactoryStore((s) => s.patchEntity);
  const [task, setTask] = useState(entity.task ?? '');

  return (
    <div className="detail">
      <div className="panel-title">AMR 任務</div>
      <h3 className="detail-name">{entity.name}</h3>
      <div className="cam-meta">
        {statusLabel(entity.status)}・電量 {entity.battery}%
      </div>

      <label className="field">
        任務指令
        <input value={task} onChange={(e) => setTask(e.target.value)} placeholder="例如：搬運 PP-NAT → HC600-04" />
      </label>

      <div className="detail-actions">
        <button className="btn" onClick={() => patch(entity.id, { task, status: 'moving' })}>
          下發任務
        </button>
        <button className="btn ghost" onClick={() => patch(entity.id, { task: null, status: 'idle' })}>
          停止
        </button>
      </div>
      <div className="detail-note">P1+：在 3D 地圖點選新增/排序停靠點。</div>
    </div>
  );
}
