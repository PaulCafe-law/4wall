import { describe, expect, it } from 'vitest'

import { launchPointMarkerLabel } from './map-labels'

describe('GoogleMapCanvas marker labels', () => {
  it('labels a route-owned launch point as L instead of L1', () => {
    expect(launchPointMarkerLabel(0, 1)).toBe('L')
  })

  it('keeps numeric suffixes only when multiple legacy launch points are explicitly rendered', () => {
    expect(launchPointMarkerLabel(0, 2)).toBe('L1')
    expect(launchPointMarkerLabel(1, 2)).toBe('L2')
  })
})
