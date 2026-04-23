import { useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'

import {
  hasGoogleMapsApiKey,
  loadGoogleMapsApi,
  type GoogleMapsApi,
  type GoogleMapsListener,
  type GoogleMapsMap,
  type GoogleMapsMouseEvent,
  type GoogleMapsOverlay,
} from '../../lib/google-maps'
import type { InspectionViewpoint, InspectionWaypoint, LaunchPoint, SiteMap } from '../../lib/types'
import { launchPointMarkerLabel } from './map-labels'

type LatLngPoint = {
  lat: number
  lng: number
}

export type RouteOverlay = {
  routeId: string
  name: string
  path: LatLngPoint[]
  active?: boolean
}

function routeWaypointColor(kind: InspectionWaypoint['kind']) {
  if (kind === 'hold') return '#596b55'
  return '#1f2b3a'
}

function launchPointColor(kind: LaunchPoint['kind']) {
  return kind === 'backup' ? '#596b55' : '#1f2b3a'
}

function viewpointColor(purpose: InspectionViewpoint['purpose']) {
  if (purpose === 'detail') return '#c76a28'
  if (purpose === 'overview') return '#41658a'
  return '#8c5a2b'
}

function makeMarker(
  maps: GoogleMapsApi,
  map: GoogleMapsMap,
  position: LatLngPoint,
  label: string,
  color: string,
  draggable: boolean,
) {
  return new maps.Marker({
    map,
    position,
    draggable,
    label: {
      text: label,
      color: '#ffffff',
      fontWeight: '700',
    },
    icon: {
      path: maps.SymbolPath.CIRCLE,
      fillColor: color,
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2,
      scale: 10,
    },
  })
}

export function GoogleMapCanvas({
  siteMap,
  routeOverlays = [],
  editableWaypoints,
  editableLaunchPoints,
  editableViewpoints,
  showViewpoints = false,
  internalEditable = false,
  onWaypointMove,
  onLaunchPointMove,
  onViewpointMove,
  onMapClick,
  className,
}: {
  siteMap: SiteMap
  routeOverlays?: RouteOverlay[]
  editableWaypoints?: InspectionWaypoint[]
  editableLaunchPoints?: LaunchPoint[]
  editableViewpoints?: InspectionViewpoint[]
  showViewpoints?: boolean
  internalEditable?: boolean
  onWaypointMove?: (index: number, point: LatLngPoint) => void
  onLaunchPointMove?: (index: number, point: LatLngPoint) => void
  onViewpointMove?: (index: number, point: LatLngPoint) => void
  onMapClick?: (point: LatLngPoint) => void
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<GoogleMapsMap | null>(null)
  const overlaysRef = useRef<GoogleMapsOverlay[]>([])
  const clickListenerRef = useRef<GoogleMapsListener | null>(null)
  const onWaypointMoveRef = useRef(onWaypointMove)
  const onLaunchPointMoveRef = useRef(onLaunchPointMove)
  const onViewpointMoveRef = useRef(onViewpointMove)
  const onMapClickRef = useRef(onMapClick)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    hasGoogleMapsApiKey() ? 'loading' : 'error',
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(
    hasGoogleMapsApiKey()
      ? null
      : '缺少 VITE_GOOGLE_MAPS_API_KEY，Google Maps 編輯器會以 fail-closed 方式停用。',
  )

  const renderModel = useMemo(
    () => ({
      siteMap,
      routeOverlays,
      editableWaypoints: editableWaypoints ?? null,
      editableLaunchPoints: editableLaunchPoints ?? null,
      editableViewpoints: editableViewpoints ?? null,
      showViewpoints,
    }),
    [editableLaunchPoints, editableViewpoints, editableWaypoints, routeOverlays, showViewpoints, siteMap],
  )

  useEffect(() => {
    onWaypointMoveRef.current = onWaypointMove
  }, [onWaypointMove])

  useEffect(() => {
    onLaunchPointMoveRef.current = onLaunchPointMove
  }, [onLaunchPointMove])

  useEffect(() => {
    onViewpointMoveRef.current = onViewpointMove
  }, [onViewpointMove])

  useEffect(() => {
    onMapClickRef.current = onMapClick
  }, [onMapClick])

  useEffect(() => {
    let cancelled = false

    if (!hasGoogleMapsApiKey()) {
      return
    }

    void loadGoogleMapsApi()
      .then((maps) => {
        if (cancelled || !containerRef.current) return
        if (!mapRef.current) {
          mapRef.current = new maps.Map(containerRef.current, {
            center: siteMap.center,
            zoom: siteMap.zoom,
            mapTypeId: siteMap.baseMapType,
            streetViewControl: false,
            fullscreenControl: false,
            mapTypeControl: true,
          })
        }
        setStatus('ready')
        setErrorMessage(null)
      })
      .catch(() => {
        if (cancelled) return
        setStatus('error')
        setErrorMessage(
          'Google Maps 載入失敗。請確認 API key、referrer 限制與網域設定是否正確。',
        )
      })

    return () => {
      cancelled = true
    }
  }, [siteMap.baseMapType, siteMap.center, siteMap.zoom])

  useEffect(() => {
    if (status !== 'ready' || !mapRef.current || !window.google?.maps) {
      return
    }

    const maps = window.google.maps
    const map = mapRef.current
    const {
      siteMap: visibleSiteMap,
      routeOverlays: visibleRoutes,
      editableWaypoints: visibleWaypoints,
      editableLaunchPoints: visibleLaunchPoints,
      editableViewpoints: visibleViewpoints,
      showViewpoints: shouldShowViewpoints,
    } = renderModel

    map.setCenter(visibleSiteMap.center)
    map.setZoom(visibleSiteMap.zoom)
    map.setMapTypeId(visibleSiteMap.baseMapType)

    overlaysRef.current.forEach((overlay) => overlay.setMap(null))
    overlaysRef.current = []

    for (const zone of visibleSiteMap.zones) {
      const polygon = new maps.Polygon({
        map,
        paths: zone.polygon,
        strokeColor: '#c76a28',
        strokeOpacity: 0.9,
        strokeWeight: 2,
        fillColor: '#f3d3ba',
        fillOpacity: 0.18,
      })
      overlaysRef.current.push(polygon)
    }

    const launchPoints = visibleLaunchPoints ?? visibleSiteMap.launchPoints
    for (const [index, launchPoint] of launchPoints.entries()) {
      const marker = makeMarker(
        maps,
        map,
        { lat: launchPoint.lat, lng: launchPoint.lng },
        launchPointMarkerLabel(index, launchPoints.length),
        launchPointColor(launchPoint.kind),
        internalEditable && Boolean(visibleLaunchPoints),
      )
      if (internalEditable && visibleLaunchPoints && onLaunchPointMoveRef.current) {
        marker.addListener('dragend', (event: GoogleMapsMouseEvent) => {
          const latLng = event?.latLng
          if (!latLng) return
          onLaunchPointMoveRef.current?.(index, { lat: latLng.lat(), lng: latLng.lng() })
        })
      }
      overlaysRef.current.push(marker)
    }

    const viewpoints = shouldShowViewpoints ? (visibleViewpoints ?? visibleSiteMap.viewpoints) : []
    for (const [index, viewpoint] of viewpoints.entries()) {
      const marker = makeMarker(
        maps,
        map,
        { lat: viewpoint.lat, lng: viewpoint.lng },
        `V${index + 1}`,
        viewpointColor(viewpoint.purpose),
        internalEditable && Boolean(visibleViewpoints),
      )
      if (internalEditable && visibleViewpoints && onViewpointMoveRef.current) {
        marker.addListener('dragend', (event: GoogleMapsMouseEvent) => {
          const latLng = event?.latLng
          if (!latLng) return
          onViewpointMoveRef.current?.(index, { lat: latLng.lat(), lng: latLng.lng() })
        })
      }
      overlaysRef.current.push(marker)
    }

    for (const route of visibleRoutes) {
      const polyline = new maps.Polyline({
        map,
        path: route.path,
        strokeColor: route.active ? '#c76a28' : '#1f2b3a',
        strokeOpacity: route.active ? 0.95 : 0.55,
        strokeWeight: route.active ? 4 : 3,
      })
      overlaysRef.current.push(polyline)
    }

    for (const [index, waypoint] of (visibleWaypoints ?? []).entries()) {
      const marker = makeMarker(
        maps,
        map,
        { lat: waypoint.lat, lng: waypoint.lng },
        String(index + 1),
        routeWaypointColor(waypoint.kind),
        internalEditable,
      )
      if (internalEditable && onWaypointMoveRef.current) {
        marker.addListener('dragend', (event: GoogleMapsMouseEvent) => {
          const latLng = event?.latLng
          if (!latLng) return
          onWaypointMoveRef.current?.(index, { lat: latLng.lat(), lng: latLng.lng() })
        })
      }
      overlaysRef.current.push(marker)
    }

    if (clickListenerRef.current) {
      maps.event.removeListener(clickListenerRef.current)
      clickListenerRef.current = null
    }
    if (internalEditable && onMapClickRef.current) {
      clickListenerRef.current = map.addListener('click', (event: GoogleMapsMouseEvent) => {
        const latLng = event?.latLng
        if (!latLng) return
        onMapClickRef.current?.({ lat: latLng.lat(), lng: latLng.lng() })
      })
    }

    return () => {
      if (clickListenerRef.current) {
        maps.event.removeListener(clickListenerRef.current)
        clickListenerRef.current = null
      }
    }
  }, [internalEditable, renderModel, status])

  if (status === 'error') {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
        {errorMessage}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className={clsx(
          'h-[26rem] w-full rounded-[1.5rem] border border-chrome-200 bg-chrome-100',
          status === 'loading' ? 'animate-pulse' : '',
          className,
        )}
      />
      {status === 'loading' ? (
        <p className="text-sm text-chrome-700">Google Maps 載入中…</p>
      ) : (
        <p className="text-sm text-chrome-700">
          {internalEditable
            ? '內部人員可在地圖上拖拉起降點與巡邏航點，並把航線幾何儲存回控制平面。'
            : '目前顯示場域中心、已發布航線與起降點。'}
        </p>
      )}
    </div>
  )
}
