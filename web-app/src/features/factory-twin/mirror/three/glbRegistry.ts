// Bridges a loaded GLB scene graph to entities. On register() it traverses the GLB,
// indexes every named object, resolves each entity's bound Object3D via meshBindings,
// clones the bound subtree's materials (so highlighting one mesh never bleeds onto a
// shared material), and remembers the original emissive so highlight can be undone.
import * as THREE from 'three';
import { resolveMeshBindings, normalizeName } from '../domain/meshBindings';

const meshByName = new Map<string, THREE.Object3D>(); // normalized name -> object
const objectByEntity = new Map<string, THREE.Object3D>();
let meshNames: string[] = [];
let sceneRoot: THREE.Object3D | null = null;

export interface GlbReport {
  meshNames: string[];
  boundIds: string[];
  boundMap: Record<string, string>; // entityId -> matched mesh name
}

export function resetGlb(): void {
  meshByName.clear();
  objectByEntity.clear();
  meshNames = [];
  sceneRoot = null;
}

export function registerGlb(root: THREE.Object3D): GlbReport {
  resetGlb();
  sceneRoot = root;
  const names: string[] = [];
  root.traverse((o) => {
    if (o.name) {
      names.push(o.name);
      meshByName.set(normalizeName(o.name), o);
    }
  });
  meshNames = Array.from(new Set(names));

  const boundMap = resolveMeshBindings(meshNames);
  for (const [entityId, matched] of Object.entries(boundMap)) {
    const obj = meshByName.get(normalizeName(matched));
    if (!obj) continue;
    objectByEntity.set(entityId, obj);
    isolateMaterials(obj);
  }

  hideOccluders(root);

  return { meshNames, boundIds: Object.keys(boundMap), boundMap };
}

// Hide top-cover meshes (roof) so the interior is visible from a 3/4-top "dollhouse" view.
// Bbox/footprint are unaffected (Box3 includes hidden meshes). Adjust patterns as needed.
const OCCLUDER_PATTERNS = ['roof'];
function hideOccluders(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !o.name) return;
    const n = normalizeName(o.name);
    if (OCCLUDER_PATTERNS.some((p) => n.includes(p))) o.visible = false;
  });
}

export function getObjectForEntity(entityId: string): THREE.Object3D | undefined {
  return objectByEntity.get(entityId);
}

/** The loaded GLB scene root (for bounding-box / camera fit). Null when no GLB is loaded. */
export function getSceneRoot(): THREE.Object3D | null {
  return sceneRoot;
}

/** Walk up from a clicked object to find which entity its subtree is bound to. */
export function getEntityForObject(obj: THREE.Object3D | null): string | undefined {
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    for (const [id, bound] of objectByEntity) {
      if (bound === cur) return id;
    }
    cur = cur.parent;
  }
  return undefined;
}

export function getCenter(obj: THREE.Object3D): THREE.Vector3 {
  const box = new THREE.Box3().setFromObject(obj);
  const c = new THREE.Vector3();
  box.getCenter(c);
  return c;
}

export function getBoundingBoxForEntity(entityId: string): THREE.Box3 | undefined {
  const obj = objectByEntity.get(entityId);
  if (!obj) return undefined;
  const box = new THREE.Box3().setFromObject(obj);
  return box.isEmpty() ? undefined : box;
}

// ---- highlight (emissive glow) on the real mesh -----------------------------

function eachMaterial(obj: THREE.Object3D, fn: (m: THREE.Material, mesh: THREE.Mesh) => void): void {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) fn(m, mesh);
  });
}

function isolateMaterials(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map((m) => prep(m.clone()));
    } else {
      mesh.material = prep(mesh.material.clone());
    }
  });
}

function prep(mat: THREE.Material): THREE.Material {
  const m = mat as THREE.MeshStandardMaterial;
  if (m.emissive) {
    m.userData.origEmissive = m.emissive.getHex();
    m.userData.origEmissiveIntensity = m.emissiveIntensity ?? 1;
  }
  return mat;
}

export function highlightEntityMesh(entityId: string, colorHex: string, intensity = 0.9): boolean {
  const obj = objectByEntity.get(entityId);
  if (!obj) return false;
  eachMaterial(obj, (mat, mesh) => {
    const box = new THREE.Box3().setFromObject(mesh);
    const size = box.getSize(new THREE.Vector3());
    if (Math.max(size.x, size.z) > 8 || size.y > 6) return;
    const m = mat as THREE.MeshStandardMaterial;
    if (m.emissive) {
      m.emissive.set(colorHex);
      m.emissiveIntensity = intensity;
    }
  });
  return true;
}

export function clearEntityMesh(entityId: string): void {
  const obj = objectByEntity.get(entityId);
  if (!obj) return;
  eachMaterial(obj, (mat) => {
    const m = mat as THREE.MeshStandardMaterial;
    if (m.emissive && m.userData.origEmissive !== undefined) {
      m.emissive.setHex(m.userData.origEmissive as number);
      m.emissiveIntensity = (m.userData.origEmissiveIntensity as number) ?? 1;
    }
  });
}
