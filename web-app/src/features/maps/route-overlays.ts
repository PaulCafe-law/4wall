import type { InspectionRoute } from '../../lib/types'

export function routeOverlaysFromRoutes(routes: InspectionRoute[]) {
  return routes.map((route) => ({
    routeId: route.routeId,
    name: route.name,
    path:
      route.previewPolyline.length > 0
        ? route.previewPolyline
        : route.waypoints.map((waypoint) => ({ lat: waypoint.lat, lng: waypoint.lng })),
    active: false,
  }))
}
