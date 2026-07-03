// Loads the real factory GLB bundled into the Fourth Wall web app; otherwise renders simple
// placeholder geometry so the app runs out of the box. On load it registers the scene
// with glbRegistry (mesh index + entity bindings), reports to the store/console, snaps
// bound entities onto their mesh centers, and routes clicks on real meshes to selection.
import { useEffect } from 'react';
import { useGLTF, Html } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useFactoryStore } from '../store/factoryStore';
import { registerGlb, resetGlb, getEntityForObject, getObjectForEntity, getCenter } from './glbRegistry';
import { GlbErrorBoundary } from './GlbErrorBoundary';
import { SmartFactoryFallback } from './SmartFactoryFallback';
import { FACTORY_THEME, FLOOR_NAME_PATTERN, GLB_TARGET_SPAN, SHELL_NAME_PATTERN } from './factoryTheme';

const GLB_URL = '/factory-twin-assets/assets/factory.glb';
const DRACO_DECODER_PATH = '/factory-twin-assets/draco/gltf/';

useGLTF.preload(GLB_URL, DRACO_DECODER_PATH);

function normalizeFactoryScene(scene: THREE.Object3D): void {
  if (scene.userData.mfNormalized) return;

  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const horizontalSpan = Math.max(size.x, size.z);
  const scale = horizontalSpan > 0 ? GLB_TARGET_SPAN / horizontalSpan : 1;
  scene.scale.setScalar(scale);
  scene.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  scene.updateMatrixWorld(true);
  scene.userData.mfNormalized = true;
}

function tuneMaterialForPresentation(material: THREE.Material, label: string): THREE.Material {
  const clone = material.clone() as THREE.MeshStandardMaterial;
  const isShell = SHELL_NAME_PATTERN.test(label);
  const isFloor = FLOOR_NAME_PATTERN.test(label);

  if ('roughness' in clone) clone.roughness = Math.max(clone.roughness ?? 0.5, 0.62);
  if ('metalness' in clone) clone.metalness = Math.min(clone.metalness ?? 0, 0.18);

  if (clone.color && isFloor) {
    clone.color.set(FACTORY_THEME.floor);
    clone.transparent = false;
    clone.opacity = 1;
    clone.depthWrite = true;
  } else if (clone.color && isShell) {
    clone.color.set(FACTORY_THEME.wall);
    clone.transparent = true;
    clone.opacity = 0.54;
    clone.depthWrite = false;
    clone.side = THREE.DoubleSide;
  }

  return clone;
}

function styleFactoryScene(scene: THREE.Object3D): void {
  if (scene.userData.mfShellStyled) return;

  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const label = `${object.name} ${object.parent?.name ?? ''}`;
    const isShell = SHELL_NAME_PATTERN.test(label);

    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const styled = materials.map((material) => tuneMaterialForPresentation(material, label));
    mesh.material = Array.isArray(mesh.material) ? styled : styled[0];

    if (isShell) {
      // Ghosted architecture should reveal and not block picking real equipment behind it.
      mesh.raycast = () => undefined;
    }
  });

  scene.userData.mfShellStyled = true;
}

function getNearbyOverlayEntity(point: THREE.Vector3): string | null {
  const store = useFactoryStore.getState();
  let bestId: string | null = null;
  let bestScore = Infinity;

  for (const entity of Object.values(store.entities)) {
    if (entity.type !== 'person' && entity.type !== 'amr') continue;
    const radius = entity.type === 'amr' ? 1.35 : 0.85;
    const dx = entity.position.x - point.x;
    const dz = entity.position.z - point.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= radius && dist < bestScore) {
      bestId = entity.id;
      bestScore = dist;
    }
  }

  return bestId;
}

function RealFactory({ url }: { url: string }) {
  const { scene } = useGLTF(url, DRACO_DECODER_PATH);

  useEffect(() => {
    normalizeFactoryScene(scene);
    styleFactoryScene(scene);
    const report = registerGlb(scene);
    const store = useFactoryStore.getState();
    store.setGlbLoadState('ready');
    store.setGlbInfo(report.meshNames, report.boundIds, report.boundMap);

    // Snap each bound entity onto its mesh center so markers / links / camera focus
    // all point at the real geometry instead of the mock position.
    for (const id of report.boundIds) {
      const obj = getObjectForEntity(id);
      if (!obj) continue;
      const c = getCenter(obj);
      store.patchEntity(id, { position: { x: c.x, y: c.y, z: c.z } });
    }

    console.info('[GLB] loaded', report.meshNames.length, 'named meshes:', report.meshNames);
    console.info('[GLB] bound entities:', report.boundMap);

    return () => {
      resetGlb();
      const nextStore = useFactoryStore.getState();
      nextStore.setGlbInfo([], [], {});
      nextStore.setGlbLoadState('loading');
    };
  }, [scene]);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    const overlayId = getNearbyOverlayEntity(e.point);
    if (overlayId) {
      e.stopPropagation();
      useFactoryStore.getState().select(overlayId);
      return;
    }

    const id = getEntityForObject(e.object);
    if (!id) return; // let walls/floor clicks fall through (pointer-missed clears selection)
    e.stopPropagation();
    const store = useFactoryStore.getState();
    store.select(id);
  };

  return <primitive object={scene} onClick={onClick} />;
}

function GlbFailedNotice() {
  return (
    <Html center position={[0, 3, 0]}>
      <div className="glb-notice">GLB 載入失敗，使用備援場景</div>
    </Html>
  );
}

function GlbFailedFallback() {
  useEffect(() => {
    useFactoryStore.getState().setGlbLoadState('failed');
  }, []);

  return (
    <>
      <SmartFactoryFallback />
      <GlbFailedNotice />
    </>
  );
}

export function FactoryModel() {
  if (!GLB_URL) return <SmartFactoryFallback />;
  // If the GLB fails to load, fall back to the placeholder factory (never white-screen).
  return (
    <GlbErrorBoundary fallback={<GlbFailedFallback />}>
      <RealFactory url={GLB_URL} />
    </GlbErrorBoundary>
  );
}
