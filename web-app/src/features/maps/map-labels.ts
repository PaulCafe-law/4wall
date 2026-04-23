export function launchPointMarkerLabel(index: number, totalLaunchPoints: number) {
  return totalLaunchPoints === 1 ? 'L' : `L${index + 1}`
}
