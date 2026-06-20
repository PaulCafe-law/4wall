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

const DEGREES_TO_RAD = Math.PI / 180

export function createNoRollFlyBasis(yawDegrees: number, pitchDegrees: number): SiteMapFlyBasis {
  const yawRadians = yawDegrees * DEGREES_TO_RAD
  const pitchRadians = pitchDegrees * DEGREES_TO_RAD
  const sinYaw = Math.sin(yawRadians)
  const cosYaw = Math.cos(yawRadians)
  const sinPitch = Math.sin(pitchRadians)
  const cosPitch = Math.cos(pitchRadians)

  const forward = normalizeFlyVector({
    x: -sinYaw * cosPitch,
    y: sinPitch,
    z: -cosYaw * cosPitch,
  })
  const right = normalizeFlyVector({
    x: cosYaw,
    y: 0,
    z: -sinYaw,
  })

  return {
    forward,
    right,
    up: normalizeFlyVector(crossFlyVectors(right, forward)),
  }
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

function crossFlyVectors(left: SiteMapFlyVector, right: SiteMapFlyVector): SiteMapFlyVector {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  }
}

function normalizeFlyVector(vector: SiteMapFlyVector): SiteMapFlyVector {
  const length = Math.hypot(vector.x, vector.y, vector.z)
  if (length <= Number.EPSILON) return { x: 0, y: 0, z: 0 }
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  }
}
