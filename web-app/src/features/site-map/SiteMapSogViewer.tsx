import { useEffect, useMemo, useState } from 'react'
import { Application, Entity } from '@playcanvas/react'
import { Camera, GSplat, Script as PlayCanvasScript } from '@playcanvas/react/components'
import { useSplat } from '@playcanvas/react/hooks'
import {
  EVENT_MOUSEDOWN,
  EVENT_MOUSEMOVE,
  EVENT_MOUSEUP,
  EVENT_TOUCHCANCEL,
  EVENT_TOUCHEND,
  EVENT_TOUCHMOVE,
  EVENT_TOUCHSTART,
  FILLMODE_NONE,
  MOUSEBUTTON_LEFT,
  MOUSEBUTTON_MIDDLE,
  MOUSEBUTTON_RIGHT,
  RESOLUTION_AUTO,
  Script as PlayCanvasBaseScript,
  Vec2,
  Vec3,
  type Asset,
  type MouseEvent as PlayCanvasMouseEvent,
  type TouchEvent as PlayCanvasTouchEvent,
} from 'playcanvas'

type SogViewerState = 'waiting' | 'loading' | 'loaded' | 'error'
type Vec3Tuple = [number, number, number]
type CameraFrame = {
  focus: Vec3Tuple
  position: Vec3Tuple
  radius: number
}
type SiteMapSogViewerProps = {
  assetUrl: string | null
  siteLabel: string
  modelAssetPath: string
  manifestLoading: boolean
  manifestError: boolean
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
const SOG_ORBIT_MIN_POLAR_ANGLE = 0.08
const SOG_ORBIT_MAX_POLAR_ANGLE = Math.PI * 0.48
const SOG_ORBIT_ROTATE_SPEED = 0.0052
const SOG_ORBIT_ZOOM_SPEED = 0.12
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
}: SiteMapSogViewerProps) {
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

  return (
    <SiteMapSogViewerSession
      key={assetUrl ?? 'empty-sog-asset'}
      assetUrl={assetUrl}
      siteLabel={siteLabel}
      modelAssetPath={modelAssetPath}
      manifestLoading={manifestLoading}
      manifestError={manifestError}
    />
  )
}

function SiteMapSogViewerSession({
  assetUrl,
  siteLabel,
  manifestLoading,
  manifestError,
}: SiteMapSogViewerProps) {
  const [viewerState, setViewerState] = useState<SogViewerState>(assetUrl ? 'loading' : 'waiting')
  const [cameraFrame, setCameraFrame] = useState<CameraFrame>(DEFAULT_CAMERA_FRAME)
  const cameraFocus = useMemo(() => new Vec3(...cameraFrame.focus), [cameraFrame.focus])

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
            <PlayCanvasScript
              script={SiteMapOrbitControls}
              focusPoint={cameraFocus}
              sceneRadius={cameraFrame.radius}
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

class SiteMapOrbitControls extends PlayCanvasBaseScript {
  static scriptName = 'siteMapOrbitControls'

  focusPoint = new Vec3()
  sceneRadius = DEFAULT_CAMERA_FRAME.radius

  private readonly target = new Vec3()
  private readonly lastFocusPoint = new Vec3(Number.NaN, Number.NaN, Number.NaN)
  private readonly lastPointer = new Vec2()
  private readonly lastPinchMidPoint = new Vec2()
  private orbiting = false
  private panning = false
  private distance = DEFAULT_CAMERA_FRAME.radius
  private theta = 0
  private phi = Math.PI * 0.45
  private lastPinchDistance = 0
  private lastSceneRadius = Number.NaN
  private canvasElement: HTMLCanvasElement | null = null
  private readonly onDomWheel = (event: WheelEvent) => {
    if (event.deltaY === 0) return
    this.zoomByWheelDelta(event.deltaY > 0 ? 1 : -1)
    event.preventDefault()
    event.stopPropagation()
  }

  initialize() {
    this.target.copy(this.focusPoint)
    this.lastFocusPoint.copy(this.focusPoint)
    this.lastSceneRadius = this.sceneRadius
    this.syncFromCamera()
    this.applyCamera()

    this.app.mouse?.disableContextMenu()
    this.app.mouse?.on(EVENT_MOUSEDOWN, this.onMouseDown, this)
    this.app.mouse?.on(EVENT_MOUSEMOVE, this.onMouseMove, this)
    this.app.mouse?.on(EVENT_MOUSEUP, this.onMouseUp, this)
    this.app.touch?.on(EVENT_TOUCHSTART, this.onTouchStart, this)
    this.app.touch?.on(EVENT_TOUCHMOVE, this.onTouchMove, this)
    this.app.touch?.on(EVENT_TOUCHEND, this.onTouchEnd, this)
    this.app.touch?.on(EVENT_TOUCHCANCEL, this.onTouchEnd, this)
    this.canvasElement = getCanvasElement(this.app.graphicsDevice.canvas)
    this.canvasElement?.addEventListener('wheel', this.onDomWheel, { passive: false })
    this.on('destroy', this.destroyControls, this)
  }

  update() {
    if (isSameVec3(this.lastFocusPoint, this.focusPoint) && this.lastSceneRadius === this.sceneRadius) return

    this.target.copy(this.focusPoint)
    this.lastFocusPoint.copy(this.focusPoint)
    this.lastSceneRadius = this.sceneRadius
    this.syncFromCamera()
    this.applyCamera()
  }

  private onMouseDown(event: PlayCanvasMouseEvent) {
    this.lastPointer.set(event.x, event.y)
    this.orbiting = event.button === MOUSEBUTTON_LEFT
    this.panning = event.button === MOUSEBUTTON_MIDDLE || event.button === MOUSEBUTTON_RIGHT
    event.event.preventDefault()
  }

  private onMouseMove(event: PlayCanvasMouseEvent) {
    const deltaX = event.x - this.lastPointer.x
    const deltaY = event.y - this.lastPointer.y
    this.lastPointer.set(event.x, event.y)

    if (this.orbiting) {
      this.theta -= deltaX * SOG_ORBIT_ROTATE_SPEED
      this.phi = clamp(this.phi + deltaY * SOG_ORBIT_ROTATE_SPEED, SOG_ORBIT_MIN_POLAR_ANGLE, SOG_ORBIT_MAX_POLAR_ANGLE)
      this.applyCamera()
      event.event.preventDefault()
      return
    }

    if (this.panning) {
      this.pan(deltaX, deltaY)
      event.event.preventDefault()
    }
  }

  private onMouseUp(event: PlayCanvasMouseEvent) {
    this.orbiting = false
    this.panning = false
    event.event.preventDefault()
  }

  private zoomByWheelDelta(wheelDelta: number) {
    this.distance = clamp(
      this.distance + wheelDelta * SOG_ORBIT_ZOOM_SPEED * this.distance,
      this.minDistance(),
      this.maxDistance(),
    )
    this.applyCamera()
  }

  private onTouchStart(event: PlayCanvasTouchEvent) {
    if (event.touches.length === 1) {
      const [touch] = event.touches
      this.lastPointer.set(touch.x, touch.y)
      this.orbiting = true
      this.panning = false
      this.lastPinchDistance = 0
    } else if (event.touches.length >= 2) {
      this.orbiting = false
      this.panning = true
      this.syncPinch(event)
    }
    event.event.preventDefault()
  }

  private onTouchMove(event: PlayCanvasTouchEvent) {
    if (event.touches.length === 1 && this.orbiting) {
      const [touch] = event.touches
      const deltaX = touch.x - this.lastPointer.x
      const deltaY = touch.y - this.lastPointer.y
      this.lastPointer.set(touch.x, touch.y)
      this.theta -= deltaX * SOG_ORBIT_ROTATE_SPEED
      this.phi = clamp(this.phi + deltaY * SOG_ORBIT_ROTATE_SPEED, SOG_ORBIT_MIN_POLAR_ANGLE, SOG_ORBIT_MAX_POLAR_ANGLE)
      this.applyCamera()
    } else if (event.touches.length >= 2) {
      const nextPinchDistance = getTouchDistance(event)
      const nextPinchMidPoint = getTouchMidPoint(event)
      if (this.lastPinchDistance > 0) {
        const pinchDelta = nextPinchDistance - this.lastPinchDistance
        this.distance = clamp(
          this.distance - pinchDelta * 0.01 * this.distance,
          this.minDistance(),
          this.maxDistance(),
        )
        this.pan(nextPinchMidPoint.x - this.lastPinchMidPoint.x, nextPinchMidPoint.y - this.lastPinchMidPoint.y)
      }
      this.lastPinchDistance = nextPinchDistance
      this.lastPinchMidPoint.copy(nextPinchMidPoint)
    }
    event.event.preventDefault()
  }

  private onTouchEnd(event: PlayCanvasTouchEvent) {
    if (event.touches.length === 0) {
      this.orbiting = false
      this.panning = false
      this.lastPinchDistance = 0
    } else if (event.touches.length === 1) {
      const [touch] = event.touches
      this.lastPointer.set(touch.x, touch.y)
      this.orbiting = true
      this.panning = false
      this.lastPinchDistance = 0
    } else {
      this.orbiting = false
      this.panning = true
      this.syncPinch(event)
    }
    event.event.preventDefault()
  }

  private syncFromCamera() {
    const cameraPosition = this.entity.getPosition()
    const offset = new Vec3().sub2(cameraPosition, this.target)
    this.distance = clamp(offset.length(), this.minDistance(), this.maxDistance())
    const normalizedY = clamp(offset.y / Math.max(this.distance, Number.EPSILON), -1, 1)
    this.theta = Math.atan2(offset.x, offset.z)
    this.phi = clamp(Math.acos(normalizedY), SOG_ORBIT_MIN_POLAR_ANGLE, SOG_ORBIT_MAX_POLAR_ANGLE)
  }

  private applyCamera() {
    this.distance = clamp(this.distance, this.minDistance(), this.maxDistance())
    this.phi = clamp(this.phi, SOG_ORBIT_MIN_POLAR_ANGLE, SOG_ORBIT_MAX_POLAR_ANGLE)

    const sinPhi = Math.sin(this.phi)
    this.entity.setPosition(
      this.target.x + this.distance * sinPhi * Math.sin(this.theta),
      this.target.y + this.distance * Math.cos(this.phi),
      this.target.z + this.distance * sinPhi * Math.cos(this.theta),
    )
    this.entity.lookAt(this.target)
  }

  private pan(deltaX: number, deltaY: number) {
    const canvasHeight = getCanvasClientHeight(this.app.graphicsDevice.canvas)
    const pixelsToWorld =
      (2 * this.distance * Math.tan((SOG_CAMERA_FOV_DEGREES * Math.PI) / 360)) / Math.max(canvasHeight, 1)
    const right = new Vec3().copy(this.entity.right).mulScalar(-deltaX * pixelsToWorld)
    const up = new Vec3().copy(this.entity.up).mulScalar(deltaY * pixelsToWorld)
    this.target.add(right).add(up)
    this.applyCamera()
  }

  private syncPinch(event: PlayCanvasTouchEvent) {
    this.lastPinchDistance = getTouchDistance(event)
    this.lastPinchMidPoint.copy(getTouchMidPoint(event))
  }

  private minDistance() {
    return 0.35
  }

  private maxDistance() {
    return Math.max(180, this.sceneRadius * 24)
  }

  private destroyControls() {
    this.app.mouse?.off(EVENT_MOUSEDOWN, this.onMouseDown, this)
    this.app.mouse?.off(EVENT_MOUSEMOVE, this.onMouseMove, this)
    this.app.mouse?.off(EVENT_MOUSEUP, this.onMouseUp, this)
    this.app.touch?.off(EVENT_TOUCHSTART, this.onTouchStart, this)
    this.app.touch?.off(EVENT_TOUCHMOVE, this.onTouchMove, this)
    this.app.touch?.off(EVENT_TOUCHEND, this.onTouchEnd, this)
    this.app.touch?.off(EVENT_TOUCHCANCEL, this.onTouchEnd, this)
    this.canvasElement?.removeEventListener('wheel', this.onDomWheel)
  }
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function isSameVec3(left: Vec3, right: Vec3) {
  return (
    Math.abs(left.x - right.x) < 0.0001
    && Math.abs(left.y - right.y) < 0.0001
    && Math.abs(left.z - right.z) < 0.0001
  )
}

function getTouchDistance(event: PlayCanvasTouchEvent) {
  const [first, second] = event.touches
  if (!first || !second) return 0
  return Math.hypot(second.x - first.x, second.y - first.y)
}

function getTouchMidPoint(event: PlayCanvasTouchEvent) {
  const [first, second] = event.touches
  if (!first || !second) return new Vec2()
  return new Vec2((first.x + second.x) / 2, (first.y + second.y) / 2)
}

function getCanvasClientHeight(canvas: HTMLCanvasElement | OffscreenCanvas) {
  if ('clientHeight' in canvas) return canvas.clientHeight
  return canvas.height
}

function getCanvasElement(canvas: HTMLCanvasElement | OffscreenCanvas) {
  if ('clientHeight' in canvas && 'addEventListener' in canvas) return canvas as HTMLCanvasElement
  return null
}
