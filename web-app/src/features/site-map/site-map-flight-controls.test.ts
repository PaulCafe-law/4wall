import { describe, expect, it } from 'vitest'

import {
  composeViewRelativeFlyMove,
  createFlyAnglesFromDirection,
  createNoRollFlyBasis,
  type SiteMapFlyBasis,
  type SiteMapFlyVector,
} from './site-map-flight-controls'

const tiltedCameraBasis: SiteMapFlyBasis = {
  forward: { x: 0, y: -0.6, z: -0.8 },
  right: { x: 1, y: 0, z: 0 },
  up: { x: 0, y: 0.8, z: -0.6 },
}

describe('composeViewRelativeFlyMove', () => {
  it('uses the current camera up vector for E/Q instead of the world Y axis', () => {
    expectVectorToBeClose(composeViewRelativeFlyMove(tiltedCameraBasis, { up: true }), tiltedCameraBasis.up)
    expectVectorToBeClose(composeViewRelativeFlyMove(tiltedCameraBasis, { down: true }), {
      x: -tiltedCameraBasis.up.x,
      y: -tiltedCameraBasis.up.y,
      z: -tiltedCameraBasis.up.z,
    })
  })

  it('uses the current camera forward vector for W/S', () => {
    expectVectorToBeClose(composeViewRelativeFlyMove(tiltedCameraBasis, { forward: true }), tiltedCameraBasis.forward)
    expectVectorToBeClose(composeViewRelativeFlyMove(tiltedCameraBasis, { backward: true }), {
      x: -tiltedCameraBasis.forward.x,
      y: -tiltedCameraBasis.forward.y,
      z: -tiltedCameraBasis.forward.z,
    })
  })

  it('normalizes combined view-relative motion', () => {
    const move = composeViewRelativeFlyMove(tiltedCameraBasis, { forward: true, up: true })

    expect(move).not.toBeNull()
    expect(Math.hypot(move!.x, move!.y, move!.z)).toBeCloseTo(1)
    expect(move!.z).toBeLessThan(tiltedCameraBasis.forward.z)
  })

  it('returns no motion when opposing keys cancel each other', () => {
    expect(composeViewRelativeFlyMove(tiltedCameraBasis, { forward: true, backward: true })).toBeNull()
    expect(composeViewRelativeFlyMove(tiltedCameraBasis, { up: true, down: true })).toBeNull()
  })
})

describe('createNoRollFlyBasis', () => {
  it('keeps the camera horizontal axis level while looking around', () => {
    for (const [yaw, pitch] of [
      [0, 0],
      [-32, 0],
      [48, 0],
      [-32, 28],
      [48, -36],
    ]) {
      const basis = createNoRollFlyBasis(yaw, pitch)

      expect(basis.right.y).toBeCloseTo(0)
      expectVectorLengthToBeOne(basis.forward)
      expectVectorLengthToBeOne(basis.right)
      expectVectorLengthToBeOne(basis.up)
      expect(dotFlyVectors(basis.forward, basis.right)).toBeCloseTo(0)
      expect(dotFlyVectors(basis.forward, basis.up)).toBeCloseTo(0)
      expect(dotFlyVectors(basis.right, basis.up)).toBeCloseTo(0)
    }
  })

  it('turns the view right when the yaw angle decreases', () => {
    const basis = createNoRollFlyBasis(-20, 0)

    expect(basis.forward.x).toBeGreaterThan(0)
    expect(basis.forward.z).toBeLessThan(0)
  })

  it('keeps a z-up SOG room upright while yawing from a standing floor view', () => {
    for (const yaw of [0, -24, 38]) {
      const basis = createNoRollFlyBasis(yaw, 0, 'z')

      expectVectorLengthToBeOne(basis.forward)
      expectVectorLengthToBeOne(basis.right)
      expectVectorLengthToBeOne(basis.up)
      expect(basis.up.x).toBeCloseTo(0)
      expect(basis.up.y).toBeCloseTo(0)
      expect(basis.up.z).toBeCloseTo(1)
      expect(dotFlyVectors(basis.forward, basis.right)).toBeCloseTo(0)
      expect(dotFlyVectors(basis.forward, basis.up)).toBeCloseTo(0)
      expect(dotFlyVectors(basis.right, basis.up)).toBeCloseTo(0)
    }
  })

  it('turns a z-up SOG view right when the yaw angle decreases', () => {
    const basis = createNoRollFlyBasis(-20, 0, 'z')

    expect(basis.forward.x).toBeLessThan(0)
    expect(basis.forward.y).toBeLessThan(0)
    expect(basis.up.z).toBeCloseTo(1)
  })
})

describe('createFlyAnglesFromDirection', () => {
  it('round-trips y-up GLB look directions', () => {
    const basis = createNoRollFlyBasis(-32, 28)
    const angles = createFlyAnglesFromDirection(basis.forward)

    expect(angles.yawDegrees).toBeCloseTo(-32)
    expect(angles.pitchDegrees).toBeCloseTo(28)
  })

  it('round-trips z-up SOG look directions', () => {
    const basis = createNoRollFlyBasis(-32, 28, 'z')
    const angles = createFlyAnglesFromDirection(basis.forward, 'z')

    expect(angles.yawDegrees).toBeCloseTo(-32)
    expect(angles.pitchDegrees).toBeCloseTo(28)
  })

  it('treats the rent-house overhead camera as looking down the z axis', () => {
    const angles = createFlyAnglesFromDirection({ x: 0, y: -0.18, z: -1 }, 'z')

    expect(angles.yawDegrees).toBeCloseTo(0)
    expect(angles.pitchDegrees).toBeLessThan(-75)
  })
})

function expectVectorToBeClose(
  actual: ReturnType<typeof composeViewRelativeFlyMove>,
  expected: NonNullable<ReturnType<typeof composeViewRelativeFlyMove>>,
) {
  expect(actual).not.toBeNull()
  expect(actual!.x).toBeCloseTo(expected.x)
  expect(actual!.y).toBeCloseTo(expected.y)
  expect(actual!.z).toBeCloseTo(expected.z)
}

function expectVectorLengthToBeOne(vector: SiteMapFlyVector) {
  expect(Math.hypot(vector.x, vector.y, vector.z)).toBeCloseTo(1)
}

function dotFlyVectors(left: SiteMapFlyVector, right: SiteMapFlyVector) {
  return left.x * right.x + left.y * right.y + left.z * right.z
}
