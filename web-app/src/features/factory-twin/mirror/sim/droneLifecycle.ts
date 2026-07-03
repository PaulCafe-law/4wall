import type { DroneEntity, Vec3 } from '../domain/entities';
import type { FactoryState } from '../store/factoryStore';
import { clamp, formatSimTime, type SimTick } from './simClock';
import { distance2d, moveToward3d, num, str } from './simHelpers';

const FLIGHT_Y = 4.4;

function withHeight(point: Vec3, y = FLIGHT_Y): Vec3 {
  return { x: point.x, y, z: point.z };
}

function baseHome(drone: DroneEntity): Vec3 {
  const p = drone.attrs?.baseHome as Partial<Vec3> | undefined;
  if (typeof p?.x === 'number' && typeof p.y === 'number' && typeof p.z === 'number') {
    return { x: p.x, y: p.y, z: p.z };
  }
  return { ...drone.position };
}

export function tickDroneLifecycle(state: FactoryState, drone: DroneEntity, tick: SimTick): void {
  if (drone.source !== 'sim') return;
  const simState = str(drone.attrs?.simState, drone.flying ? 'patrol' : 'standby');
  const battery = Math.round(clamp(drone.battery + (drone.flying ? -tick.deltaSec * 0.04 : tick.deltaSec * 0.08), 12, 100));
  const home = baseHome(drone);

  if (simState === 'standby') {
    const nextAt = num(drone.attrs?.simNextPatrolAt, tick.nowMs + 12000);
    if (tick.nowMs >= nextAt && battery > 35) {
      state.patchEntity(drone.id, {
        flying: true,
        status: 'moving',
        battery,
        attrs: {
          ...(drone.attrs ?? {}),
          baseHome: home,
          simState: 'takeoff',
          waypointIdx: 0,
        },
      });
      state.pushSimEvent({
        atMs: tick.nowMs,
        type: 'drone',
        entityId: drone.id,
        important: false,
        message: `[${formatSimTime(tick.nowMs)}] ${drone.name} 起飛巡檢`,
      });
    } else {
      state.patchEntity(drone.id, {
        battery,
        attrs: { ...(drone.attrs ?? {}), baseHome: home, simState: 'standby', simNextPatrolAt: nextAt },
      });
    }
    return;
  }

  if (simState === 'takeoff') {
    const target = withHeight(drone.position);
    const position = moveToward3d(drone.position, target, tick.deltaSec * 1.8);
    state.patchEntity(drone.id, {
      position,
      battery,
      attrs: { ...(drone.attrs ?? {}), simState: position.y >= FLIGHT_Y - 0.1 ? 'patrol' : 'takeoff' },
    });
    return;
  }

  if (simState === 'patrol') {
    const waypoints = drone.waypoints.length > 0 ? drone.waypoints : [withHeight(home)];
    const idx = Math.min(Math.max(Math.floor(num(drone.attrs?.waypointIdx, 0)), 0), waypoints.length - 1);
    const target = withHeight(waypoints[idx]);
    const position = moveToward3d(drone.position, target, tick.deltaSec * 1.6);
    const arrived = distance2d(position, target) < 0.35;
    const nextIdx = arrived ? idx + 1 : idx;
    state.patchEntity(drone.id, {
      position,
      battery,
      attrs: {
        ...(drone.attrs ?? {}),
        waypointIdx: nextIdx,
        simState: nextIdx >= waypoints.length ? 'landing' : 'patrol',
      },
    });
    return;
  }

  if (simState === 'landing') {
    const position = moveToward3d(drone.position, { ...home, y: 0 }, tick.deltaSec * 1.9);
    const landed = Math.hypot(position.x - home.x, position.y - 0, position.z - home.z) < 0.25;
    state.patchEntity(drone.id, {
      position,
      battery,
      flying: !landed,
      status: landed ? 'standby' : 'moving',
      attrs: {
        ...(drone.attrs ?? {}),
        simState: landed ? 'standby' : 'landing',
        simNextPatrolAt: landed ? tick.nowMs + 22000 : drone.attrs?.simNextPatrolAt,
        waypointIdx: landed ? 0 : drone.attrs?.waypointIdx,
      },
    });
    if (landed) {
      state.pushSimEvent({
        atMs: tick.nowMs,
        type: 'drone',
        entityId: drone.id,
        important: true,
        message: `[${formatSimTime(tick.nowMs)}] ${drone.name} 完成巡檢並降落`,
      });
    }
  }
}
