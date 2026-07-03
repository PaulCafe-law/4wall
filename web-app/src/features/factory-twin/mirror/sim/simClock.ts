export interface SimTick {
  nowMs: number;
  deltaMs: number;
  deltaSec: number;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function formatSimTime(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const hour = 8 + Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function staggerMs(id: string, minMs: number, spanMs: number): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return minMs + (hash % spanMs);
}
