// Runs once when a GLB loads:
//   1) frames the camera to the whole factory (bbox-based), fixing near/far/distance so
//      the demo opens on a proper overview instead of inside a wall;
//   2) remaps UNBOUND entities (people / AMR / drone + not-yet-bound machines/zone) from
//      the placeholder coordinate space into the real factory footprint, so nothing floats
//      outside the building. Bound entities are left alone (already snapped to their mesh).
// Does not touch CameraRig's focus behaviour — it only sets the initial framing.
import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useFactoryStore } from '../store/factoryStore';
import {
  REAL_FACTORY_MOVEMENT_AREA,
  clampToMovementArea,
  insetMovementArea,
  type MovementArea,
} from '../domain/movementArea';
import { getSceneRoot } from './glbRegistry';

// The world-coordinate envelope the mock entities were authored in (see domain/mockData).
const SRC = { minX: -18, maxX: 18, minZ: -11, maxZ: 11 };
const INSET = 0.14; // keep remapped entities off the perimeter walls

const REAL_ENTITY_POSITIONS: Record<string, { x: number; z: number }> = {
  'amr-01': { x: 1.35, z: 5.2 },
  'amr-02': { x: 4.2, z: -3.8 },
  'p-xiaoming': { x: 3.4, z: -3.2 },
  'p-ahua': { x: 5.7, z: -10.2 },
  'p-meiling': { x: -0.55, z: -10.1 },
  'p-zhiqiang': { x: 6.6, z: -18.4 },
  'p-lin': { x: 1.25, z: 4.25 },
};

const REAL_AMR_ROUTES: Record<string, Array<{ x: number; z: number }>> = {
  'amr-01': [
    { x: 1.35, z: 5.2 },
    { x: 1.25, z: 1.5 },
    { x: 1.15, z: -3.8 },
    { x: 1.0, z: -7.9 },
    { x: 0.0, z: -7.9 },
    { x: 0.2, z: -2.2 },
  ],
  'amr-02': [
    { x: 4.2, z: -3.8 },
    { x: 4.9, z: -8.8 },
    { x: 5.7, z: -14.2 },
    { x: 5.9, z: -18.7 },
    { x: 4.3, z: -18.7 },
    { x: 4.1, z: -12.2 },
  ],
};

type OrbitLike =
  | {
      target: THREE.Vector3;
      update: () => void;
      minDistance?: number;
      maxDistance?: number;
      minZoom?: number;
      maxZoom?: number;
    }
  | null;

type FitCamera = THREE.OrthographicCamera | THREE.PerspectiveCamera;

function canFitCamera(camera: THREE.Camera): camera is FitCamera {
  return camera instanceof THREE.OrthographicCamera || camera instanceof THREE.PerspectiveCamera;
}

function fitCameraToBox(
  camera: THREE.Camera,
  controls: OrbitLike,
  box: THREE.Box3,
  viewport: { width: number; height: number },
) {
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(sphere.radius, 1);
  const dir = new THREE.Vector3(0.58, 0.72, 0.58).normalize();
  const target = new THREE.Vector3(center.x, box.min.y + size.y * 0.3, center.z);
  const distance = Math.max(radius * 2.6, 28);

  if (!canFitCamera(camera)) return;

  camera.position.copy(target).addScaledVector(dir, distance);
  camera.near = Math.max(0.02, radius / 140);
  camera.far = distance + radius * 5;
  camera.lookAt(target);

  if (camera instanceof THREE.OrthographicCamera) {
    const fitZoom = THREE.MathUtils.clamp(Math.min(viewport.width, viewport.height) / (radius * 2.15), 4, 22);
    camera.zoom = fitZoom;
    if (controls) {
      controls.minZoom = fitZoom * 0.5;
      controls.maxZoom = fitZoom * 12;
    }
  } else if (camera instanceof THREE.PerspectiveCamera) {
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const perspectiveDistance = (radius / Math.sin(fov / 2)) * 1.15;
    camera.position.copy(target).addScaledVector(dir, perspectiveDistance);
    if (controls) {
      controls.minDistance = radius * 0.2;
      controls.maxDistance = perspectiveDistance * 3;
    }
  }

  camera.updateProjectionMatrix();
  if (controls) {
    controls.target.copy(target);
    controls.update();
  }
}

export function FitToGlb() {
  const meshCount = useFactoryStore((s) => s.glbMeshNames.length);
  const boundIds = useFactoryStore((s) => s.boundEntityIds);
  const camera = useThree((s) => s.camera);
  const viewport = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as OrbitLike;
  const done = useRef(false);

  useEffect(() => {
    if (meshCount === 0) {
      done.current = false; // GLB unloaded -> allow a future fit
      return;
    }
    if (done.current) return;
    const root = getSceneRoot();
    if (!root) return;

    root.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const footprint = Math.max(size.x, size.z);
    if (footprint <= 0) return;

    // --- 1) camera fit: one-time overview fit. User zoom is not reset after this. ---
    fitCameraToBox(camera, controls, box, viewport);

    // --- 2) remap unbound entities into the real footprint ---
    const remapX = (x: number) => {
      const t = THREE.MathUtils.clamp((x - SRC.minX) / (SRC.maxX - SRC.minX), 0, 1);
      return box.min.x + (INSET + t * (1 - 2 * INSET)) * size.x;
    };
    const remapZ = (z: number) => {
      const t = THREE.MathUtils.clamp((z - SRC.minZ) / (SRC.maxZ - SRC.minZ), 0, 1);
      return box.min.z + (INSET + t * (1 - 2 * INSET)) * size.z;
    };
    const remapY = (type: string) => {
      const floor = box.min.y;
      if (type === 'camera') return floor + size.y * 0.62;
      if (type === 'drone') return floor + size.y * 0.5;
      return floor + size.y * 0.02;
    };
    const bboxMovementArea: MovementArea = {
      bounds: {
        minX: box.min.x + INSET * size.x,
        maxX: box.max.x - INSET * size.x,
        minZ: box.min.z + INSET * size.z,
        maxZ: box.max.z - INSET * size.z,
      },
      rects: [],
    };
    const useRealWalkableArea = box.min.x < -2 && box.max.x > 6 && box.min.z < -18 && box.max.z > 6;
    const movementAreaFor = (type: string) => {
      if (!useRealWalkableArea) return bboxMovementArea;
      if (type === 'amr') return insetMovementArea(REAL_FACTORY_MOVEMENT_AREA, 0.3);
      if (type === 'person') return insetMovementArea(REAL_FACTORY_MOVEMENT_AREA, 0.25);
      return REAL_FACTORY_MOVEMENT_AREA;
    };
    const withFloorY = (type: string, p: { x: number; z: number }) => ({ x: p.x, y: remapY(type), z: p.z });
    const remap = (type: string, v: { x: number; y: number; z: number }, area: MovementArea) =>
      clampToMovementArea(
        {
          x: remapX(v.x),
          y: remapY(type),
          z: remapZ(v.z),
        },
        area,
      );

    const store = useFactoryStore.getState();
    const bound = new Set(boundIds);
    for (const e of Object.values(store.entities)) {
      if (bound.has(e.id)) continue; // already snapped to its real mesh
      if (e.attrs?.fixedWorld) continue; // zones placed in real-world coords — leave as-is
      const movementArea = movementAreaFor(e.type);
      const realPosition = useRealWalkableArea ? REAL_ENTITY_POSITIONS[e.id] : undefined;
      const patch: Record<string, unknown> = {
        position: realPosition
          ? clampToMovementArea(withFloorY(e.type, realPosition), movementArea)
          : remap(e.type, e.position, movementArea),
        // reset sim anchors so wander/route re-center on the new spot, not the old mock one
        attrs: {
          ...(e.attrs ?? {}),
          ...(e.type === 'person' || e.type === 'amr'
            ? {
                movementBounds: movementArea.bounds,
                movementRects: movementArea.rects,
                movementObstacles: movementArea.obstacles ?? [],
              }
            : {}),
          home: undefined,
          routeIdx: 0,
        },
      };
      if (e.type === 'amr') {
        const realRoute = useRealWalkableArea ? REAL_AMR_ROUTES[e.id] : undefined;
        patch.route = (realRoute ?? e.route ?? []).map((p) =>
          clampToMovementArea(withFloorY('amr', p), movementArea),
        );
      }
      if (e.type === 'drone' && e.waypoints) {
        patch.waypoints = e.waypoints.map((p) => remap('drone', p, movementArea));
      }
      store.patchEntity(e.id, patch);
    }

    done.current = true;
  }, [meshCount, boundIds, camera, controls, viewport]);

  return null;
}
