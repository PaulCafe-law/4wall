import type { Vec3 } from './entities';
import {
  clampToMovementArea,
  isPathSegmentClear,
  isPointWalkable,
  type MovementArea,
} from './movementArea';

interface Cell {
  ix: number;
  iz: number;
}

interface NodeRecord extends Cell {
  f: number;
  g: number;
  h: number;
  parent?: string;
}

export interface PathfindingOptions {
  step?: number;
  maxIterations?: number;
}

const DEFAULT_STEP = 0.45;

function keyOf(cell: Cell): string {
  return `${cell.ix},${cell.iz}`;
}

function sameCell(a: Cell, b: Cell): boolean {
  return a.ix === b.ix && a.iz === b.iz;
}

function distanceCell(a: Cell, b: Cell): number {
  return Math.hypot(a.ix - b.ix, a.iz - b.iz);
}

function distancePoint(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function makeGrid(area: MovementArea, step: number) {
  const minX = area.bounds.minX;
  const minZ = area.bounds.minZ;
  const cols = Math.max(1, Math.ceil((area.bounds.maxX - minX) / step));
  const rows = Math.max(1, Math.ceil((area.bounds.maxZ - minZ) / step));

  const clampCell = (cell: Cell): Cell => ({
    ix: Math.min(cols, Math.max(0, cell.ix)),
    iz: Math.min(rows, Math.max(0, cell.iz)),
  });

  const pointToCell = (point: Vec3): Cell =>
    clampCell({
      ix: Math.round((point.x - minX) / step),
      iz: Math.round((point.z - minZ) / step),
    });

  const cellToPoint = (cell: Cell, y: number): Vec3 => ({
    x: minX + cell.ix * step,
    y,
    z: minZ + cell.iz * step,
  });

  const inGrid = (cell: Cell): boolean =>
    cell.ix >= 0 && cell.ix <= cols && cell.iz >= 0 && cell.iz <= rows;

  return { pointToCell, cellToPoint, inGrid };
}

function findNearestWalkableCell(seed: Cell, grid: ReturnType<typeof makeGrid>, area: MovementArea, y: number): Cell | null {
  if (isPointWalkable(grid.cellToPoint(seed, y), area)) return seed;

  for (let radius = 1; radius <= 40; radius += 1) {
    let best: Cell | null = null;
    let bestDistance = Infinity;
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dz = -radius; dz <= radius; dz += 1) {
        if (Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;
        const candidate = { ix: seed.ix + dx, iz: seed.iz + dz };
        if (!grid.inGrid(candidate)) continue;
        if (!isPointWalkable(grid.cellToPoint(candidate, y), area)) continue;
        const dist = distanceCell(seed, candidate);
        if (dist < bestDistance) {
          best = candidate;
          bestDistance = dist;
        }
      }
    }
    if (best) return best;
  }

  return null;
}

function popBest(open: NodeRecord[]): NodeRecord {
  let bestIndex = 0;
  for (let i = 1; i < open.length; i += 1) {
    if (open[i].f < open[bestIndex].f || (open[i].f === open[bestIndex].f && open[i].h < open[bestIndex].h)) {
      bestIndex = i;
    }
  }
  const [best] = open.splice(bestIndex, 1);
  return best;
}

function reconstructPath(records: Map<string, NodeRecord>, endKey: string, grid: ReturnType<typeof makeGrid>, y: number): Vec3[] {
  const cells: Cell[] = [];
  let cursor: string | undefined = endKey;
  while (cursor) {
    const record = records.get(cursor);
    if (!record) break;
    cells.push({ ix: record.ix, iz: record.iz });
    cursor = record.parent;
  }
  return cells.reverse().map((cell) => grid.cellToPoint(cell, y));
}

function smoothPath(points: Vec3[], area: MovementArea): Vec3[] {
  if (points.length <= 2) return points;

  const smoothed: Vec3[] = [points[0]];
  let anchorIndex = 0;
  while (anchorIndex < points.length - 1) {
    let nextIndex = points.length - 1;
    while (nextIndex > anchorIndex + 1) {
      if (isPathSegmentClear(points[anchorIndex], points[nextIndex], area)) break;
      nextIndex -= 1;
    }
    smoothed.push(points[nextIndex]);
    anchorIndex = nextIndex;
  }
  return smoothed;
}

export function findWalkPath(from: Vec3, to: Vec3, area: MovementArea, options: PathfindingOptions = {}): Vec3[] {
  const step = options.step ?? DEFAULT_STEP;
  const maxIterations = options.maxIterations ?? 6000;
  const start = clampToMovementArea({ ...from, y: 0 }, area);
  const goal = clampToMovementArea({ ...to, y: 0 }, area);

  if (distancePoint(start, goal) < step) return [start, goal];
  if (isPathSegmentClear(start, goal, area)) return [start, goal];

  const grid = makeGrid(area, step);
  const startCell = findNearestWalkableCell(grid.pointToCell(start), grid, area, start.y);
  const goalCell = findNearestWalkableCell(grid.pointToCell(goal), grid, area, goal.y);
  if (!startCell || !goalCell) return [];

  const open: NodeRecord[] = [];
  const records = new Map<string, NodeRecord>();
  const closed = new Set<string>();
  const startKey = keyOf(startCell);
  const startRecord: NodeRecord = {
    ...startCell,
    g: 0,
    h: distanceCell(startCell, goalCell),
    f: distanceCell(startCell, goalCell),
  };
  open.push(startRecord);
  records.set(startKey, startRecord);

  const offsets = [
    { ix: 1, iz: 0, cost: 1 },
    { ix: -1, iz: 0, cost: 1 },
    { ix: 0, iz: 1, cost: 1 },
    { ix: 0, iz: -1, cost: 1 },
    { ix: 1, iz: 1, cost: Math.SQRT2 },
    { ix: 1, iz: -1, cost: Math.SQRT2 },
    { ix: -1, iz: 1, cost: Math.SQRT2 },
    { ix: -1, iz: -1, cost: Math.SQRT2 },
  ];

  let iterations = 0;
  while (open.length > 0 && iterations < maxIterations) {
    iterations += 1;
    const current = popBest(open);
    const currentKey = keyOf(current);
    if (closed.has(currentKey)) continue;
    if (sameCell(current, goalCell)) {
      const rawPath = reconstructPath(records, currentKey, grid, start.y);
      rawPath[0] = start;
      rawPath[rawPath.length - 1] = goal;
      return smoothPath(rawPath, area);
    }

    closed.add(currentKey);
    const currentPoint = grid.cellToPoint(current, start.y);
    for (const offset of offsets) {
      const next = { ix: current.ix + offset.ix, iz: current.iz + offset.iz };
      if (!grid.inGrid(next)) continue;
      const nextKey = keyOf(next);
      if (closed.has(nextKey)) continue;

      const nextPoint = grid.cellToPoint(next, start.y);
      if (!isPointWalkable(nextPoint, area)) continue;
      if (!isPathSegmentClear(currentPoint, nextPoint, area)) continue;

      const g = current.g + offset.cost;
      const existing = records.get(nextKey);
      if (existing && g >= existing.g) continue;

      const h = distanceCell(next, goalCell);
      const record: NodeRecord = {
        ...next,
        g,
        h,
        f: g + h,
        parent: currentKey,
      };
      records.set(nextKey, record);
      open.push(record);
    }
  }

  return [];
}
