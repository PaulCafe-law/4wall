// ============================================================================
//  ACTION / TOOL LAYER
//  These are the verbs the system can perform on the factory. They are the SAME
//  functions called by (a) the LLM agent when it emits a tool call, and (b) direct
//  UI interactions and agent tool calls. One verb set, two front doors.
// ============================================================================
import { useFactoryStore, uid } from '../store/factoryStore';
import type { AmrEntity, Entity, MachineEntity, MachineStatus } from '../domain/entities';
import { statusLabel } from '../domain/entities';
import { OVERLAY } from '../domain/colors';
import { movementAreaFromAttrs } from '../domain/movementArea';
import { findWalkPath } from '../domain/pathfinding';
import { formatSimTime } from '../sim/simClock';
import { pathBetween } from '../sim/simHelpers';

export interface ActionResult {
  ok: boolean;
  message: string;
  data?: unknown;
}

const store = () => useFactoryStore.getState();

/** Search entities by name / type / status. Returns id + position for follow-up tools. */
export function find_entities({ query }: { query: string }): ActionResult {
  const q = (query ?? '').trim().toLowerCase();
  const ents = Object.values(store().entities);
  const matches = ents.filter(
    (e) =>
      e.name.toLowerCase().includes(q) ||
      e.type.includes(q) ||
      statusLabel(e.status).toLowerCase().includes(q),
  );
  return {
    ok: matches.length > 0,
    message: matches.length
      ? `找到 ${matches.length} 個：${matches.map((m) => m.name).join('、')}`
      : `找不到符合「${query}」的對象`,
    data: matches.map((m) => ({ id: m.id, name: m.name, type: m.type, position: m.position })),
  };
}

/** Color one or more entities in the 3D scene (default yellow). */
export function highlight_entity({ ids, color }: { ids: string[]; color?: string }): ActionResult {
  const s = store();
  const c = color ?? OVERLAY.highlight;
  const done: string[] = [];
  for (const id of ids ?? []) {
    if (s.entities[id]) {
      s.setHighlight(id, { color: c });
      done.push(id);
    }
  }
  return { ok: done.length > 0, message: `已標示 ${done.length} 個對象`, data: done };
}

/** Fly the camera to an entity and select it. */
export function focus_camera({ id }: { id: string }): ActionResult {
  const s = store();
  const e = s.entities[id];
  if (!e) return { ok: false, message: `找不到 ${id}` };
  s.focus(id);
  s.select(id);
  return { ok: true, message: `鏡頭聚焦 ${e.name}` };
}

/** Return a human-readable status line for an entity. */
export function get_status({ id }: { id: string }): ActionResult {
  const e = store().entities[id];
  if (!e) return { ok: false, message: `找不到 ${id}` };
  return { ok: true, message: describe(e), data: e };
}

/** Draw a connection line between two entities. */
export function draw_link({
  from,
  to,
  label,
  color,
}: {
  from: string;
  to: string;
  label?: string;
  color?: string;
}): ActionResult {
  const s = store();
  if (!s.entities[from] || !s.entities[to]) return { ok: false, message: '連線端點不存在' };
  s.addLink({ id: uid('link'), from, to, label, color: color ?? OVERLAY.assign });
  return { ok: true, message: `已連線 ${s.entities[from].name} → ${s.entities[to].name}` };
}

/** Assign a worker to a machine: highlight both and draw the 派工 link. */
export function assign_task({
  worker,
  target,
  task,
  dispatchId,
  selectTarget = true,
  focusTarget = true,
}: {
  worker: string;
  target: string;
  task?: string;
  dispatchId?: string;
  selectTarget?: boolean;
  focusTarget?: boolean;
}): ActionResult {
  const s = store();
  const w = s.entities[worker];
  const t = s.entities[target];
  if (!w || !t) return { ok: false, message: '人員或目標不存在' };
  if (w.type === 'person' && w.source === 'live') {
    return { ok: false, message: '現場匿名人員不可派工；請改派已識別的模擬或正式人員' };
  }
  const job = task ?? '處理告警';
  const walkPath =
    w.type === 'person'
      ? findWalkPath(w.position, t.position, movementAreaFromAttrs(w.attrs), { step: 0.45 })
      : [];
  s.setHighlight(worker, { color: OVERLAY.assign });
  s.setHighlight(target, { color: OVERLAY.highlight });
  s.addLink({ id: dispatchId ?? uid('assign'), from: worker, to: target, label: job, color: OVERLAY.assign });
  s.patchEntity(worker, {
    status: walkPath.length > 1 ? 'moving' : w.status,
    attrs: {
      ...(w.attrs ?? {}),
      assignedTo: target,
      task: job,
      simDispatchId: dispatchId ?? w.attrs?.simDispatchId,
      walkPath: walkPath.length > 1 ? walkPath : undefined,
      walkPathIdx: walkPath.length > 1 ? 1 : undefined,
      walkTargetName: t.name,
      home: undefined,
    },
  });
  if (selectTarget) s.select(target);
  if (focusTarget) s.focus(target);
  return { ok: true, message: `已指派 ${w.name} → ${t.name}（${job}）` };
}

/** Send an AMR to a zone or machine: build the route and start the transport task. */
export function dispatch_amr({ amrId, target }: { amrId?: string; target: string }): ActionResult {
  const s = store();
  const ents = Object.values(s.entities);
  const amrs = ents.filter((e): e is AmrEntity => e.type === 'amr' && e.source === 'sim');
  const amr = amrId
    ? resolveEntityRef(amrId, amrs)
    : amrs.find((a) => a.status === 'idle') ?? amrs[0] ?? null;
  if (!amr) {
    return { ok: false, message: amrId ? `找不到 AMR「${amrId}」` : '目前沒有可派遣的 AMR' };
  }
  const dest = resolveEntityRef(
    target,
    ents.filter((e) => e.type === 'zone' || e.type === 'machine'),
  );
  if (!dest) return { ok: false, message: `找不到目的地「${target}」` };
  const route = pathBetween(amr.position, dest.position, amr);
  const label = `前往 ${dest.name}`;
  s.patchEntity(amr.id, {
    status: 'moving',
    task: label,
    route,
    attrs: {
      ...(amr.attrs ?? {}),
      simState: 'moving',
      simTaskLabel: label,
      simTaskToId: dest.id,
      routeIdx: 1,
      simNextTaskAt: s.simTimeMs + 120_000,
    },
  });
  s.pushSimEvent({
    atMs: s.simTimeMs,
    type: 'amr',
    entityId: amr.id,
    important: true,
    message: `[${formatSimTime(s.simTimeMs)}] ${amr.name} 接任務：${label}`,
  });
  s.setHighlight(amr.id, { color: OVERLAY.assign });
  s.setHighlight(dest.id, { color: OVERLAY.highlight });
  s.addLink({ id: uid('amr-dispatch'), from: amr.id, to: dest.id, label, color: OVERLAY.assign });
  s.focus(dest.id);
  return { ok: true, message: `已派遣 ${amr.name} ${label}` };
}

/** Force a sim machine into a lifecycle state (running / idle / maintenance / alarm). */
export function set_machine_state({
  machineId,
  state,
}: {
  machineId: string;
  state: MachineStatus;
}): ActionResult {
  const s = store();
  const machines = Object.values(s.entities).filter(
    (e): e is MachineEntity => e.type === 'machine',
  );
  const m = resolveEntityRef(machineId, machines);
  if (!m) return { ok: false, message: `找不到機台「${machineId}」` };
  if (m.source === 'live') {
    return { ok: false, message: `${m.name} 為現場機台，僅能操作模擬機台` };
  }
  if (state === 'alarm') {
    s.triggerMachineAlarm(m.id);
  } else if (state === 'maintenance') {
    s.patchEntity(m.id, {
      status: 'maintenance',
      attrs: { ...(m.attrs ?? {}), repairState: 'repairing', repairDoneAt: s.simTimeMs + 15_000 },
    });
  } else if (state === 'running') {
    s.patchEntity(m.id, {
      status: 'running',
      temperature: Math.min(m.temperature, 74),
      attrs: { ...(m.attrs ?? {}), repairState: undefined, simNextAlarmAt: s.simTimeMs + 60_000 },
    });
    s.setHighlight(m.id, null);
  } else if (state === 'idle') {
    s.patchEntity(m.id, { status: 'idle' });
  } else {
    return { ok: false, message: `不支援的狀態「${state}」` };
  }
  s.pushSimEvent({
    atMs: s.simTimeMs,
    type: 'machine',
    entityId: m.id,
    important: true,
    message: `[${formatSimTime(s.simTimeMs)}] ${m.name} 狀態切換為 ${statusLabel(state)}`,
  });
  return { ok: true, message: `已將 ${m.name} 設為 ${statusLabel(state)}` };
}

/** Fire a demo alarm: the sim engine picks the machine and auto repair dispatch follows. */
export function trigger_demo_incident({ machineId }: { machineId?: string }): ActionResult {
  const s = store();
  const machines = Object.values(s.entities).filter(
    (e): e is MachineEntity => e.type === 'machine' && e.source === 'sim',
  );
  const m = machineId ? resolveEntityRef(machineId, machines) : null;
  if (machineId && !m) return { ok: false, message: `找不到機台「${machineId}」` };
  s.triggerMachineAlarm(m?.id ?? null);
  return { ok: true, message: '已觸發演示告警，維修派工將自動啟動' };
}

/** Clear all highlights, links and selection. */
export function clear_overlays(): ActionResult {
  store().clearOverlays();
  return { ok: true, message: '已清除所有標記、連線與選取' };
}

function normalizedKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

/** Resolve an entity reference by id / name / alias (case- and whitespace-insensitive). */
function resolveEntityRef<T extends Entity>(ref: string, candidates: T[]): T | null {
  const key = normalizedKey(String(ref ?? ''));
  if (!key) return null;
  const exact = candidates.find(
    (e) =>
      normalizedKey(e.id) === key ||
      normalizedKey(e.name) === key ||
      (e.aliases ?? []).some((a) => normalizedKey(a) === key),
  );
  if (exact) return exact;
  return (
    candidates.find(
      (e) =>
        normalizedKey(e.name).includes(key) ||
        (e.aliases ?? []).some((a) => normalizedKey(a).includes(key)),
    ) ?? null
  );
}

function describe(e: Entity): string {
  switch (e.type) {
    case 'machine':
      return `${e.name}：${statusLabel(e.status)}・OEE ${e.oee}%・溫度 ${e.temperature}°C・週期 ${e.cycleTimeSec}s・今日 ${e.todayCount} 模・告警 ${e.alarms}`;
    case 'person':
      return `${e.name}（${e.role}）：${statusLabel(e.status)}${e.station ? '・站別 ' + e.station : ''}`;
    case 'camera':
      return `${e.name}：${e.online ? '在線' : '離線'}・取樣 ${e.samplingIntervalSeconds}s・場域 ${e.siteLabel}`;
    case 'zone':
      return `${e.name}：使用率 ${Math.round((e.used / e.capacity) * 100)}%（${e.used}/${e.capacity}）・SKU ${e.skuCount}`;
    case 'amr':
      return `${e.name}：${statusLabel(e.status)}・電量 ${e.battery}%・任務 ${e.task ?? '無'}`;
    case 'drone':
      return `${e.name}：${e.flying ? '飛行中' : statusLabel(e.status)}・電量 ${e.battery}%・航點 ${e.waypoints.length}`;
    default:
      return (e as Entity).name;
  }
}

export const ACTIONS = {
  find_entities,
  highlight_entity,
  focus_camera,
  get_status,
  draw_link,
  assign_task,
  dispatch_amr,
  set_machine_state,
  trigger_demo_incident,
  clear_overlays,
};
export type ActionName = keyof typeof ACTIONS;
