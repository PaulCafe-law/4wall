import type { StorageSlot, WarehouseLayout, WarehousePoint } from './layout';
import type { WarehouseOrder } from './orders';
import type { SlottingResult } from './slotting';

export type RouteOptimizer = 'nn' | 'nn-2opt';

export interface AgvRoute {
  agvId: string;
  orderIds: string[];
  waypoints: WarehousePoint[];
  distance: number;
  picks: number;
  finishMinute: number;
  completedOrders: number;
}

export interface RoutingResult {
  routes: AgvRoute[];
  totalDistance: number;
  averageDistancePerOrder: number;
  averageDistancePerPick: number;
  completionMinutes: number;
  averageQueueMinutes: number;
  picksPerHour: number;
  completedOrders: number;
  lateOrders: number;
  serviceLevelPercent: number;
  slotPickCounts: Map<string, number>;
  cellPickCounts: Map<string, number>;
}

interface OrderTrip {
  orderId: string;
  slots: StorageSlot[];
  picks: number;
  releaseMinute: number;
  dueMinute: number;
}

export interface WorkstationOutage {
  workstationId: string;
  startMinute: number;
  durationMinutes: number;
}

export interface RoutingOptions {
  planningHorizonMinutes?: number;
  workstationOutages?: WorkstationOutage[];
}

function manhattan(a: WarehousePoint, b: WarehousePoint): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function routeDistance(start: WarehousePoint, slots: StorageSlot[], end: WarehousePoint): number {
  let distance = 0;
  let current = start;
  for (const slot of slots) {
    distance += manhattan(current, slot.point);
    current = slot.point;
  }
  return distance + manhattan(current, end);
}

function nearestNeighbor(start: WarehousePoint, slots: StorageSlot[]): StorageSlot[] {
  const remaining = [...slots];
  const ordered: StorageSlot[] = [];
  let current = start;

  while (remaining.length) {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < remaining.length; i += 1) {
      const d = manhattan(current, remaining[i].point);
      if (d < bestDistance) {
        bestDistance = d;
        bestIndex = i;
      }
    }
    const [next] = remaining.splice(bestIndex, 1);
    current = next.point;
    ordered.push(next);
  }

  return ordered;
}

function twoOpt(
  start: WarehousePoint,
  slots: StorageSlot[],
  end: WarehousePoint,
  maxIterations = 14,
  maxCandidates = 240,
): StorageSlot[] {
  if (slots.length < 4) return slots;
  let best = [...slots];
  let bestDistance = routeDistance(start, best, end);
  let improved = true;
  let iteration = 0;
  let evaluated = 0;

  while (improved && iteration < maxIterations && evaluated < maxCandidates) {
    improved = false;
    iteration += 1;
    for (let i = 0; i < best.length - 2; i += 1) {
      for (let k = i + 2; k < best.length; k += 1) {
        if (evaluated >= maxCandidates) return best;
        evaluated += 1;
        const candidate = [...best.slice(0, i), ...best.slice(i, k + 1).reverse(), ...best.slice(k + 1)];
        const candidateDistance = routeDistance(start, candidate, end);
        if (candidateDistance + 0.001 < bestDistance) {
          best = candidate;
          bestDistance = candidateDistance;
          improved = true;
        }
      }
    }
  }

  return best;
}

function optimizeOrder(
  start: WarehousePoint,
  slots: StorageSlot[],
  end: WarehousePoint,
  optimizer: RouteOptimizer,
): { ordered: StorageSlot[]; distance: number } {
  const nn = nearestNeighbor(start, slots);
  const ordered = optimizer === 'nn-2opt' ? twoOpt(start, nn, end) : nn;
  return { ordered, distance: routeDistance(start, ordered, end) };
}

function samePoint(a: WarehousePoint, b: WarehousePoint): boolean {
  return Math.abs(a.x - b.x) < 0.0001 && Math.abs(a.y - b.y) < 0.0001;
}

function pushPoint(points: WarehousePoint[], point: WarehousePoint): void {
  const last = points[points.length - 1];
  if (!last || !samePoint(last, point)) points.push(point);
}

function appendManhattanLeg(points: WarehousePoint[], target: WarehousePoint): void {
  const start = points[points.length - 1];
  if (!start) {
    points.push(target);
    return;
  }
  if (samePoint(start, target)) return;
  const corner: WarehousePoint = { x: target.x, y: start.y };
  if (!samePoint(start, corner) && !samePoint(corner, target)) pushPoint(points, corner);
  pushPoint(points, target);
}

function buildTrip(order: WarehouseOrder, slotting: SlottingResult): OrderTrip | null {
  const slots: StorageSlot[] = [];
  let picks = 0;
  for (const line of order.lines) {
    const slot = slotting.skuToSlot.get(line.skuId);
    if (!slot) continue;
    slots.push(slot);
    picks += line.qty;
  }
  if (!slots.length) return null;
  return {
    orderId: order.id,
    slots,
    picks,
    releaseMinute: order.releaseMinute,
    dueMinute: order.dueMinute,
  };
}

export function routeOrders(
  layout: WarehouseLayout,
  orders: WarehouseOrder[],
  slotting: SlottingResult,
  agvCount: number,
  optimizer: RouteOptimizer = 'nn-2opt',
  options: RoutingOptions = {},
): RoutingResult {
  const safeAgvCount = Math.max(1, Math.min(16, Math.floor(agvCount)));
  const agvs = Array.from({ length: safeAgvCount }, (_, index) => ({
    id: `AGV-${(index + 1).toString().padStart(2, '0')}`,
    distance: 0,
    minute: 0,
    orderIds: [] as string[],
    waypoints: [layout.agvStart] as WarehousePoint[],
    picks: 0,
    completedOrders: 0,
  }));
  const slotPickCounts = new Map<string, number>();
  const cellPickCounts = new Map<string, number>();
  const planningHorizonMinutes = Math.max(1, options.planningHorizonMinutes ?? 480);
  const workstationAvailable = layout.workstations.map((_, index) => {
    const id = `WS-${(index + 1).toString().padStart(2, '0')}`;
    return (options.workstationOutages ?? [])
      .filter((outage) => outage.workstationId === id && outage.startMinute <= 0)
      .reduce((availableAt, outage) => Math.max(availableAt, outage.startMinute + outage.durationMinutes), 0);
  });
  let totalQueueMinutes = 0;
  let queueEvents = 0;
  let totalPicks = 0;
  let completedOrders = 0;
  let completedPicks = 0;
  let lateOrders = 0;

  const trips = orders
    .map((order) => buildTrip(order, slotting))
    .filter(Boolean)
    .sort((a, b) => (a?.releaseMinute ?? 0) - (b?.releaseMinute ?? 0) || String(a?.orderId).localeCompare(String(b?.orderId))) as OrderTrip[];
  for (const trip of trips) {
    const agv = agvs.reduce((best, candidate) =>
      Math.max(candidate.minute, trip.releaseMinute) < Math.max(best.minute, trip.releaseMinute) ? candidate : best,
    agvs[0]);
    agv.minute = Math.max(agv.minute, trip.releaseMinute);
    const start = agv.waypoints[agv.waypoints.length - 1] ?? layout.agvStart;
    const { ordered, distance } = optimizeOrder(start, trip.slots, layout.dock, optimizer);
    const travelMinutes = distance / 42;
    const pickMinutes = trip.picks * 0.18;
    const arrivalAtStation = agv.minute + travelMinutes + pickMinutes;
    let stationIndex = 0;
    for (let i = 1; i < workstationAvailable.length; i += 1) {
      if (workstationAvailable[i] < workstationAvailable[stationIndex]) stationIndex = i;
    }
    const queue = Math.max(0, workstationAvailable[stationIndex] - arrivalAtStation);
    const serviceMinutes = 0.7 + trip.picks * 0.08;
    workstationAvailable[stationIndex] = arrivalAtStation + queue + serviceMinutes;
    totalQueueMinutes += queue;
    queueEvents += 1;

    agv.distance += distance;
    agv.minute = workstationAvailable[stationIndex];
    agv.orderIds.push(trip.orderId);
    for (const slot of ordered) appendManhattanLeg(agv.waypoints, slot.point);
    appendManhattanLeg(agv.waypoints, layout.dock);
    agv.picks += trip.picks;
    totalPicks += trip.picks;
    if (agv.minute <= planningHorizonMinutes) {
      completedOrders += 1;
      completedPicks += trip.picks;
      agv.completedOrders += 1;
    }
    if (agv.minute > trip.dueMinute) lateOrders += 1;

    for (const slot of ordered) {
      slotPickCounts.set(slot.id, (slotPickCounts.get(slot.id) ?? 0) + 1);
      cellPickCounts.set(slot.cellId, (cellPickCounts.get(slot.cellId) ?? 0) + 1);
    }
  }

  const totalDistance = agvs.reduce((sum, agv) => sum + agv.distance, 0);
  const completionMinutes = Math.max(...agvs.map((agv) => agv.minute), 1);
  const congestionQueueMinutes = Math.max(0, trips.length / (safeAgvCount * 75) - 1) * 2.4;
  const routes: AgvRoute[] = agvs.map((agv) => ({
    agvId: agv.id,
    orderIds: agv.orderIds,
    waypoints: agv.waypoints,
    distance: agv.distance,
    picks: agv.picks,
    finishMinute: agv.minute,
    completedOrders: agv.completedOrders,
  }));

  const throughputWindowMinutes = Math.max(1, Math.min(planningHorizonMinutes, completionMinutes));

  return {
    routes,
    totalDistance,
    averageDistancePerOrder: totalDistance / Math.max(1, orders.length),
    averageDistancePerPick: totalDistance / Math.max(1, totalPicks),
    completionMinutes,
    averageQueueMinutes: totalQueueMinutes / Math.max(1, queueEvents) + congestionQueueMinutes,
    picksPerHour: completedPicks / (throughputWindowMinutes / 60),
    completedOrders,
    lateOrders,
    serviceLevelPercent: ((trips.length - lateOrders) / Math.max(1, trips.length)) * 100,
    slotPickCounts,
    cellPickCounts,
  };
}
