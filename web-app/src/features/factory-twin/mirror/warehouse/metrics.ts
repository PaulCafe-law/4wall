import type { WarehouseLayout } from './layout';
import type { RoutingResult } from './routing';

export interface WarehouseMetrics {
  totalAgvDistance: number;
  averageAgvDistance: number;
  averageDistancePerOrder: number;
  throughputPerHour: number;
  averageQueueMinutes: number;
  storageUtilization: number;
  completionMinutes: number;
}

export function buildMetrics(layout: WarehouseLayout, routing: RoutingResult, skuCount: number): WarehouseMetrics {
  const storageCapacity = layout.slotCount * 8;
  return {
    totalAgvDistance: routing.totalDistance,
    averageAgvDistance: routing.averageDistancePerPick,
    averageDistancePerOrder: routing.averageDistancePerOrder,
    throughputPerHour: routing.picksPerHour,
    averageQueueMinutes: routing.averageQueueMinutes,
    storageUtilization: Math.min(99, (skuCount / storageCapacity) * 100),
    completionMinutes: routing.completionMinutes,
  };
}

export function improvementPercent(current: number, baseline: number): number {
  if (baseline <= 0) return 0;
  return ((baseline - current) / baseline) * 100;
}
