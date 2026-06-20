import { useEffect, useMemo, useState } from 'react'
import { Application, Entity } from '@playcanvas/react'
import { Camera, GSplat, Script } from '@playcanvas/react/components'
import { useSplat } from '@playcanvas/react/hooks'
import { FILLMODE_NONE, RESOLUTION_AUTO, Vec3, type Asset } from 'playcanvas'
import { CameraControls } from 'playcanvas/scripts/esm/camera-controls.mjs'

type SogViewerState = 'waiting' | 'loading' | 'loaded' | 'error'
type Vec3Tuple = [number, number, number]
type CameraFrame = {
  focus: Vec3Tuple
  position: Vec3Tuple
  radius: number
}
type SogResourceWithBounds = {
  aabb?: {
    center: { x: number; y: number; z: number }
    halfExtents: { x: number; y: number; z: number }
  }
}

const SOG_MODEL_POSITION: Vec3Tuple = [0, -0.7, 0]
const SOG_MODEL_ROTATION_Z_DEGREES = 180
const SOG_CAMERA_FOV_DEGREES = 58
const DEFAULT_CAMERA_FRAME: CameraFrame = {
  focus: [0, 0, 0],
  position: [0, 0.4, 3.4],
  radius: 4,
}

export function SiteMapSogViewer({
  assetUrl,
  siteLabel,
  modelAssetPath,
  manifestLoading,
  manifestError,
}: {
  assetUrl: string | null
  siteLabel: string
  modelAssetPath: string
  manifestLoading: boolean
  manifestError: boolean
}) {
  const [viewerState, setViewerState] = useState<SogViewerState>(assetUrl ? 'loading' : 'waiting')
  const [cameraFrame, setCameraFrame] = useState<CameraFrame>(DEFAULT_CAMERA_FRAME)
  const cameraFocus = useMemo(() => new Vec3(...cameraFrame.focus), [cameraFrame.focus])

  useEffect(() => {
    setViewerState(assetUrl ? 'loading' : 'waiting')
    setCameraFrame(DEFAULT_CAMERA_FRAME)
  }, [assetUrl])

  if (import.meta.env.MODE === 'test') {
    return (
      <div className="relative min-h-[34rem] overflow-hidden rounded-[1.5rem] border border-chrome-200 bg-chrome-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_36%_30%,rgba(111,143,132,0.32),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.10),transparent_45%)]" />
        <div className="absolute left-4 top-4 rounded-full border border-white/20 bg-white/10 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-white">
          SOG 場域測試模式
        </div>
        <div className="absolute bottom-4 left-4 max-w-md rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-xs leading-5 text-white/85">
          {siteLabel} 會在瀏覽器中以 PlayCanvas 載入 `{modelAssetPath}`。
        </div>
      </div>
    )
  }

  const statusLabel =
    viewerState === 'loaded'
      ? 'SOG 場域已載入'
      : viewerState === 'error' || manifestError
        ? 'SOG 場域無法載入'
        : manifestLoading || viewerState === 'loading'
          ? 'SOG 場域載入中'
          : '等待模型載入資訊'

  return (
    <div className="relative min-h-[34rem] overflow-hidden rounded-[1.5rem] border border-chrome-200 bg-chrome-950">
      {assetUrl ? (
        <Application
          className="absolute inset-0 h-full w-full"
          style={{ width: '100%', height: '100%' }}
          fillMode={FILLMODE_NONE}
          resolutionMode={RESOLUTION_AUTO}
          graphicsDeviceOptions={{ antialias: false }}
        >
          <Entity name="Camera" position={cameraFrame.position}>
            <Camera fov={SOG_CAMERA_FOV_DEGREES} nearClip={0.01} farClip={Math.max(1000, cameraFrame.radius * 8)} />
            <Script
              script={CameraControls}
              focusPoint={cameraFocus}
              moveSpeed={Math.max(2, cameraFrame.radius * 0.9)}
              moveFastSpeed={Math.max(4, cameraFrame.radius * 1.8)}
              moveSlowSpeed={Math.max(0.5, cameraFrame.radius * 0.35)}
              zoomSpeed={Math.max(0.001, cameraFrame.radius * 0.00045)}
            />
          </Entity>
          <RentHouseSogAsset
            assetUrl={assetUrl}
            onCameraFrameChange={setCameraFrame}
            onStateChange={setViewerState}
          />
        </Application>
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_36%_30%,rgba(111,143,132,0.32),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.10),transparent_45%)]" />
      )}

      <div className="absolute left-4 top-4 rounded-full border border-white/20 bg-white/10 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-white shadow-panel backdrop-blur">
        {statusLabel}
      </div>
      {viewerState !== 'loaded' || manifestError ? (
        <div className="absolute bottom-4 left-4 max-w-md rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-xs leading-5 text-white/85 shadow-panel backdrop-blur">
          {manifestError
            ? '無法取得私人場域模型。請確認帳號權限、API 設定與 R2 asset key。'
            : `${siteLabel} 是管理者限定的私人 3DGS 場域，登入後會自動載入模型檔。`}
        </div>
      ) : null}
    </div>
  )
}

function RentHouseSogAsset({
  assetUrl,
  onCameraFrameChange,
  onStateChange,
}: {
  assetUrl: string
  onCameraFrameChange: (frame: CameraFrame) => void
  onStateChange: (state: SogViewerState) => void
}) {
  const { asset, loading, error } = useSplat(assetUrl)

  useEffect(() => {
    if (error) {
      onStateChange('error')
      return
    }
    if (loading || !asset) {
      onStateChange('loading')
      return
    }
    onCameraFrameChange(createCameraFrameForSogAsset(asset))
    onStateChange('loaded')
  }, [asset, error, loading, onCameraFrameChange, onStateChange])

  if (!asset) return null

  return (
    <Entity name="Rent House SOG" rotation={[0, 0, SOG_MODEL_ROTATION_Z_DEGREES]} position={SOG_MODEL_POSITION}>
      <GSplat asset={asset} unified />
    </Entity>
  )
}

function createCameraFrameForSogAsset(asset: Asset): CameraFrame {
  const aabb = (asset.resource as SogResourceWithBounds | null | undefined)?.aabb
  if (!aabb) return DEFAULT_CAMERA_FRAME

  const worldCenter = transformSogCenterToWorld([aabb.center.x, aabb.center.y, aabb.center.z])
  const radius = Math.max(
    1,
    Math.hypot(aabb.halfExtents.x, aabb.halfExtents.y, aabb.halfExtents.z),
  )
  const fovRadians = SOG_CAMERA_FOV_DEGREES * (Math.PI / 180)
  const distance = Math.max(4, (radius / Math.sin(fovRadians / 2)) * 1.15)

  return {
    focus: worldCenter,
    position: [worldCenter[0], worldCenter[1] + radius * 0.18, worldCenter[2] + distance],
    radius,
  }
}

function transformSogCenterToWorld(center: Vec3Tuple): Vec3Tuple {
  const radians = SOG_MODEL_ROTATION_Z_DEGREES * (Math.PI / 180)
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)

  return [
    center[0] * cos - center[1] * sin + SOG_MODEL_POSITION[0],
    center[0] * sin + center[1] * cos + SOG_MODEL_POSITION[1],
    center[2] + SOG_MODEL_POSITION[2],
  ]
}
