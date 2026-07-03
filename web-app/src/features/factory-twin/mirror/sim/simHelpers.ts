import type { Entity, Vec3 } from '../domain/entities';
import { movementAreaFromAttrs } from '../domain/movementArea';
import { findWalkPath } from '../domain/pathfinding';

export function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function bool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function distance2d(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function moveToward3d(from: Vec3, to: Vec3, maxStep: number): Vec3 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist <= maxStep || dist === 0) return to;
  return {
    x: from.x + (dx / dist) * maxStep,
    y: from.y + (dy / dist) * maxStep,
    z: from.z + (dz / dist) * maxStep,
  };
}

export function readVec3Path(value: unknown): Vec3[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const p = item as Partial<Vec3>;
    if (
      typeof p.x !== 'number' ||
      typeof p.y !== 'number' ||
      typeof p.z !== 'number' ||
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.y) ||
      !Number.isFinite(p.z)
    ) {
      return [];
    }
    return [{ x: p.x, y: p.y, z: p.z }];
  });
}

export function pathBetween(from: Vec3, to: Vec3, mover: Entity): Vec3[] {
  const path = findWalkPath(from, to, movementAreaFromAttrs(mover.attrs), { step: mover.type === 'amr' ? 0.55 : 0.45 });
  return path.length > 1 ? path : [from, to];
}

export function isSimEntity(entity: Entity): boolean {
  return entity.source === 'sim';
}
