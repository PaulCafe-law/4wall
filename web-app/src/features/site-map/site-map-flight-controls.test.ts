import { describe, expect, it } from 'vitest'

import { composeViewRelativeFlyMove, type SiteMapFlyBasis } from './site-map-flight-controls'

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

function expectVectorToBeClose(
  actual: ReturnType<typeof composeViewRelativeFlyMove>,
  expected: NonNullable<ReturnType<typeof composeViewRelativeFlyMove>>,
) {
  expect(actual).not.toBeNull()
  expect(actual!.x).toBeCloseTo(expected.x)
  expect(actual!.y).toBeCloseTo(expected.y)
  expect(actual!.z).toBeCloseTo(expected.z)
}
