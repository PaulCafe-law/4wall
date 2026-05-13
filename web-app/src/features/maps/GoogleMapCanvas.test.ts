import { render, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GoogleMapCanvas } from './GoogleMapCanvas'
import { launchPointMarkerLabel } from './map-labels'
import type { SiteMap } from '../../lib/types'

const googleMapsMock = vi.hoisted(() => {
  const overlay = { setMap: vi.fn(), addListener: vi.fn(() => ({ remove: vi.fn() })) }
  const map = {
    setCenter: vi.fn(),
    setZoom: vi.fn(),
    setMapTypeId: vi.fn(),
    addListener: vi.fn(() => ({ remove: vi.fn() })),
  }
  const maps = {
    Map: vi.fn(function mapConstructor() {
      return map
    }),
    Marker: vi.fn(function markerConstructor() {
      return { setMap: vi.fn(), addListener: vi.fn(() => ({ remove: vi.fn() })) }
    }),
    Polygon: vi.fn(function polygonConstructor() {
      return overlay
    }),
    Polyline: vi.fn(function polylineConstructor() {
      return overlay
    }),
    SymbolPath: {
      CIRCLE: 'circle',
    },
    event: {
      removeListener: vi.fn(),
    },
    map,
  }

  return maps
})

vi.mock('../../lib/google-maps', () => ({
  hasGoogleMapsApiKey: () => true,
  loadGoogleMapsApi: vi.fn(async () => googleMapsMock),
}))

const siteMap: SiteMap = {
  baseMapType: 'satellite',
  center: { lat: 25.034, lng: 121.565 },
  zoom: 18,
  version: 1,
  zones: [],
  launchPoints: [],
  viewpoints: [],
}

describe('GoogleMapCanvas viewport behavior', () => {
  beforeEach(() => {
    googleMapsMock.Map.mockClear()
    googleMapsMock.Marker.mockClear()
    googleMapsMock.Polygon.mockClear()
    googleMapsMock.Polyline.mockClear()
    googleMapsMock.map.setCenter.mockClear()
    googleMapsMock.map.setZoom.mockClear()
    googleMapsMock.map.setMapTypeId.mockClear()
    googleMapsMock.event.removeListener.mockClear()
    window.google = { maps: googleMapsMock }
  })

  it('does not recenter the map when editable waypoints move within the same route', async () => {
    const firstWaypoint = {
      kind: 'transit' as const,
      lat: 25.0341,
      lng: 121.5651,
      altitudeM: 10,
      label: '航點 1',
      headingDeg: 0,
      dwellSeconds: 0,
    }

    const { rerender } = render(
      createElement(GoogleMapCanvas, {
        siteMap,
        viewportKey: 'site-1:route-1',
        internalEditable: true,
        editableWaypoints: [firstWaypoint],
        routeOverlays: [{ routeId: 'route-1', name: 'route', path: [firstWaypoint], active: true }],
      }),
    )

    await waitFor(() => expect(googleMapsMock.map.setCenter).toHaveBeenCalledTimes(1))

    const movedWaypoint = { ...firstWaypoint, lat: 25.036, lng: 121.568 }
    rerender(
      createElement(GoogleMapCanvas, {
        siteMap,
        viewportKey: 'site-1:route-1',
        internalEditable: true,
        editableWaypoints: [movedWaypoint],
        routeOverlays: [{ routeId: 'route-1', name: 'route', path: [movedWaypoint], active: true }],
      }),
    )

    expect(googleMapsMock.map.setCenter).toHaveBeenCalledTimes(1)

    rerender(
      createElement(GoogleMapCanvas, {
        siteMap,
        viewportKey: 'site-1:route-2',
        internalEditable: true,
        editableWaypoints: [movedWaypoint],
        routeOverlays: [{ routeId: 'route-2', name: 'route', path: [movedWaypoint], active: true }],
      }),
    )

    await waitFor(() => expect(googleMapsMock.map.setCenter).toHaveBeenCalledTimes(2))
  })
})

describe('GoogleMapCanvas marker labels', () => {
  it('labels a route-owned launch point as L instead of L1', () => {
    expect(launchPointMarkerLabel(0, 1)).toBe('L')
  })

  it('keeps numeric suffixes only when multiple legacy launch points are explicitly rendered', () => {
    expect(launchPointMarkerLabel(0, 2)).toBe('L1')
    expect(launchPointMarkerLabel(1, 2)).toBe('L2')
  })
})
