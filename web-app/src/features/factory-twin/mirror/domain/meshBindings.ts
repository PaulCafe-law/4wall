// ============================================================================
//  MESH BINDINGS  —  maps an entity id to candidate GLB mesh/node names.
//  Keep the first alias exact whenever possible. The real factory.glb currently names
//  the injection machines as Blender/Revit nodes such as "塑膠成型機HC600.003".
//  Chat/user aliases live on Entity.aliases; this file is for GLB node matching only.
// ============================================================================
export const MESH_BINDINGS: Record<string, string[]> = {
  'm-hc600': [
    '塑膠成型機HC600.001',
    'HC600.001',
    'HC600-01',
  ],
  'm-hc600-002': [
    '塑膠成型機HC600.002',
    'HC600.002',
    'HC600-02',
  ],
  'm-hc600-003': [
    '塑膠成型機HC600.003',
    'HC600.003',
    'HC600-03',
  ],
  'm-hc600-004': [
    '塑膠成型機HC600.004',
    'HC600.004',
    'HC600-04',
  ],
  'm-hc600-005': [
    '塑膠成型機HC600.005',
    'HC600.005',
    'HC600-05',
  ],
  'm-hc600-006': [
    '塑膠成型機HC600.006',
    'HC600.006',
    'HC600-06',
  ],
  'm-hc600-007': [
    '塑膠成型機HC600.007',
    'HC600.007',
    'HC600-07',
  ],
};

/** Entity ids that have a binding defined (regardless of whether the GLB matched). */
export const BOUND_ENTITY_IDS = Object.keys(MESH_BINDINGS);

export function aliasesForEntity(entityId: string): string[] {
  return MESH_BINDINGS[entityId] ?? [];
}

/** Normalize a name for fuzzy matching: lowercase, drop common separators and brackets. */
export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[\s_.()[\]{}-]/g, '').trim();
}

// ---- Pure matching (no three.js dependency, unit-testable) ----------------

/** Pick the GLB mesh name (from `meshNames`) that best matches an entity's aliases. */
export function resolveMeshName(entityId: string, meshNames: string[]): string | undefined {
  const aliases = aliasesForEntity(entityId).map(normalizeName);
  if (aliases.length === 0) return undefined;
  const norm = meshNames.map((raw) => ({ raw, n: normalizeName(raw) }));

  // 1) exact normalized match
  for (const a of aliases) {
    const hit = norm.find((m) => m.n === a);
    if (hit) return hit.raw;
  }
  // 2) guarded substring match (avoid noise from very short aliases)
  for (const a of aliases) {
    if (a.length < 4) continue;
    const hit = norm.find((m) => m.n.includes(a) || a.includes(m.n));
    if (hit) return hit.raw;
  }
  return undefined;
}

/**
 * Resolve all configured bindings while ensuring one GLB node is assigned to at most
 * one entity. This protects the demo from a broad alias accidentally binding every
 * HC600 entity to the first "HC600" node.
 */
export function resolveMeshBindings(
  meshNames: string[],
  entityIds = BOUND_ENTITY_IDS,
): Record<string, string> {
  const boundMap: Record<string, string> = {};
  const claimed = new Set<string>();

  for (const id of entityIds) {
    const available = meshNames.filter((name) => !claimed.has(normalizeName(name)));
    const matched = resolveMeshName(id, available);
    if (!matched) continue;
    boundMap[id] = matched;
    claimed.add(normalizeName(matched));
  }

  return boundMap;
}

/** Reverse: given a GLB mesh name, which entity (if any) does it belong to? */
export function entityIdForMeshName(meshName: string, entityIds = BOUND_ENTITY_IDS): string | undefined {
  for (const id of entityIds) {
    if (resolveMeshName(id, [meshName])) return id;
  }
  return undefined;
}
