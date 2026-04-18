export type GoogleMapsMouseEvent = {
  latLng?: {
    lat: () => number
    lng: () => number
  } | null
}

export type GoogleMapsListener = {
  remove?: () => void
}

export type GoogleMapsOverlay = {
  setMap: (map: unknown | null) => void
}

export type GoogleMapsMap = {
  setCenter: (center: { lat: number; lng: number }) => void
  setZoom: (zoom: number) => void
  setMapTypeId: (mapTypeId: string) => void
  addListener: (eventName: string, callback: (event: GoogleMapsMouseEvent) => void) => GoogleMapsListener
}

export type GoogleMapsApi = {
  Map: new (
    element: HTMLElement,
    options: {
      center: { lat: number; lng: number }
      zoom: number
      mapTypeId: string
      streetViewControl: boolean
      fullscreenControl: boolean
      mapTypeControl: boolean
    },
  ) => GoogleMapsMap
  Marker: new (options: Record<string, unknown>) => GoogleMapsOverlay & {
    addListener: (eventName: string, callback: (event: GoogleMapsMouseEvent) => void) => GoogleMapsListener
  }
  Polygon: new (options: Record<string, unknown>) => GoogleMapsOverlay
  Polyline: new (options: Record<string, unknown>) => GoogleMapsOverlay
  SymbolPath: {
    CIRCLE: unknown
  }
  event: {
    removeListener: (listener: GoogleMapsListener) => void
  }
}

const GOOGLE_MAPS_SCRIPT_ID = 'four-wall-google-maps-script'

declare global {
  interface Window {
    google?: {
      maps?: GoogleMapsApi
    }
    __fourWallGoogleMapsReady__?: () => void
  }
}

let loaderPromise: Promise<GoogleMapsApi> | null = null

export function getGoogleMapsApiKey() {
  return import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? ''
}

export function hasGoogleMapsApiKey() {
  return getGoogleMapsApiKey().length > 0
}

export async function loadGoogleMapsApi(): Promise<GoogleMapsApi> {
  if (window.google?.maps) {
    return window.google.maps
  }

  if (loaderPromise) {
    return loaderPromise
  }

  const apiKey = getGoogleMapsApiKey()
  if (!apiKey) {
    throw new Error('missing_google_maps_api_key')
  }

  loaderPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => {
        if (window.google?.maps) {
          resolve(window.google.maps)
          return
        }
        reject(new Error('google_maps_api_unavailable'))
      })
      existing.addEventListener('error', () => reject(new Error('google_maps_load_failed')))
      return
    }

    const script = document.createElement('script')
    script.id = GOOGLE_MAPS_SCRIPT_ID
    script.async = true
    script.defer = true
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&callback=__fourWallGoogleMapsReady__`

    window.__fourWallGoogleMapsReady__ = () => {
      if (window.google?.maps) {
        resolve(window.google.maps)
        return
      }
      reject(new Error('google_maps_api_unavailable'))
    }

    script.addEventListener('error', () => reject(new Error('google_maps_load_failed')))
    document.head.appendChild(script)
  })

  return loaderPromise
}
