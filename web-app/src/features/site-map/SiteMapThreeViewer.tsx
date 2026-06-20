import { useEffect, useRef, useState } from 'react'
import type { Material, Mesh, Object3D } from 'three'

import type { SiteMapPlaceholderVariant } from './site-map-config'

type ModelState = 'booting' | 'placeholder' | 'loaded' | 'unavailable'

const modelStateLabel: Record<ModelState, string> = {
  booting: '3D viewer 啟動中',
  placeholder: '使用場域佔位模型',
  loaded: 'GLB 模型已載入',
  unavailable: '瀏覽器不支援 WebGL',
}

const FLY_LOOK_SPEED_DEGREES = 0.14
const FLY_PITCH_LIMIT_DEGREES = 88
const FLY_SPEED_MIN = 1.5
const FLY_SPEED_MAX = 18
const FLY_FAST_MULTIPLIER = 3
const FLY_SLOW_MULTIPLIER = 0.25
const FLY_WHEEL_STEP_MIN = 0.012
const FLY_WHEEL_STEP_MAX = 0.12
const RAD_TO_DEGREES = 180 / Math.PI
const DEGREES_TO_RAD = Math.PI / 180
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

export function SiteMapThreeViewer({
  modelUrl,
  siteLabel,
  modelAssetPath,
  placeholderVariant,
}: {
  modelUrl: string
  siteLabel: string
  modelAssetPath: string
  placeholderVariant: SiteMapPlaceholderVariant
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [modelState, setModelState] = useState<ModelState>('booting')

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return undefined

    if (import.meta.env.MODE === 'test') {
      setModelState('placeholder')
      return undefined
    }

    let disposed = false
    let cleanup: (() => void) | undefined

    async function bootViewer() {
      const [THREE, { GLTFLoader }] = await Promise.all([
        import('three'),
        import('three/examples/jsm/loaders/GLTFLoader.js'),
      ])

      const nextCanvas = canvasRef.current
      const nextContainer = containerRef.current
      if (disposed || !nextCanvas || !nextContainer) return

      let renderer: import('three').WebGLRenderer
      try {
        renderer = new THREE.WebGLRenderer({
          canvas: nextCanvas,
          antialias: true,
          alpha: false,
          preserveDrawingBuffer: true,
        })
      } catch {
        setModelState('unavailable')
        return
      }

      const scene = new THREE.Scene()
      scene.background = new THREE.Color(0xf4f6f8)

      const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 1000)
      camera.position.set(34, 28, 42)

      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

      let sceneRadius = 44
      const controls = createThreeUnrealFlyControls(
        THREE,
        camera,
        renderer.domElement,
        () => sceneRadius,
        () => new THREE.Vector3(0, 4, 0),
      )

      scene.add(new THREE.AmbientLight(0xffffff, 1.1))
      const sun = new THREE.DirectionalLight(0xffffff, 1.8)
      sun.position.set(20, 40, 16)
      scene.add(sun)

      const placeholder = createPlaceholderSite(THREE, placeholderVariant)
      let loadedModel: Object3D | null = null
      scene.add(placeholder)
      setModelState('placeholder')

      const loader = new GLTFLoader()
      loader.load(
        modelUrl,
        (gltf) => {
          if (disposed) return
          scene.remove(placeholder)
          loadedModel = gltf.scene
          sceneRadius = fitModelToViewer(THREE, gltf.scene)
          scene.add(gltf.scene)
          controls.syncToFocus()
          setModelState('loaded')
        },
        undefined,
        () => {
          if (!disposed) setModelState('placeholder')
        },
      )

      function resize() {
        const activeContainer = containerRef.current
        if (!activeContainer) return
        const width = Math.max(activeContainer.clientWidth, 1)
        const height = Math.max(activeContainer.clientHeight, 1)
        camera.aspect = width / height
        camera.updateProjectionMatrix()
        renderer.setSize(width, height, false)
      }

      let animationId = 0
      let previousFrameTime = performance.now()
      function animate() {
        if (disposed) return
        const nextFrameTime = performance.now()
        const deltaSeconds = Math.min(0.1, Math.max(0, (nextFrameTime - previousFrameTime) / 1000))
        previousFrameTime = nextFrameTime
        controls.update(deltaSeconds)
        renderer.render(scene, camera)
        animationId = window.requestAnimationFrame(animate)
      }

      const resizeObserver = new ResizeObserver(resize)
      resizeObserver.observe(nextContainer)
      resize()
      animate()

      cleanup = () => {
        window.cancelAnimationFrame(animationId)
        resizeObserver.disconnect()
        controls.dispose()
        renderer.dispose()
        placeholder.traverse(disposeMeshResources)
        loadedModel?.traverse(disposeMeshResources)
      }
    }

    void bootViewer()

    return () => {
      disposed = true
      cleanup?.()
    }
  }, [modelUrl, placeholderVariant])

  return (
    <div
      ref={containerRef}
      className="relative min-h-[34rem] overflow-hidden rounded-[1.5rem] border border-chrome-200 bg-chrome-100"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full cursor-crosshair"
        aria-label="3D 場域模型"
        tabIndex={0}
      />
      {modelState === 'unavailable' ? (
        <div className="absolute inset-0 flex items-center justify-center bg-chrome-100 px-6 text-center text-sm text-chrome-700">
          目前瀏覽器無法啟用 WebGL，請先切換到 2D 參考或改用支援 WebGL 的瀏覽器。
        </div>
      ) : null}
      <div className="absolute left-4 top-4 rounded-full border border-white/70 bg-white/90 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-chrome-700 shadow-panel">
        {modelStateLabel[modelState]}
      </div>
      {modelState === 'placeholder' ? (
        <div className="absolute bottom-4 left-4 max-w-md rounded-2xl border border-white/70 bg-white/90 px-4 py-3 text-xs leading-5 text-chrome-700 shadow-panel">
          目前使用 {siteLabel} 佔位模型。若 `{modelAssetPath}` 存在且可被瀏覽器載入，會自動切換為正式 GLB。
        </div>
      ) : null}
    </div>
  )
}

function fitModelToViewer(THREE: typeof import('three'), model: Object3D) {
  const box = new THREE.Box3().setFromObject(model)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const maxDimension = Math.max(size.x, size.y, size.z)

  if (!Number.isFinite(maxDimension) || maxDimension <= 0) return 44

  const scale = 44 / maxDimension
  model.scale.setScalar(scale)
  model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale)
  return 44
}

function createThreeUnrealFlyControls(
  THREE: typeof import('three'),
  camera: import('three').PerspectiveCamera,
  canvas: HTMLCanvasElement,
  getSceneRadius: () => number,
  getFocusPoint: () => import('three').Vector3,
) {
  const pressedKeys = new Set<string>()
  let leftLookActive = false
  let rightFlyActive = false
  let lastPointerX = 0
  let lastPointerY = 0
  let yawDegrees = 0
  let pitchDegrees = 0

  canvas.tabIndex = 0

  function isLooking() {
    return leftLookActive || rightFlyActive
  }

  function setCanvasCursor() {
    canvas.style.cursor = isLooking() ? 'grabbing' : 'crosshair'
  }

  function syncToFocus() {
    if (isLooking()) return
    const direction = new THREE.Vector3().subVectors(getFocusPoint(), camera.position)
    if (direction.length() <= Number.EPSILON) {
      yawDegrees = 0
      pitchDegrees = 0
      applyRotation()
      return
    }
    direction.normalize()
    yawDegrees = Math.atan2(-direction.x, -direction.z) * RAD_TO_DEGREES
    pitchDegrees = Math.asin(clamp(direction.y, -1, 1)) * RAD_TO_DEGREES
    applyRotation()
  }

  function applyRotation() {
    pitchDegrees = clamp(pitchDegrees, -FLY_PITCH_LIMIT_DEGREES, FLY_PITCH_LIMIT_DEGREES)
    camera.rotation.order = 'YXZ'
    camera.rotation.set(pitchDegrees * DEGREES_TO_RAD, yawDegrees * DEGREES_TO_RAD, 0, 'YXZ')
  }

  function currentSpeed() {
    let multiplier = 1
    if (pressedKeys.has('ShiftLeft') || pressedKeys.has('ShiftRight')) multiplier *= FLY_FAST_MULTIPLIER
    if (pressedKeys.has('ControlLeft') || pressedKeys.has('ControlRight')) multiplier *= FLY_SLOW_MULTIPLIER
    return clamp(getSceneRadius() * 0.35, FLY_SPEED_MIN, FLY_SPEED_MAX) * multiplier
  }

  function wheelStep() {
    return clamp(getSceneRadius() * 0.004, FLY_WHEEL_STEP_MIN, FLY_WHEEL_STEP_MAX)
  }

  function moveAlongForward(distance: number) {
    const forward = new THREE.Vector3()
    camera.getWorldDirection(forward)
    camera.position.add(forward.multiplyScalar(distance))
  }

  function update(deltaSeconds: number) {
    if (!rightFlyActive || deltaSeconds <= 0) return

    const forward = new THREE.Vector3()
    camera.getWorldDirection(forward)
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
    const moveVector = new THREE.Vector3()

    if (pressedKeys.has('KeyW') || pressedKeys.has('ArrowUp')) moveVector.add(forward)
    if (pressedKeys.has('KeyS') || pressedKeys.has('ArrowDown')) moveVector.sub(forward)
    if (pressedKeys.has('KeyD') || pressedKeys.has('ArrowRight')) moveVector.add(right)
    if (pressedKeys.has('KeyA') || pressedKeys.has('ArrowLeft')) moveVector.sub(right)
    if (pressedKeys.has('KeyE')) moveVector.y += 1
    if (pressedKeys.has('KeyQ')) moveVector.y -= 1

    if (moveVector.length() <= Number.EPSILON) return
    camera.position.add(moveVector.normalize().multiplyScalar(currentSpeed() * deltaSeconds))
  }

  function onMouseDown(event: MouseEvent) {
    if (event.button !== 0 && event.button !== 2) return
    lastPointerX = event.clientX
    lastPointerY = event.clientY
    if (event.button === 0) leftLookActive = true
    if (event.button === 2) rightFlyActive = true
    canvas.focus({ preventScroll: true })
    setCanvasCursor()
    event.preventDefault()
    event.stopPropagation()
  }

  function onMouseMove(event: MouseEvent) {
    if (!isLooking()) return
    const deltaX = event.clientX - lastPointerX
    const deltaY = event.clientY - lastPointerY
    lastPointerX = event.clientX
    lastPointerY = event.clientY
    yawDegrees += deltaX * FLY_LOOK_SPEED_DEGREES
    pitchDegrees += deltaY * FLY_LOOK_SPEED_DEGREES
    applyRotation()
    event.preventDefault()
    event.stopPropagation()
  }

  function onMouseUp(event: MouseEvent) {
    if (event.button !== 0 && event.button !== 2) return
    if (event.button === 0) leftLookActive = false
    if (event.button === 2) {
      rightFlyActive = false
      pressedKeys.clear()
    }
    setCanvasCursor()
    event.preventDefault()
    event.stopPropagation()
  }

  function onWheel(event: WheelEvent) {
    if (event.deltaY !== 0) moveAlongForward(-event.deltaY * wheelStep())
    event.preventDefault()
    event.stopPropagation()
  }

  function onContextMenu(event: MouseEvent) {
    event.preventDefault()
  }

  function onKeyDown(event: KeyboardEvent) {
    const code = getKeyboardCode(event)
    if (!code) return
    pressedKeys.add(code)
    if (rightFlyActive && shouldCaptureFlyKey(code)) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  function onKeyUp(event: KeyboardEvent) {
    const code = getKeyboardCode(event)
    if (code) pressedKeys.delete(code)
    if (rightFlyActive && code && shouldCaptureFlyKey(code)) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  function onBlur() {
    leftLookActive = false
    rightFlyActive = false
    pressedKeys.clear()
    setCanvasCursor()
  }

  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('wheel', onWheel, { passive: false })
  canvas.addEventListener('contextmenu', onContextMenu)
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  setCanvasCursor()
  syncToFocus()

  return {
    update,
    syncToFocus,
    dispose() {
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    },
  }
}

function disposeMeshResources(child: Object3D) {
  const mesh = child as Mesh
  mesh.geometry?.dispose()
  const material = mesh.material as Material | Material[] | undefined
  if (Array.isArray(material)) {
    material.forEach((item) => item.dispose())
    return
  }
  material?.dispose()
}

function createPlaceholderSite(THREE: typeof import('three'), variant: SiteMapPlaceholderVariant) {
  if (variant === 'bri') return createBriPlaceholderSite(THREE)
  if (variant === 'rent-house') return createRentHousePlaceholderSite(THREE)
  return createDemoPlaceholderSite(THREE)
}

function createDemoPlaceholderSite(THREE: typeof import('three')) {
  const group = new THREE.Group()
  const slabMaterial = new THREE.MeshStandardMaterial({ color: 0xdfe5ea, roughness: 0.86 })
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72 })
  const equipmentMaterial = new THREE.MeshStandardMaterial({ color: 0x6f8f84, roughness: 0.68 })

  addBox(THREE, group, slabMaterial, [48, 0.7, 34], [0, -0.35, 0])
  addBox(THREE, group, wallMaterial, [48, 5, 0.7], [0, 2.4, -17])
  addBox(THREE, group, wallMaterial, [48, 5, 0.7], [0, 2.4, 17])
  addBox(THREE, group, wallMaterial, [0.7, 5, 34], [-24, 2.4, 0])
  addBox(THREE, group, wallMaterial, [0.7, 5, 34], [24, 2.4, 0])

  for (let index = 0; index < 5; index += 1) {
    addBox(THREE, group, equipmentMaterial, [4.5, 2.6, 3.2], [-16 + index * 8, 1.3, 7])
  }

  const grid = new THREE.GridHelper(58, 18, 0x9aa7b2, 0xd5dce2)
  grid.position.y = 0.02
  group.add(grid)
  return group
}

function createBriPlaceholderSite(THREE: typeof import('three')) {
  const group = new THREE.Group()
  const slabMaterial = new THREE.MeshStandardMaterial({ color: 0xe7e8e6, roughness: 0.9 })
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xf3f4f1, roughness: 0.78 })
  const finMaterial = new THREE.MeshStandardMaterial({ color: 0xd7d9d7, roughness: 0.76 })
  const darkMassMaterial = new THREE.MeshStandardMaterial({ color: 0x303030, roughness: 0.82 })
  const bandMaterial = new THREE.MeshStandardMaterial({ color: 0x1f2428, roughness: 0.7 })
  const doorMaterial = new THREE.MeshStandardMaterial({ color: 0xb8753d, roughness: 0.68 })

  addBox(THREE, group, slabMaterial, [70, 0.55, 48], [0, -0.28, 0])
  addBox(THREE, group, wallMaterial, [60, 5.2, 1.2], [2, 2.6, -20])
  addBox(THREE, group, wallMaterial, [1.2, 5.2, 38], [-26, 2.6, -0.5])
  addBox(THREE, group, wallMaterial, [1.2, 8.2, 36], [30, 4.1, -2])
  addBox(THREE, group, darkMassMaterial, [10, 16, 9], [-4.5, 8, -5])
  addBox(THREE, group, darkMassMaterial, [7.5, 16, 18], [3.5, 8, -0.8])
  addBox(THREE, group, doorMaterial, [0.42, 2.7, 1.6], [28.7, 1.35, 2.6])

  for (let index = 0; index < 13; index += 1) {
    addBox(THREE, group, finMaterial, [1.5, 8.8, 1.35], [28.95, 4.4, -17 + index * 2.65])
  }

  addBox(THREE, group, bandMaterial, [0.35, 0.28, 34], [29.25, 3.4, -1.8])
  addBox(THREE, group, bandMaterial, [0.35, 0.24, 34], [29.25, 5.75, -1.8])

  const grid = new THREE.GridHelper(74, 22, 0xb7bab9, 0xe0e2e1)
  grid.position.y = 0.04
  group.add(grid)
  group.rotation.y = -0.18
  return group
}

function createRentHousePlaceholderSite(THREE: typeof import('three')) {
  const group = new THREE.Group()
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.82 })
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xf5f2ed, roughness: 0.78 })
  const furnitureMaterial = new THREE.MeshStandardMaterial({ color: 0x8a6f5a, roughness: 0.7 })
  const accentMaterial = new THREE.MeshStandardMaterial({ color: 0x6f8f84, roughness: 0.68 })

  addBox(THREE, group, floorMaterial, [38, 0.5, 28], [0, -0.25, 0])
  addBox(THREE, group, wallMaterial, [38, 4.5, 0.6], [0, 2.25, -14])
  addBox(THREE, group, wallMaterial, [0.6, 4.5, 28], [-19, 2.25, 0])
  addBox(THREE, group, wallMaterial, [0.6, 4.5, 20], [19, 2.25, -4])
  addBox(THREE, group, furnitureMaterial, [10, 1.2, 6], [-8, 0.6, 4])
  addBox(THREE, group, furnitureMaterial, [5, 5, 2], [8, 2.5, -8])
  addBox(THREE, group, accentMaterial, [4, 2.4, 3], [10, 1.2, 6])

  const grid = new THREE.GridHelper(44, 16, 0xb7bab9, 0xe0e2e1)
  grid.position.y = 0.04
  group.add(grid)
  group.rotation.y = 0.25
  return group
}

function addBox(
  THREE: typeof import('three'),
  group: import('three').Group,
  material: Material,
  size: [number, number, number],
  position: [number, number, number],
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
  mesh.position.set(...position)
  group.add(mesh)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
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
