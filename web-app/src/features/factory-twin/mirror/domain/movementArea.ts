import type { Vec3 } from './entities';
import { FACTORY_FLOOR_RECTS, FACTORY_OBSTACLE_RECTS } from './factoryCollision';

export interface MovementBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export type MovementRect = MovementBounds;

export interface MovementArea {
  bounds: MovementBounds;
  rects: MovementRect[];
  obstacles?: MovementRect[];
}

export const DEFAULT_MOVEMENT_AREA: MovementArea = {
  bounds: { minX: -18, maxX: 18, minZ: -11, maxZ: 11 },
  rects: [{ minX: -18, maxX: 18, minZ: -11, maxZ: 11 }],
  obstacles: [],
};

const toMovementRect = ({ minX, maxX, minZ, maxZ }: MovementRect): MovementRect => ({ minX, maxX, minZ, maxZ });

export const REAL_FACTORY_WALKABLE_RECTS: MovementRect[] = FACTORY_FLOOR_RECTS.map(toMovementRect);
export const REAL_FACTORY_OBSTACLE_RECTS: MovementRect[] = FACTORY_OBSTACLE_RECTS.map(toMovementRect);

export const REAL_FACTORY_MOVEMENT_AREA: MovementArea = {
  bounds: boundsFromRects(REAL_FACTORY_WALKABLE_RECTS),
  rects: REAL_FACTORY_WALKABLE_RECTS,
  obstacles: REAL_FACTORY_OBSTACLE_RECTS,
};

export function boundsFromRects(rects: MovementRect[]): MovementBounds {
  if (rects.length === 0) return { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  return rects.reduce(
    (acc, rect) => ({
      minX: Math.min(acc.minX, rect.minX, rect.maxX),
      maxX: Math.max(acc.maxX, rect.minX, rect.maxX),
      minZ: Math.min(acc.minZ, rect.minZ, rect.maxZ),
      maxZ: Math.max(acc.maxZ, rect.minZ, rect.maxZ),
    }),
    { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
  );
}

export function insetMovementArea(area: MovementArea, margin: number): MovementArea {
  if (margin <= 0) return area;
  const rects = area.rects.map((rect) => {
    const cx = (rect.minX + rect.maxX) / 2;
    const cz = (rect.minZ + rect.maxZ) / 2;
    return {
      minX: Math.min(rect.minX + margin, cx),
      maxX: Math.max(rect.maxX - margin, cx),
      minZ: Math.min(rect.minZ + margin, cz),
      maxZ: Math.max(rect.maxZ - margin, cz),
    };
  });
  const obstacles = (area.obstacles ?? []).map((rect) => ({
    minX: rect.minX - margin,
    maxX: rect.maxX + margin,
    minZ: rect.minZ - margin,
    maxZ: rect.maxZ + margin,
  }));
  return { bounds: boundsFromRects(rects), rects, obstacles };
}

export function readMovementBounds(value: unknown): MovementBounds | null {
  if (!value || typeof value !== 'object') return null;
  const b = value as Partial<MovementBounds>;
  const nums = [b.minX, b.maxX, b.minZ, b.maxZ];
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  return {
    minX: Math.min(b.minX as number, b.maxX as number),
    maxX: Math.max(b.minX as number, b.maxX as number),
    minZ: Math.min(b.minZ as number, b.maxZ as number),
    maxZ: Math.max(b.minZ as number, b.maxZ as number),
  };
}

export function readMovementRects(value: unknown): MovementRect[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const rect = readMovementBounds(item);
    return rect ? [rect] : [];
  });
}

export function movementAreaFromAttrs(attrs: Record<string, unknown> | undefined): MovementArea {
  const bounds = readMovementBounds(attrs?.movementBounds) ?? DEFAULT_MOVEMENT_AREA.bounds;
  const rects = readMovementRects(attrs?.movementRects);
  const obstacles = readMovementRects(attrs?.movementObstacles);
  return { bounds, rects: rects.length > 0 ? rects : [bounds], obstacles };
}

function containsPoint(rect: MovementRect, pos: Vec3): boolean {
  return pos.x >= rect.minX && pos.x <= rect.maxX && pos.z >= rect.minZ && pos.z <= rect.maxZ;
}

export function isPointWalkable(pos: Vec3, area: MovementArea): boolean {
  const rects = area.rects.length > 0 ? area.rects : [area.bounds];
  const obstacles = area.obstacles ?? [];
  return rects.some((rect) => containsPoint(rect, pos)) && !obstacles.some((rect) => containsPoint(rect, pos));
}

function clampToRect(pos: Vec3, rect: MovementRect): Vec3 {
  return {
    x: Math.min(rect.maxX, Math.max(rect.minX, pos.x)),
    y: pos.y,
    z: Math.min(rect.maxZ, Math.max(rect.minZ, pos.z)),
  };
}

function pushOutOfRect(pos: Vec3, rect: MovementRect): Vec3 {
  const distances = [
    { side: 'left', value: Math.abs(pos.x - rect.minX) },
    { side: 'right', value: Math.abs(rect.maxX - pos.x) },
    { side: 'front', value: Math.abs(pos.z - rect.minZ) },
    { side: 'back', value: Math.abs(rect.maxZ - pos.z) },
  ].sort((a, b) => a.value - b.value);
  const side = distances[0].side;
  const epsilon = 0.002;
  if (side === 'left') return { ...pos, x: rect.minX - epsilon };
  if (side === 'right') return { ...pos, x: rect.maxX + epsilon };
  if (side === 'front') return { ...pos, z: rect.minZ - epsilon };
  return { ...pos, z: rect.maxZ + epsilon };
}

function distanceSq(a: Vec3, b: Vec3): number {
  return (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
}

export function clampToMovementArea(pos: Vec3, area: MovementArea): Vec3 {
  const rects = area.rects.length > 0 ? area.rects : [area.bounds];
  const obstacles = area.obstacles ?? [];
  const inWalkable = (p: Vec3) => rects.some((rect) => containsPoint(rect, p));
  const inObstacle = (p: Vec3) => obstacles.find((rect) => containsPoint(rect, p));

  for (const rect of rects) {
    if (containsPoint(rect, pos) && !inObstacle(pos)) {
      return pos;
    }
  }

  let best = clampToRect(pos, rects[0]);
  let bestDist = distanceSq(pos, best);
  for (const rect of rects.slice(1)) {
    const candidate = clampToRect(pos, rect);
    const dist = distanceSq(pos, candidate);
    if (dist < bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }

  for (let i = 0; i < obstacles.length + 4; i += 1) {
    const hit = inObstacle(best);
    if (!hit) break;
    best = pushOutOfRect(best, hit);
    if (!inWalkable(best)) {
      let reclamped = clampToRect(best, rects[0]);
      let reclampedDist = distanceSq(best, reclamped);
      for (const rect of rects.slice(1)) {
        const candidate = clampToRect(best, rect);
        const dist = distanceSq(best, candidate);
        if (dist < reclampedDist) {
          reclamped = candidate;
          reclampedDist = dist;
        }
      }
      best = reclamped;
    }
  }

  return best;
}

function segmentIntersectsRect(from: Vec3, to: Vec3, rect: MovementRect): boolean {
  if (containsPoint(rect, from) || containsPoint(rect, to)) return true;

  let tMin = 0;
  let tMax = 1;
  const dx = to.x - from.x;
  const dz = to.z - from.z;

  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > tMax) return false;
      if (t > tMin) tMin = t;
    } else {
      if (t < tMin) return false;
      if (t < tMax) tMax = t;
    }
    return true;
  };

  return (
    clip(-dx, from.x - rect.minX) &&
    clip(dx, rect.maxX - from.x) &&
    clip(-dz, from.z - rect.minZ) &&
    clip(dz, rect.maxZ - from.z) &&
    tMin <= tMax
  );
}

export function isPathSegmentClear(from: Vec3, to: Vec3, area: MovementArea): boolean {
  const start = clampToMovementArea(from, area);
  const end = clampToMovementArea(to, area);
  if (!isPointWalkable(start, area) || !isPointWalkable(end, area)) return false;
  return !(area.obstacles ?? []).some((rect) => segmentIntersectsRect(start, end, rect));
}

export function moveWithinMovementArea(from: Vec3, to: Vec3, area: MovementArea): Vec3 {
  const start = clampToMovementArea(from, area);
  const candidate = clampToMovementArea(to, area);
  if (!isPathSegmentClear(start, candidate, area)) return start;
  return candidate;
}
