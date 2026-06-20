export type SiteMapFlyVector = {
  x: number
  y: number
  z: number
}

export type SiteMapFlyBasis = {
  forward: SiteMapFlyVector
  right: SiteMapFlyVector
  up: SiteMapFlyVector
}

export type SiteMapFlyIntent = {
  forward?: boolean
  backward?: boolean
  right?: boolean
  left?: boolean
  up?: boolean
  down?: boolean
}

export function composeViewRelativeFlyMove(
  basis: SiteMapFlyBasis,
  intent: SiteMapFlyIntent,
): SiteMapFlyVector | null {
  const move = { x: 0, y: 0, z: 0 }

  if (intent.forward) addToVector(move, basis.forward, 1)
  if (intent.backward) addToVector(move, basis.forward, -1)
  if (intent.right) addToVector(move, basis.right, 1)
  if (intent.left) addToVector(move, basis.right, -1)
  if (intent.up) addToVector(move, basis.up, 1)
  if (intent.down) addToVector(move, basis.up, -1)

  const length = Math.hypot(move.x, move.y, move.z)
  if (length <= Number.EPSILON) return null

  return {
    x: move.x / length,
    y: move.y / length,
    z: move.z / length,
  }
}

function addToVector(target: SiteMapFlyVector, vector: SiteMapFlyVector, scale: number) {
  target.x += vector.x * scale
  target.y += vector.y * scale
  target.z += vector.z * scale
}
