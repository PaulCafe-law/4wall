import type { AmrEntity, Entity, Vec3 } from '../domain/entities';
import type { FactoryState } from '../store/factoryStore';
import { clamp, formatSimTime, type SimTick } from './simClock';
import { distance2d, num, pathBetween, str } from './simHelpers';

interface AmrTaskDef {
  fromId: string;
  toId: string;
  label: string;
}

const TASKS: AmrTaskDef[] = [
  { fromId: 'zone-a', toId: 'm-hc600', label: '塑膠粒補料 → HC600-01' },
  { fromId: 'zone-stage', toId: 'm-hc600-003', label: '物料暫存 → HC600-03' },
  { fromId: 'zone-stage', toId: 'zone-dock', label: '成品籃 → 出貨區' },
];

function pointOf(entity: Entity | undefined): Vec3 | null {
  return entity ? { x: entity.position.x, y: 0, z: entity.position.z } : null;
}

function chooseTask(amr: AmrEntity, nowMs: number): AmrTaskDef {
  const seed = Math.floor(nowMs / 1000) + amr.id.length;
  return TASKS[seed % TASKS.length];
}

function buildTaskRoute(state: FactoryState, amr: AmrEntity, task: AmrTaskDef): Vec3[] {
  const from = pointOf(state.entities[task.fromId]);
  const to = pointOf(state.entities[task.toId]);
  if (!from || !to) return [];

  const first = pathBetween(amr.position, from, amr);
  const second = pathBetween(from, to, amr);
  return [...first, ...second.slice(1)];
}

function startTask(state: FactoryState, amr: AmrEntity, tick: SimTick): void {
  const task = chooseTask(amr, tick.nowMs);
  const route = buildTaskRoute(state, amr, task);
  if (route.length < 2) return;

  state.patchEntity(amr.id, {
    status: 'moving',
    task: task.label,
    route,
    attrs: {
      ...(amr.attrs ?? {}),
      simState: 'moving',
      simTaskLabel: task.label,
      simTaskToId: task.toId,
      routeIdx: 1,
    },
  });
  state.pushSimEvent({
    atMs: tick.nowMs,
    type: 'amr',
    entityId: amr.id,
    important: false,
    message: `[${formatSimTime(tick.nowMs)}] ${amr.name} 接任務：${task.label}`,
  });
}

export function tickAmrLifecycle(state: FactoryState, amr: AmrEntity, tick: SimTick): void {
  if (amr.source !== 'sim') return;
  const simState = str(amr.attrs?.simState, amr.status === 'moving' ? 'moving' : 'idle');
  const batteryDelta = amr.status === 'moving' ? -tick.deltaSec * 0.035 : tick.deltaSec * 0.06;
  const battery = Math.round(clamp(amr.battery + batteryDelta, 8, 100));

  if (simState === 'charging') {
    if (battery >= 78) {
      state.patchEntity(amr.id, {
        battery,
        status: 'idle',
        task: null,
        attrs: { ...(amr.attrs ?? {}), simState: 'idle', simNextTaskAt: tick.nowMs + 5000 },
      });
      state.pushSimEvent({
        atMs: tick.nowMs,
        type: 'amr',
        entityId: amr.id,
        important: false,
        message: `[${formatSimTime(tick.nowMs)}] ${amr.name} 回充完成`,
      });
    } else {
      state.patchEntity(amr.id, { battery });
    }
    return;
  }

  if (battery <= 18 && simState !== 'moving') {
    state.patchEntity(amr.id, {
      battery,
      status: 'idle',
      task: '回充中',
      attrs: { ...(amr.attrs ?? {}), simState: 'charging' },
    });
    state.pushSimEvent({
      atMs: tick.nowMs,
      type: 'amr',
      entityId: amr.id,
      important: false,
      message: `[${formatSimTime(tick.nowMs)}] ${amr.name} 低電量，回充`,
    });
    return;
  }

  if (simState === 'moving') {
    const route = amr.route ?? [];
    const last = route[route.length - 1];
    if (last && distance2d(amr.position, last) < 0.65) {
      state.patchEntity(amr.id, {
        battery,
        status: 'idle',
        attrs: {
          ...(amr.attrs ?? {}),
          simState: 'unloading',
          simDueAt: tick.nowMs + 2500,
          routeIdx: route.length - 1,
        },
      });
      return;
    }
    state.patchEntity(amr.id, { battery });
    return;
  }

  if (simState === 'unloading') {
    if (tick.nowMs >= num(amr.attrs?.simDueAt, 0)) {
      state.patchEntity(amr.id, {
        battery,
        status: 'idle',
        task: null,
        attrs: {
          ...(amr.attrs ?? {}),
          simState: 'idle',
          simDueAt: undefined,
          simNextTaskAt: tick.nowMs + 5000 + Math.random() * 5000,
          routeIdx: 0,
        },
      });
      state.pushSimEvent({
        atMs: tick.nowMs,
        type: 'amr',
        entityId: amr.id,
        important: true,
        message: `[${formatSimTime(tick.nowMs)}] ${amr.name} 完成搬運：${str(amr.attrs?.simTaskLabel, amr.task ?? '任務')}`,
      });
    }
    return;
  }

  const nextTaskAt = num(amr.attrs?.simNextTaskAt, tick.nowMs + 3000);
  if (tick.nowMs >= nextTaskAt) {
    startTask(state, { ...amr, battery }, tick);
  } else {
    state.patchEntity(amr.id, {
      battery,
      attrs: { ...(amr.attrs ?? {}), simState: 'idle', simNextTaskAt: nextTaskAt },
    });
  }
}
