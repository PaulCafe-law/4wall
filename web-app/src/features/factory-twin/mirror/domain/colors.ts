// Mid-century palette for the 3D scene. Colors are tuned to read on the teal-deep stage
// background. Overlay colors are applied by the action layer; entity colors are the default
// marker color when no overlay is active.

export const OVERLAY = {
  highlight: '#d9a441', // 標示 (mustard)
  assign: '#9ad0d2', // 派工連線 (light cyan — pops on teal)
  alarm: '#c0492f', // 告警 (brick)
} as const;

export const ENTITY_COLOR: Record<string, string> = {
  person: '#ede4ce', // cream
  machine: '#c9bfa3', // tan
  camera: '#c0492f', // brick
  zone: '#d9a441', // mustard (usually overridden per-zone)
  amr: '#d9a441', // mustard
  drone: '#e0852f', // orange
};

export function machineColor(status: string): string {
  switch (status) {
    case 'alarm':
      return '#c0492f'; // brick
    case 'running':
      return '#6e7b3d'; // olive
    case 'maintenance':
      return '#d9a441'; // mustard
    case 'unknown':
      return '#7a807a'; // muted live-data placeholder
    default:
      return '#c9bfa3'; // tan (idle)
  }
}
