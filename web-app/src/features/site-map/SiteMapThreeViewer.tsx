import { useEffect, useRef, useState } from 'react'
import type { Material, Mesh, Object3D } from 'three'

import type { SiteMapPlaceholderVariant } from './site-map-config'

type ModelState = 'booting' | 'placeholder' | 'loaded' | 'unavailable'

interface SceneFit {
  scale: number
  offsetX: number
  offsetY: number
  offsetZ: number
  targetY: number
  fitted: boolean
}

const identitySceneFit: SceneFit = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  offsetZ: 0,
  targetY: 4,
  fitted: false,
}

const modelStateLabel: Record<ModelState, string> = {
  booting: '3D viewer 啟動中',
  placeholder: '使用示意模型',
  loaded: 'GLB 模型已載入',
  unavailable: '瀏覽器不支援 WebGL',
}

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
      const [THREE, { GLTFLoader }, { OrbitControls }] = await Promise.all([
        import('three'),
        import('three/examples/jsm/loaders/GLTFLoader.js'),
        import('three/examples/jsm/controls/OrbitControls.js'),
      ])

      if (disposed || !canvasRef.current || !containerRef.current) return

      const gl = canvasRef.current.getContext('webgl2') ?? canvasRef.current.getContext('webgl')
      if (!gl) {
        setModelState('unavailable')
        return
      }

      const scene = new THREE.Scene()
      scene.background = new THREE.Color(0xf4f6f8)

      const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 1000)
      camera.position.set(34, 28, 42)

      const renderer = new THREE.WebGLRenderer({
        canvas: canvasRef.current,
        antialias: true,
        alpha: false,
        context: gl,
      })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

      const controls = new OrbitControls(camera, renderer.domElement)
      controls.enableDamping = true
      controls.target.set(0, 4, 0)
      controls.cursor.set(0, 4, 0)
      controls.enablePan = false
      controls.screenSpacePanning = false
      controls.zoomToCursor = true
      controls.maxTargetRadius = 32
      controls.zoomSpeed = 3.2
      controls.maxPolarAngle = Math.PI * 0.48
      controls.minDistance = 0.35
      controls.maxDistance = 180

      const clock = new THREE.Clock()
      const pressedKeys = new Set<string>()
      const flyState = {
        active: false,
        yaw: 0,
        pitch: 0,
        speed: 18,
      }
      const flyForward = new THREE.Vector3()
      const flyRight = new THREE.Vector3()
      const flyUp = new THREE.Vector3(0, 1, 0)
      const flyMove = new THREE.Vector3()
      const flyEuler = new THREE.Euler(0, 0, 0, 'YXZ')

      scene.add(new THREE.AmbientLight(0xffffff, 1.1))
      const sun = new THREE.DirectionalLight(0xffffff, 1.8)
      sun.position.set(20, 40, 16)
      scene.add(sun)

      const placeholder = createPlaceholderSite(THREE, placeholderVariant)
      let loadedModel: Object3D | null = null
      let sceneFit = identitySceneFit
      scene.add(placeholder)
      setModelState('placeholder')

      const loader = new GLTFLoader()
      loader.load(
        modelUrl,
        (gltf) => {
          if (disposed) return
          scene.remove(placeholder)
          loadedModel = gltf.scene
          gltf.scene.traverse((child) => {
            child.castShadow = true
          })
          sceneFit = fitModelToViewer(THREE, gltf.scene)
          controls.target.set(0, sceneFit.targetY, 0)
          controls.cursor.set(0, sceneFit.targetY, 0)
          controls.update()
          scene.add(gltf.scene)
          setModelState('loaded')
        },
        undefined,
        () => {
          if (!disposed) setModelState('placeholder')
        },
      )

      function resize() {
        if (!containerRef.current) return
        const width = containerRef.current.clientWidth
        const height = containerRef.current.clientHeight
        camera.aspect = Math.max(width, 1) / Math.max(height, 1)
        camera.updateProjectionMatrix()
        renderer.setSize(width, height, false)
      }

      function animate() {
        if (disposed) return
        const deltaSeconds = Math.min(clock.getDelta(), 0.05)
        updateFlyCamera(deltaSeconds)
        if (!flyState.active) controls.update()
        renderer.render(scene, camera)
        window.requestAnimationFrame(animate)
      }

      resize()
      animate()
      window.addEventListener('resize', resize)
      renderer.domElement.addEventListener('contextmenu', preventCanvasContextMenu)
      renderer.domElement.addEventListener('pointerdown', onCanvasPointerDown)
      renderer.domElement.addEventListener('pointermove', onCanvasPointerMove)
      renderer.domElement.addEventListener('wheel', onCanvasWheel, { passive: false })
      window.addEventListener('pointerup', stopFlyMode)
      window.addEventListener('blur', stopFlyMode)
      window.addEventListener('keydown', onWindowKeyDown)
      window.addEventListener('keyup', onWindowKeyUp)

      cleanup = () => {
        window.removeEventListener('resize', resize)
        renderer.domElement.removeEventListener('contextmenu', preventCanvasContextMenu)
        renderer.domElement.removeEventListener('pointerdown', onCanvasPointerDown)
        renderer.domElement.removeEventListener('pointermove', onCanvasPointerMove)
        renderer.domElement.removeEventListener('wheel', onCanvasWheel)
        window.removeEventListener('pointerup', stopFlyMode)
        window.removeEventListener('blur', stopFlyMode)
        window.removeEventListener('keydown', onWindowKeyDown)
        window.removeEventListener('keyup', onWindowKeyUp)
        controls.dispose()
        renderer.dispose()
        placeholder.traverse(disposeMeshResources)
        loadedModel?.traverse(disposeMeshResources)
      }

      function preventCanvasContextMenu(event: MouseEvent) {
        event.preventDefault()
      }

      function onCanvasPointerDown(event: PointerEvent) {
        if (event.button !== 2) return
        event.preventDefault()
        renderer.domElement.focus()
        renderer.domElement.setPointerCapture(event.pointerId)
        void renderer.domElement.requestPointerLock?.()
        flyEuler.setFromQuaternion(camera.quaternion)
        flyState.yaw = flyEuler.y
        flyState.pitch = flyEuler.x
        flyState.active = true
        controls.enabled = false
      }

      function onCanvasPointerMove(event: PointerEvent) {
        if (!flyState.active) return
        event.preventDefault()
        flyState.yaw += event.movementX * 0.0022
        flyState.pitch -= event.movementY * 0.0022
        flyState.pitch = Math.max(-Math.PI * 0.48, Math.min(Math.PI * 0.48, flyState.pitch))
        flyEuler.set(flyState.pitch, flyState.yaw, 0)
        camera.quaternion.setFromEuler(flyEuler)
      }

      function onCanvasWheel(event: WheelEvent) {
        if (!flyState.active) return
        event.preventDefault()
        flyForward.set(0, 0, -1).applyQuaternion(camera.quaternion)
        camera.position.addScaledVector(flyForward, -event.deltaY * 0.085)
        syncOrbitTargetFromCamera()
      }

      function onWindowKeyDown(event: KeyboardEvent) {
        const key = event.key.toLowerCase()
        if (!isFlyKey(key)) return
        if (!flyState.active) return
        event.preventDefault()
        pressedKeys.add(key)
        if (event.shiftKey) flyState.speed = 36
      }

      function onWindowKeyUp(event: KeyboardEvent) {
        const key = event.key.toLowerCase()
        pressedKeys.delete(key)
        if (!event.shiftKey) flyState.speed = 18
      }

      function stopFlyMode(event?: PointerEvent | Event) {
        if (!flyState.active) return
        flyState.active = false
        pressedKeys.clear()
        controls.enabled = true
        syncOrbitTargetFromCamera()
        if (document.pointerLockElement === renderer.domElement) document.exitPointerLock()
        if (event instanceof PointerEvent && renderer.domElement.hasPointerCapture(event.pointerId)) {
          renderer.domElement.releasePointerCapture(event.pointerId)
        }
      }

      function updateFlyCamera(deltaSeconds: number) {
        if (!flyState.active || pressedKeys.size === 0) return

        flyForward.set(0, 0, -1).applyQuaternion(camera.quaternion)
        flyRight.set(1, 0, 0).applyQuaternion(camera.quaternion)
        flyMove.set(0, 0, 0)

        if (pressedKeys.has('w')) flyMove.add(flyForward)
        if (pressedKeys.has('s')) flyMove.sub(flyForward)
        if (pressedKeys.has('d')) flyMove.add(flyRight)
        if (pressedKeys.has('a')) flyMove.sub(flyRight)
        if (pressedKeys.has('e')) flyMove.add(flyUp)
        if (pressedKeys.has('q')) flyMove.sub(flyUp)

        if (flyMove.lengthSq() <= 0) return

        flyMove.normalize().multiplyScalar(flyState.speed * deltaSeconds)
        camera.position.add(flyMove)
        syncOrbitTargetFromCamera()
      }

      function syncOrbitTargetFromCamera() {
        flyForward.set(0, 0, -1).applyQuaternion(camera.quaternion)
        controls.target.copy(camera.position).addScaledVector(flyForward, 12)
        controls.cursor.copy(controls.target)
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
          此瀏覽器目前無法啟用 WebGL，請切換到 2D 平面圖檢視。
        </div>
      ) : null}
      <div className="absolute left-4 top-4 rounded-full border border-white/70 bg-white/90 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-chrome-700 shadow-panel">
        {modelStateLabel[modelState]}
      </div>
      {modelState === 'placeholder' ? (
        <div className="absolute bottom-4 left-4 max-w-md rounded-2xl border border-white/70 bg-white/90 px-4 py-3 text-xs leading-5 text-chrome-700 shadow-panel">
          目前使用{siteLabel}示意場域；上傳 `{modelAssetPath}` 後會自動載入正式模型。
        </div>
      ) : null}
    </div>
  )
}

function fitModelToViewer(THREE: typeof import('three'), model: Object3D): SceneFit {
  const box = getModelFocusBox(THREE, model)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const maxDimension = Math.max(size.x, size.y, size.z)

  if (!Number.isFinite(maxDimension) || maxDimension <= 0) return identitySceneFit

  const scale = 44 / maxDimension
  const offsetX = -center.x * scale
  const offsetY = -box.min.y * scale
  const offsetZ = -center.z * scale

  model.scale.setScalar(scale)
  model.position.set(offsetX, offsetY, offsetZ)

  return {
    scale,
    offsetX,
    offsetY,
    offsetZ,
    targetY: Math.max(2, Math.min(8, (size.y * scale) / 2)),
    fitted: true,
  }
}

function getModelFocusBox(THREE: typeof import('three'), model: Object3D) {
  const fullBox = new THREE.Box3().setFromObject(model)
  const meshBoxes: Array<{ box: import('three').Box3; diagonal: number }> = []

  model.updateWorldMatrix(true, true)
  model.traverse((child) => {
    const mesh = child as Mesh
    if (!mesh.geometry) return

    const box = new THREE.Box3().setFromObject(mesh)
    const size = box.getSize(new THREE.Vector3())
    const diagonal = size.length()
    if (!Number.isFinite(diagonal) || diagonal <= 0) return

    meshBoxes.push({ box, diagonal })
  })

  if (meshBoxes.length === 0) return fullBox

  const maxDiagonal = Math.max(...meshBoxes.map((item) => item.diagonal))
  const focusBox = new THREE.Box3()
  meshBoxes
    .filter((item) => item.diagonal >= maxDiagonal * 0.08)
    .forEach((item) => focusBox.union(item.box))

  return focusBox.isEmpty() ? fullBox : focusBox
}

function isFlyKey(key: string) {
  return key === 'w' || key === 'a' || key === 's' || key === 'd' || key === 'q' || key === 'e'
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
  if (variant === 'bri') {
    return createBriPlaceholderSite(THREE)
  }

  const group = new THREE.Group()

  const slabMaterial = new THREE.MeshStandardMaterial({ color: 0xdfe5ea, roughness: 0.86 })
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72 })
  const hazardMaterial = new THREE.MeshStandardMaterial({ color: 0xe9b15b, roughness: 0.62 })
  const equipmentMaterial = new THREE.MeshStandardMaterial({ color: 0x6f8f84, roughness: 0.68 })

  const base = new THREE.Mesh(new THREE.BoxGeometry(48, 0.7, 34), slabMaterial)
  base.position.y = -0.35
  group.add(base)

  const floor2 = new THREE.Mesh(new THREE.BoxGeometry(38, 0.55, 24), slabMaterial)
  floor2.position.set(-3, 7.6, -1)
  group.add(floor2)

  const walls: Array<{ size: [number, number, number]; position: [number, number, number] }> = [
    { size: [48, 5, 0.7], position: [0, 2.4, -17] },
    { size: [48, 5, 0.7], position: [0, 2.4, 17] },
    { size: [0.7, 5, 34], position: [-24, 2.4, 0] },
    { size: [0.7, 5, 34], position: [24, 2.4, 0] },
    { size: [0.5, 4.5, 24], position: [-12, 9.8, -1] },
    { size: [0.5, 4.5, 24], position: [10, 9.8, -1] },
  ]

  walls.forEach((wall) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...wall.size), wallMaterial)
    mesh.position.set(...wall.position)
    group.add(mesh)
  })

  for (let index = 0; index < 5; index += 1) {
    const equipment = new THREE.Mesh(new THREE.BoxGeometry(4.5, 2.6, 3.2), equipmentMaterial)
    equipment.position.set(-16 + index * 8, 1.3, 7)
    group.add(equipment)
  }

  const restricted = new THREE.Mesh(new THREE.BoxGeometry(9, 0.15, 7), hazardMaterial)
  restricted.position.set(14, 0.15, -8)
  group.add(restricted)

  const grid = new THREE.GridHelper(58, 18, 0x9aa7b2, 0xd5dce2)
  grid.position.y = 0.02
  group.add(grid)

  return group
}

function createBriPlaceholderSite(THREE: typeof import('three')) {
  const group = new THREE.Group()
  const slabMaterial = new THREE.MeshStandardMaterial({ color: 0xe7e8e6, roughness: 0.9 })
  const deckMaterial = new THREE.MeshStandardMaterial({ color: 0xf4f4f1, roughness: 0.88 })
  const courtyardMaterial = new THREE.MeshStandardMaterial({ color: 0xc8ccca, roughness: 0.86 })
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xf3f4f1, roughness: 0.78 })
  const finMaterial = new THREE.MeshStandardMaterial({ color: 0xd7d9d7, roughness: 0.76 })
  const darkMassMaterial = new THREE.MeshStandardMaterial({ color: 0x303030, roughness: 0.82 })
  const bandMaterial = new THREE.MeshStandardMaterial({ color: 0x1f2428, roughness: 0.7 })
  const doorMaterial = new THREE.MeshStandardMaterial({ color: 0xb8753d, roughness: 0.68 })
  const railMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72 })

  addBox(THREE, group, slabMaterial, [70, 0.55, 48], [0, -0.28, 0])
  addBox(THREE, group, deckMaterial, [18, 0.6, 47], [-33, 0.05, -1.5])
  addBox(THREE, group, courtyardMaterial, [43, 0.45, 30], [8, 0.08, 1.5])

  addBox(THREE, group, wallMaterial, [60, 5.2, 1.2], [2, 2.6, -20])
  addBox(THREE, group, wallMaterial, [1.2, 5.2, 38], [-26, 2.6, -0.5])
  addBox(THREE, group, wallMaterial, [1.2, 8.2, 36], [30, 4.1, -2])
  addBox(THREE, group, wallMaterial, [21, 4.8, 1.2], [-17.5, 2.4, 20])
  addBox(THREE, group, wallMaterial, [19, 4.8, 1.2], [17.5, 2.4, 20])

  for (let index = 0; index < 13; index += 1) {
    const z = -17 + index * 2.65
    addBox(THREE, group, finMaterial, [1.5, 8.8, 1.35], [28.95, 4.4, z])
  }

  addBox(THREE, group, bandMaterial, [0.35, 0.28, 34], [29.25, 3.4, -1.8])
  addBox(THREE, group, bandMaterial, [0.35, 0.24, 34], [29.25, 5.75, -1.8])
  addBox(THREE, group, doorMaterial, [0.42, 2.7, 1.6], [28.7, 1.35, 2.6])

  addBox(THREE, group, darkMassMaterial, [10, 16, 9], [-4.5, 8, -5])
  addBox(THREE, group, darkMassMaterial, [7.5, 16, 18], [3.5, 8, -0.8])

  const triangularFace = new THREE.Shape()
  triangularFace.moveTo(-5.2, 0)
  triangularFace.lineTo(5.2, 0)
  triangularFace.lineTo(5.2, 10.5)
  triangularFace.lineTo(-5.2, 0)
  const triangularPanel = new THREE.Mesh(new THREE.ShapeGeometry(triangularFace), darkMassMaterial)
  triangularPanel.position.set(-4.7, 0.2, -9.55)
  group.add(triangularPanel)

  for (let index = 0; index < 7; index += 1) {
    addBox(THREE, group, railMaterial, [0.2, 1.25, 1.2], [-11 + index * 1.25, 0.95, 11.2])
  }
  addBox(THREE, group, railMaterial, [8.2, 0.2, 0.2], [-7.3, 1.65, 11.2])

  addBox(THREE, group, bandMaterial, [34, 0.1, 0.18], [19, 0.2, 23.3])
  addBox(THREE, group, bandMaterial, [0.18, 0.1, 16], [35.5, 0.2, 13.4])

  const grid = new THREE.GridHelper(74, 22, 0xb7bab9, 0xe0e2e1)
  grid.position.y = 0.04
  group.add(grid)

  group.rotation.y = -0.18
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
  return mesh
}
