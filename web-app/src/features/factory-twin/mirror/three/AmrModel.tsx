import { Component, Suspense, useMemo, type ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { FACTORY_THEME } from './factoryTheme';

const AMR_URL = '/factory-twin-assets/assets/amr.glb?v=20260702';
const TARGET_SPAN = 0.95;

function cloneMaterials(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map((m) => tuneMaterial(m.clone()));
    } else {
      mesh.material = tuneMaterial(mesh.material.clone());
    }
  });
}

function tuneMaterial(material: THREE.Material): THREE.Material {
  const m = material as THREE.MeshStandardMaterial;
  if ('roughness' in m) m.roughness = Math.max(m.roughness ?? 0.5, 0.55);
  if ('metalness' in m) m.metalness = Math.min(m.metalness ?? 0, 0.25);
  return material;
}

function normalizedClone(source: THREE.Object3D): THREE.Object3D {
  const obj = source.clone(true);
  cloneMaterials(obj);
  obj.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.z);
  const scale = span > 0 ? TARGET_SPAN / span : 1;
  obj.scale.setScalar(scale);
  obj.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(obj);
  const center = scaledBox.getCenter(new THREE.Vector3());
  obj.position.set(-center.x, -scaledBox.min.y, -center.z);
  obj.rotation.y = Math.PI;
  return obj;
}

function LoadedAmrModel() {
  const { scene } = useGLTF(AMR_URL);
  const clone = useMemo(() => normalizedClone(scene), [scene]);
  return <primitive object={clone} />;
}

function AmrFallbackGeometry() {
  return (
    <group>
      <mesh position={[0, 0.15, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.78, 0.22, 0.98]} />
        <meshStandardMaterial color={FACTORY_THEME.equipmentDark} roughness={0.72} />
      </mesh>
      <mesh position={[0, 0.3, -0.07]} castShadow>
        <boxGeometry args={[0.62, 0.14, 0.62]} />
        <meshStandardMaterial color="#e7ebee" roughness={0.65} />
      </mesh>
      <mesh position={[0, 0.4, -0.05]} castShadow>
        <boxGeometry args={[0.42, 0.1, 0.36]} />
        <meshStandardMaterial color={FACTORY_THEME.box} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.29, 0.45]} castShadow>
        <boxGeometry args={[0.58, 0.05, 0.08]} />
        <meshStandardMaterial color={FACTORY_THEME.orange} emissive={FACTORY_THEME.orange} emissiveIntensity={0.15} />
      </mesh>
    </group>
  );
}

class AmrModelBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[AMR] Failed to load AMR GLB; using fallback geometry.', error);
  }

  render() {
    return this.state.failed ? <AmrFallbackGeometry /> : this.props.children;
  }
}

export function AmrVisual() {
  return (
    <AmrModelBoundary>
      <Suspense fallback={<AmrFallbackGeometry />}>
        <LoadedAmrModel />
      </Suspense>
    </AmrModelBoundary>
  );
}

useGLTF.preload(AMR_URL);
