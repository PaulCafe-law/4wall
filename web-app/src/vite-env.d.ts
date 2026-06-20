/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_APP_ENVIRONMENT?: string
  readonly VITE_GOOGLE_MAPS_API_KEY?: string
}

declare module 'playcanvas/scripts/esm/camera-controls.mjs' {
  import type { Script } from 'playcanvas'

  export const CameraControls: typeof Script
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  __FOUR_WALL_RUNTIME_CONFIG__?: {
    googleMapsApiKey?: string
  }
}
