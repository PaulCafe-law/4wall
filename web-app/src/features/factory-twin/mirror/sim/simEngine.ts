// P3 simulation orchestrator. Domain behavior lives in src/sim/* modules; this hook
// only advances time, preserves the source:'sim' seam, and moves unbound actors.
import { useEffect, useRef } from 'react';
import { useFactoryStore } from '../store/factoryStore';
import type { MachineEntity, Vec3 } from '../domain/entities';
import { clampToMovementArea, movementAreaFromAttrs, moveWithinMovementArea } from '../domain/movementArea';
import { tickMachineLifecycle, triggerMachineAlarm } from './machineLifecycle';
import { tickDispatchLoop } from './dispatchLoop';
import { tickAmrLifecycle } from './amrLifecycle';
import { tickDroneLifecycle } from './droneLifecycle';
import { formatSimTime, type SimTick } from './simClock';
import { readVec3Path } from './simHelpers';

const TICK_REAL_MS = 600;

function chooseManualAlarmMachine(targetId: string | null): MachineEntity | null {
  const entities = useFactoryStore.getState().entities;
  if (targetId) {
    const entity = entities[targetId];
    return entity?.type === 'machine' ? entity : null;
  }

  const machines = Object.values(entities).filter(
    (entity): entity is MachineEntity =>
      entity.type === 'machine' &&
      entity.source === 'sim' &&
      entity.status !== 'alarm' &&
      entity.status !== 'maintenance',
  );
  if (machines.length === 0) return null;
  return machines[Math.floor(Math.random() * machines.length)];
}

function attrsWithoutWalkState(attrs: Record<string, unknown> | undefined): Record<string, unknown> {
  const next = { ...(attrs ?? {}) };
  delete next.walkPath;
  delete next.walkPathIdx;
  return next;
}

function tickPersonMovement(tick: SimTick): void {
  const s = useFactoryStore.getState();
  for (const e of Object.values(s.entities)) {
    if (e.source !== 'sim' || e.type !== 'person') continue;
    const area = movementAreaFromAttrs(e.attrs);
    const walkPath = readVec3Path(e.attrs?.walkPath);
    if (walkPath.length > 1) {
      const idx = Math.min(
        Math.max(typeof e.attrs?.walkPathIdx === 'number' ? e.attrs.walkPathIdx : 1, 1),
        walkPath.length - 1,
      );
      const target = clampToMovementArea(walkPath[idx], area);
      const dx = target.x - e.position.x;
      const dz = target.z - e.position.z;
      const dist = Math.hypot(dx, dz);
      const arrivedAtWaypoint = dist < 0.28;
      const nextIdx = arrivedAtWaypoint ? Math.min(idx + 1, walkPath.length - 1) : idx;
      const nextTarget = clampToMovementArea(walkPath[nextIdx], area);
      const ndx = nextTarget.x - e.position.x;
      const ndz = nextTarget.z - e.position.z;
      const nextDist = Math.hypot(ndx, ndz);
      const done = arrivedAtWaypoint && idx >= walkPath.length - 1;

      if (done) {
        s.patchEntity(e.id, {
          status: 'on-duty',
          station: typeof e.attrs?.walkTargetName === 'string' ? e.attrs.walkTargetName : e.station,
          attrs: { ...attrsWithoutWalkState(e.attrs), home: e.position },
        });
        continue;
      }

      const speed = Math.max(0.35, tick.deltaSec * 0.95);
      const candidate =
        nextDist <= speed
          ? nextTarget
          : {
              x: e.position.x + (ndx / nextDist) * speed,
              y: 0,
              z: e.position.z + (ndz / nextDist) * speed,
            };
      s.patchEntity(e.id, {
        position: moveWithinMovementArea(e.position, candidate, area),
        attrs: { ...(e.attrs ?? {}), walkPathIdx: nextIdx },
      });
      continue;
    }

    if (e.attrs?.simBusy) continue;

    const home = clampToMovementArea((e.attrs?.home as Vec3) ?? { x: e.position.x, y: 0, z: e.position.z }, area);
    const nx = e.position.x + (Math.random() - 0.5) * 0.22 * tick.deltaSec + (home.x - e.position.x) * 0.05;
    const nz = e.position.z + (Math.random() - 0.5) * 0.22 * tick.deltaSec + (home.z - e.position.z) * 0.05;
    s.patchEntity(e.id, {
      position: moveWithinMovementArea(e.position, { x: nx, y: 0, z: nz }, area),
      attrs: { ...(e.attrs ?? {}), home },
    });
  }
}

function tickAmrMovement(tick: SimTick): void {
  const s = useFactoryStore.getState();
  for (const e of Object.values(s.entities)) {
    if (e.source !== 'sim' || e.type !== 'amr' || e.status !== 'moving' || !e.route || e.route.length <= 1) {
      continue;
    }

    const area = movementAreaFromAttrs(e.attrs);
    const route = e.route;
    let idx = (e.attrs?.routeIdx as number) ?? 0;
    const taskMode = e.attrs?.simState === 'moving';
    const tgt = clampToMovementArea(route[Math.min(idx, route.length - 1)], area);
    const dx = tgt.x - e.position.x;
    const dz = tgt.z - e.position.z;
    const dist = Math.hypot(dx, dz);
    let nx = e.position.x;
    let nz = e.position.z;

    if (dist < 0.4) {
      if (taskMode && idx >= route.length - 1) {
        s.patchEntity(e.id, {
          status: 'idle',
          attrs: { ...(e.attrs ?? {}), simState: 'unloading', simDueAt: tick.nowMs + 2500, routeIdx: idx },
        });
        continue;
      }
      idx = taskMode ? Math.min(idx + 1, route.length - 1) : (idx + 1) % route.length;
    } else {
      const step = Math.max(0.25, tick.deltaSec * 0.62);
      nx += (dx / dist) * step;
      nz += (dz / dist) * step;
    }
    s.patchEntity(e.id, {
      position: moveWithinMovementArea(e.position, { x: nx, y: 0, z: nz }, area),
      attrs: { ...(e.attrs ?? {}), routeIdx: idx },
    });
  }
}

export function useSimEngine(enabled = true): void {
  const lastManualAlarmNonce = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const handle = window.setInterval(() => {
      const clock = useFactoryStore.getState();
      if (clock.simPaused) return;

      const deltaMs = TICK_REAL_MS * clock.simSpeed;
      const tick: SimTick = {
        nowMs: clock.simTimeMs + deltaMs,
        deltaMs,
        deltaSec: deltaMs / 1000,
      };
      clock.advanceSimTime(deltaMs);

      const manualState = useFactoryStore.getState();
      if (manualState.manualAlarmNonce !== lastManualAlarmNonce.current) {
        lastManualAlarmNonce.current = manualState.manualAlarmNonce;
        const machine = chooseManualAlarmMachine(manualState.manualAlarmTargetId);
        if (machine) {
          triggerMachineAlarm(manualState, machine, tick.nowMs, '主持人手動觸發');
        } else {
          manualState.pushSimEvent({
            atMs: tick.nowMs,
            type: 'control',
            important: false,
            message: `[${formatSimTime(tick.nowMs)}] 沒有可觸發的模擬機台`,
          });
        }
        manualState.clearManualAlarm();
      }

      let s = useFactoryStore.getState();
      for (const entity of Object.values(s.entities)) {
        if (entity.source !== 'sim' || entity.type !== 'machine') continue;
        tickMachineLifecycle(s, entity, tick);
      }

      tickDispatchLoop(useFactoryStore.getState(), tick);
      tickPersonMovement(tick);
      tickAmrMovement(tick);

      s = useFactoryStore.getState();
      for (const entity of Object.values(s.entities)) {
        if (entity.source !== 'sim') continue;
        if (entity.type === 'amr') tickAmrLifecycle(s, entity, tick);
        if (entity.type === 'drone') tickDroneLifecycle(s, entity, tick);
      }
    }, TICK_REAL_MS);
    return () => window.clearInterval(handle);
  }, [enabled]);
}
