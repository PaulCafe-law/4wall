import { useEffect, useMemo, useState } from 'react'
import { Application, Entity } from '@playcanvas/react'
import { Camera, GSplat, Script as PlayCanvasScript } from '@playcanvas/react/components'
import { useSplat } from '@playcanvas/react/hooks'
import {
  EVENT_MOUSEDOWN,
  EVENT_MOUSEMOVE,
  EVENT_MOUSEUP,
  FILLMODE_NONE,
  MOUSEBUTTON_LEFT,
  MOUSEBUTTON_RIGHT,
  RESOLUTION_AUTO,
  Script as PlayCanvasBaseScript,
  Vec2,
  Vec3,
  type Asset,
  type MouseEvent as PlayCanvasMouseEvent,
} from 'playcanvas'

import {
  composeViewRelativeFlyMove,
  createNoRollFlyBasis,
  type SiteMapFlyBasis,
  type SiteMapFlyVector,
} from './site-map-flight-controls'

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
const SOG_FLY_LOOK_SPEED_DEGREES = 0.14
const SOG_FLY_PITCH_LIMIT_DEGREES = 88
const SOG_FLY_SPEED_MIN = 1.5
const SOG_FLY_SPEED_MAX = 18
const SOG_FLY_FAST_MULTIPLIER = 3
const SOG_FLY_SLOW_MULTIPLIER = 0.25
const SOG_FLY_WHEEL_STEP_MIN = 0.012
const SOG_FLY_WHEEL_STEP_MAX = 0.12
const RAD_TO_DEGREES = 180 / Math.PI
const DEFAULT_CAMERA_FRAME: CameraFrame = {
  focus: [0, 0, 0],
  position: [0, 0.4, 3.4],
  radius: 4,
}
const FLY_MOVEMENT_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyQ',
  'KeyE',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
])

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
              script={SiteMapUnrealFlyControls}
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

class SiteMapUnrealFlyControls extends PlayCanvasBaseScript {
  static scriptName = 'siteMapUnrealFlyControls'

  focusPoint = new Vec3()
  sceneRadius = DEFAULT_CAMERA_FRAME.radius

  private readonly lastFocusPoint = new Vec3(Number.NaN, Number.NaN, Number.NaN)
  private readonly lastPointer = new Vec2()
  private readonly pressedKeys = new Set<string>()
  private lastSceneRadius = Number.NaN
  private canvasElement: HTMLCanvasElement | null = null
  private leftLookActive = false
  private rightFlyActive = false
  private yawDegrees = 0
  private pitchDegrees = 0
  private readonly onDomWheel = (event: WheelEvent) => {
    if (event.deltaY === 0) return
    this.moveAlongForward(-event.deltaY * this.wheelStep())
    event.preventDefault()
    event.stopPropagation()
  }
  private readonly onDomContextMenu = (event: MouseEvent) => {
    event.preventDefault()
  }
  private readonly onDomKeyDown = (event: KeyboardEvent) => {
    const keyCode = getKeyboardCode(event)
    if (!keyCode) return
    this.pressedKeys.add(keyCode)
    if (this.rightFlyActive && shouldCaptureFlyKey(keyCode)) {
      event.preventDefault()
      event.stopPropagation()
    }
  }
  private readonly onDomKeyUp = (event: KeyboardEvent) => {
    const keyCode = getKeyboardCode(event)
    if (keyCode) this.pressedKeys.delete(keyCode)
    if (this.rightFlyActive && keyCode && shouldCaptureFlyKey(keyCode)) {
      event.preventDefault()
      event.stopPropagation()
    }
  }
  private readonly onDomBlur = () => {
    this.leftLookActive = false
    this.rightFlyActive = false
    this.pressedKeys.clear()
    this.setCanvasCursor()
  }

  initialize() {
    this.lastFocusPoint.copy(this.focusPoint)
    this.lastSceneRadius = this.sceneRadius
    this.syncLookAnglesFromFocus()

    this.app.mouse?.disableContextMenu()
    this.app.mouse?.on(EVENT_MOUSEDOWN, this.onMouseDown, this)
    this.app.mouse?.on(EVENT_MOUSEMOVE, this.onMouseMove, this)
    this.app.mouse?.on(EVENT_MOUSEUP, this.onMouseUp, this)
    this.canvasElement = getCanvasElement(this.app.graphicsDevice.canvas)
    if (this.canvasElement) {
      this.canvasElement.tabIndex = 0
      this.setCanvasCursor()
      this.canvasElement.addEventListener('wheel', this.onDomWheel, { passive: false })
      this.canvasElement.addEventListener('contextmenu', this.onDomContextMenu)
    }
    window.addEventListener('keydown', this.onDomKeyDown)
    window.addEventListener('keyup', this.onDomKeyUp)
    window.addEventListener('blur', this.onDomBlur)
    this.on('destroy', this.destroyControls, this)
  }

  update(dt: number) {
    if (!isSameVec3(this.lastFocusPoint, this.focusPoint) || this.lastSceneRadius !== this.sceneRadius) {
      this.lastFocusPoint.copy(this.focusPoint)
      this.lastSceneRadius = this.sceneRadius
      if (!this.isLooking()) {
        this.syncLookAnglesFromFocus()
      }
    }

    this.moveFromKeyboard(dt)
  }

  private onMouseDown(event: PlayCanvasMouseEvent) {
    if (event.button !== MOUSEBUTTON_LEFT && event.button !== MOUSEBUTTON_RIGHT) return

    this.lastPointer.set(event.x, event.y)
    if (event.button === MOUSEBUTTON_LEFT) this.leftLookActive = true
    if (event.button === MOUSEBUTTON_RIGHT) this.rightFlyActive = true
    this.canvasElement?.focus({ preventScroll: true })
    this.setCanvasCursor()
    event.event.preventDefault()
    event.event.stopPropagation()
  }

  private onMouseMove(event: PlayCanvasMouseEvent) {
    if (!this.isLooking()) return

    const deltaX = event.x - this.lastPointer.x
    const deltaY = event.y - this.lastPointer.y
    this.lastPointer.set(event.x, event.y)

    this.yawDegrees += deltaX * SOG_FLY_LOOK_SPEED_DEGREES
    this.pitchDegrees = clamp(
      this.pitchDegrees + deltaY * SOG_FLY_LOOK_SPEED_DEGREES,
      -SOG_FLY_PITCH_LIMIT_DEGREES,
      SOG_FLY_PITCH_LIMIT_DEGREES,
    )
    this.applyRotation()
    event.event.preventDefault()
    event.event.stopPropagation()
  }

  private onMouseUp(event: PlayCanvasMouseEvent) {
    if (event.button !== MOUSEBUTTON_LEFT && event.button !== MOUSEBUTTON_RIGHT) return

    if (event.button === MOUSEBUTTON_LEFT) this.leftLookActive = false
    if (event.button === MOUSEBUTTON_RIGHT) {
      this.rightFlyActive = false
      this.pressedKeys.clear()
    }
    this.setCanvasCursor()
    event.event.preventDefault()
    event.event.stopPropagation()
  }

  private syncLookAnglesFromFocus() {
    const cameraPosition = this.entity.getPosition()
    const direction = new Vec3().sub2(this.focusPoint, cameraPosition)
    if (direction.length() <= Number.EPSILON) {
      this.yawDegrees = 0
      this.pitchDegrees = 0
      this.applyRotation()
      return
    }
    direction.normalize()
    this.yawDegrees = Math.atan2(-direction.x, -direction.z) * RAD_TO_DEGREES
    this.pitchDegrees = Math.asin(clamp(direction.y, -1, 1)) * RAD_TO_DEGREES
    this.applyRotation()
  }

  private applyRotation() {
    this.pitchDegrees = clamp(
      this.pitchDegrees,
      -SOG_FLY_PITCH_LIMIT_DEGREES,
      SOG_FLY_PITCH_LIMIT_DEGREES,
    )
    const basis = createNoRollFlyBasis(this.yawDegrees, this.pitchDegrees)
    const position = this.entity.getPosition()
    this.entity.lookAt(
      new Vec3(
        position.x + basis.forward.x,
        position.y + basis.forward.y,
        position.z + basis.forward.z,
      ),
      flyVectorToVec3(basis.up),
    )
  }

  private moveFromKeyboard(dt: number) {
    if (!this.rightFlyActive || dt <= 0) return

    const moveDirection = composeViewRelativeFlyMove(createPlayCanvasFlyBasis(this.yawDegrees, this.pitchDegrees), {
      forward: this.hasPressed('KeyW') || this.hasPressed('ArrowUp'),
      backward: this.hasPressed('KeyS') || this.hasPressed('ArrowDown'),
      right: this.hasPressed('KeyD') || this.hasPressed('ArrowRight'),
      left: this.hasPressed('KeyA') || this.hasPressed('ArrowLeft'),
      up: this.hasPressed('KeyE'),
      down: this.hasPressed('KeyQ'),
    })

    if (!moveDirection) return
    const moveVector = flyVectorToVec3(moveDirection).mulScalar(this.currentSpeed() * dt)
    this.entity.setPosition(new Vec3().copy(this.entity.getPosition()).add(moveVector))
  }

  private moveAlongForward(distance: number) {
    const { forward } = createPlayCanvasFlyBasis(this.yawDegrees, this.pitchDegrees)
    const moveVector = flyVectorToVec3(forward).mulScalar(distance)
    this.entity.setPosition(new Vec3().copy(this.entity.getPosition()).add(moveVector))
  }

  private hasPressed(code: string) {
    return this.pressedKeys.has(code)
  }

  private currentSpeed() {
    let multiplier = 1
    if (this.hasPressed('ShiftLeft') || this.hasPressed('ShiftRight')) multiplier *= SOG_FLY_FAST_MULTIPLIER
    if (this.hasPressed('ControlLeft') || this.hasPressed('ControlRight')) multiplier *= SOG_FLY_SLOW_MULTIPLIER
    return clamp(this.sceneRadius * 0.35, SOG_FLY_SPEED_MIN, SOG_FLY_SPEED_MAX) * multiplier
  }

  private wheelStep() {
    return clamp(this.sceneRadius * 0.004, SOG_FLY_WHEEL_STEP_MIN, SOG_FLY_WHEEL_STEP_MAX)
  }

  private setCanvasCursor() {
    if (!this.canvasElement) return
    this.canvasElement.style.cursor = this.isLooking() ? 'grabbing' : 'crosshair'
  }

  private isLooking() {
    return this.leftLookActive || this.rightFlyActive
  }

  private destroyControls() {
    this.app.mouse?.off(EVENT_MOUSEDOWN, this.onMouseDown, this)
    this.app.mouse?.off(EVENT_MOUSEMOVE, this.onMouseMove, this)
    this.app.mouse?.off(EVENT_MOUSEUP, this.onMouseUp, this)
    this.canvasElement?.removeEventListener('wheel', this.onDomWheel)
    this.canvasElement?.removeEventListener('contextmenu', this.onDomContextMenu)
    window.removeEventListener('keydown', this.onDomKeyDown)
    window.removeEventListener('keyup', this.onDomKeyUp)
    window.removeEventListener('blur', this.onDomBlur)
  }
}

function createPlayCanvasFlyBasis(yawDegrees: number, pitchDegrees: number): SiteMapFlyBasis {
  return createNoRollFlyBasis(yawDegrees, pitchDegrees)
}

function flyVectorToVec3(vector: SiteMapFlyVector) {
  return new Vec3(vector.x, vector.y, vector.z)
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

function getCanvasElement(canvas: HTMLCanvasElement | OffscreenCanvas) {
  if ('clientHeight' in canvas && 'addEventListener' in canvas) return canvas as HTMLCanvasElement
  return null
}

function getKeyboardCode(event: KeyboardEvent) {
  if (event.code) return event.code
  if (event.key.length === 1) return `Key${event.key.toUpperCase()}`
  return event.key
}

function shouldCaptureFlyKey(code: string) {
  return FLY_MOVEMENT_KEYS.has(code)
    || code === 'ShiftLeft'
    || code === 'ShiftRight'
    || code === 'ControlLeft'
    || code === 'ControlRight'
}
