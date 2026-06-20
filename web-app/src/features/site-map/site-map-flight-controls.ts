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

export type SiteMapFlyUpAxis = 'y' | 'z'

export type SiteMapFlyAngles = {
  yawDegrees: number
  pitchDegrees: number
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
const RAD_TO_DEGREES = 180 / Math.PI

export function createNoRollFlyBasis(
  yawDegrees: number,
  pitchDegrees: number,
  upAxis: SiteMapFlyUpAxis = 'y',
): SiteMapFlyBasis {
  const yawRadians = yawDegrees * DEGREES_TO_RAD
  const pitchRadians = pitchDegrees * DEGREES_TO_RAD
  const sinPitch = Math.sin(pitchRadians)
  const cosPitch = Math.cos(pitchRadians)
  const { baseForward, baseRight, worldUp } = getFlyAxisConfig(upAxis)
  const flatForward = normalizeFlyVector(
    addFlyVectors(
      scaleFlyVector(baseForward, Math.cos(yawRadians)),
      scaleFlyVector(baseRight, -Math.sin(yawRadians)),
    ),
  )

  const forward = normalizeFlyVector({
    x: flatForward.x * cosPitch + worldUp.x * sinPitch,
    y: flatForward.y * cosPitch + worldUp.y * sinPitch,
    z: flatForward.z * cosPitch + worldUp.z * sinPitch,
  })
  const right = normalizeFlyVector(crossFlyVectors(flatForward, worldUp))

  return {
    forward,
    right,
    up: normalizeFlyVector(crossFlyVectors(right, forward)),
  }
}

export function createFlyAnglesFromDirection(
  direction: SiteMapFlyVector,
  upAxis: SiteMapFlyUpAxis = 'y',
): SiteMapFlyAngles {
  const normalized = normalizeFlyVector(direction)
  if (isZeroFlyVector(normalized)) return { yawDegrees: 0, pitchDegrees: 0 }

  const { baseForward, baseRight, worldUp } = getFlyAxisConfig(upAxis)
  const pitchSin = clampFlyNumber(dotFlyVectors(normalized, worldUp), -1, 1)
  const pitchDegrees = Math.asin(pitchSin) * RAD_TO_DEGREES
  const flatForward = normalizeFlyVector({
    x: normalized.x - worldUp.x * pitchSin,
    y: normalized.y - worldUp.y * pitchSin,
    z: normalized.z - worldUp.z * pitchSin,
  })

  if (isZeroFlyVector(flatForward)) return { yawDegrees: 0, pitchDegrees }

  return {
    yawDegrees: Math.atan2(
      -dotFlyVectors(flatForward, baseRight),
      dotFlyVectors(flatForward, baseForward),
    ) * RAD_TO_DEGREES,
    pitchDegrees,
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

function addFlyVectors(left: SiteMapFlyVector, right: SiteMapFlyVector): SiteMapFlyVector {
  return {
    x: left.x + right.x,
    y: left.y + right.y,
    z: left.z + right.z,
  }
}

function scaleFlyVector(vector: SiteMapFlyVector, scale: number): SiteMapFlyVector {
  return {
    x: vector.x * scale,
    y: vector.y * scale,
    z: vector.z * scale,
  }
}

function dotFlyVectors(left: SiteMapFlyVector, right: SiteMapFlyVector) {
  return left.x * right.x + left.y * right.y + left.z * right.z
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

function isZeroFlyVector(vector: SiteMapFlyVector) {
  return Math.hypot(vector.x, vector.y, vector.z) <= Number.EPSILON
}

function clampFlyNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getFlyAxisConfig(upAxis: SiteMapFlyUpAxis) {
  if (upAxis === 'z') {
    return {
      baseForward: { x: 0, y: -1, z: 0 },
      baseRight: { x: -1, y: 0, z: 0 },
      worldUp: { x: 0, y: 0, z: 1 },
    } satisfies Record<string, SiteMapFlyVector>
  }

  return {
    baseForward: { x: 0, y: 0, z: -1 },
    baseRight: { x: 1, y: 0, z: 0 },
    worldUp: { x: 0, y: 1, z: 0 },
  } satisfies Record<string, SiteMapFlyVector>
}
