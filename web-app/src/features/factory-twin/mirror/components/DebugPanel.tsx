// Developer overlay: lists the GLB's mesh names and shows which entities bound to a mesh
// vs. which are still unbound. Use it to fix Blender naming until everything binds.
import { useState } from 'react';
import { useFactoryStore } from '../store/factoryStore';
import { BOUND_ENTITY_IDS } from '../domain/meshBindings';
import type { Entity } from '../domain/entities';

function isArchitectureName(name: string): boolean {
  return /wall|roof|floor|level|railing|rail|stair|beam|hn400|ub-universal|柱|钢|鋼|型钢|型鋼/i.test(name);
}

function isEquipmentName(name: string): boolean {
  return /hc600|塑膠成型機|成型機|injection|machine/i.test(name);
}

function isFixedZone(entity: Entity): boolean {
  return entity.type === 'zone' && entity.attrs?.fixedWorld === true;
}

function DebugList({ items, empty }: { items: string[]; empty: string }) {
  return (
    <ul className="debug-list">
      {items.map((n) => (
        <li key={n}>{n}</li>
      ))}
      {items.length === 0 && <li className="muted">{empty}</li>}
    </ul>
  );
}

export function DebugPanel() {
  const open = useFactoryStore((s) => s.debugOpen);
  const toggle = useFactoryStore((s) => s.toggleDebug);
  const meshNames = useFactoryStore((s) => s.glbMeshNames);
  const boundIds = useFactoryStore((s) => s.boundEntityIds);
  const boundMap = useFactoryStore((s) => s.boundMap);
  const entities = useFactoryStore((s) => s.entities);
  const probedCoord = useFactoryStore((s) => s.probedCoord);
  const [filter, setFilter] = useState('');

  if (!open) return null;

  const hasGlb = meshNames.length > 0;
  const q = filter.trim().toLowerCase();
  const shownMeshes = q ? meshNames.filter((n) => n.toLowerCase().includes(q)) : meshNames;
  const boundMeshNames = new Set(Object.values(boundMap));
  const suspiciousEquipment = shownMeshes.filter((n) => isEquipmentName(n) && !boundMeshNames.has(n));
  const architectureNodes = shownMeshes.filter(isArchitectureName);
  const fixedZones = Object.values(entities).filter(isFixedZone);
  const bindable = BOUND_ENTITY_IDS.map((id) => ({
    id,
    name: entities[id]?.name ?? id,
    mesh: boundMap[id],
    bound: boundIds.includes(id),
  }));
  const boundEquipment = bindable.filter((b) => b.bound);
  const unboundEquipment = bindable.filter((b) => !b.bound);

  return (
    <div className="debug-panel">
      <div className="debug-head">
        <span>GLB 除錯</span>
        <button className="debug-close" onClick={toggle} aria-label="關閉">
          ✕
        </button>
      </div>

      <div className="debug-section">
        <div className="debug-summary">
          <span className={hasGlb ? 'ok' : ''}>
            {hasGlb ? `已載入 GLB · ${meshNames.length} mesh` : '未載入 GLB（placeholder 模式）'}
          </span>
          <span className={boundIds.length === BOUND_ENTITY_IDS.length ? 'ok' : 'warn'}>
            已綁定 {boundIds.length} / {BOUND_ENTITY_IDS.length}
          </span>
        </div>
        {!hasGlb && (
          <div className="debug-hint">
            Fourth Wall 平台頁會從 <code>/factory-twin-assets/assets/factory.glb</code> 載入模型，這裡會列出 GLB 內所有 mesh 名稱。
          </div>
        )}
        {hasGlb && (
          <>
            <input
              className="debug-filter"
              value={filter}
              placeholder="搜尋 mesh 名稱…"
              onChange={(e) => setFilter(e.target.value)}
            />
            <div className="debug-subhead">可疑設備 node · {suspiciousEquipment.length}</div>
            <DebugList items={suspiciousEquipment} empty={`找不到符合「${filter}」的設備 node`} />
            <div className="debug-subhead">建築結構 · {architectureNodes.length}</div>
            <DebugList items={architectureNodes.slice(0, 80)} empty="沒有符合的建築 node" />
          </>
        )}
      </div>

      <div className="debug-section">
        <div className="debug-label">已綁定設備</div>
        <ul className="debug-bind">
          {boundEquipment.map((b) => (
            <li key={b.id} className="ok">
              <span className="dot" />
              <span className="bind-name">{b.name}</span>
              <span className="bind-mesh">→ {b.mesh}</span>
            </li>
          ))}
          {boundEquipment.length === 0 && <li className="no muted">尚未綁定任何設備</li>}
        </ul>
        <div className="debug-subhead">未綁定設備 · {unboundEquipment.length}</div>
        <ul className="debug-bind">
          {unboundEquipment.map((b) => (
            <li key={b.id} className={hasGlb ? 'warn' : 'no'}>
              <span className="dot" />
              <span className="bind-name">{b.name}</span>
              <span className="bind-mesh">{hasGlb ? '未綁到 mesh' : '待 GLB'}</span>
            </li>
          ))}
        </ul>
        <div className="debug-hint">
          在 <code>src/domain/meshBindings.ts</code> 加一行 <code>entityId: ["mesh 名稱別名"]</code> 即可新增綁定。
        </div>
      </div>

      <div className="debug-section">
        <div className="debug-label">Fixed zones</div>
        <ul className="debug-bind">
          {fixedZones.map((z) => (
            <li key={z.id} className="ok">
              <span className="dot" />
              <span className="bind-name">{z.name}</span>
              <span className="bind-mesh">
                x:{z.position.x} z:{z.position.z}
              </span>
            </li>
          ))}
          {fixedZones.length === 0 && <li className="no muted">目前沒有 fixedWorld zone</li>}
        </ul>
      </div>

      <div className="debug-section">
        <div className="debug-label">座標探針</div>
        <div className="debug-coord">
          {probedCoord ? (
            <code>
              x: {probedCoord.x} z: {probedCoord.z}
            </code>
          ) : (
            <span className="debug-hint">點工廠地板任一點讀取世界座標</span>
          )}
        </div>
        <div className="debug-hint">
          用來定位區域：點地板讀 x/z，填入 <code>src/domain/spatialZones.ts</code> 的 <code>position</code>，或直接告訴我座標。
        </div>
      </div>
    </div>
  );
}
