// Applies/clears emissive glow on REAL GLB meshes for highlighted + selected entities.
// Entities without a bound mesh are untouched here — their EntityMarker handles highlight.
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFactoryStore } from '../store/factoryStore';
import { highlightEntityMesh, clearEntityMesh, getBoundingBoxForEntity } from './glbRegistry';
import { FACTORY_THEME } from './factoryTheme';

const SELECTION_COLOR = FACTORY_THEME.orange;

interface OutlineItem {
  id: string;
  color: string;
  box: THREE.Box3;
}

function MeshBoundsOutline({ item }: { item: OutlineItem }) {
  const helper = useMemo(() => new THREE.Box3Helper(item.box, item.color), [item.box, item.color]);

  useEffect(
    () => () => {
      helper.geometry.dispose();
      const material = helper.material;
      if (Array.isArray(material)) {
        for (const m of material) m.dispose();
      } else {
        material.dispose();
      }
    },
    [helper],
  );

  return <primitive object={helper} />;
}

export function MeshHighlighter() {
  const highlights = useFactoryStore((s) => s.highlights);
  const selectedId = useFactoryStore((s) => s.selectedId);
  const boundEntityIds = useFactoryStore((s) => s.boundEntityIds);
  const applied = useRef<Set<string>>(new Set());
  const wantedHighlights = useMemo(() => {
    const bound = new Set(boundEntityIds);
    const want = new Map<string, string>(); // entityId -> color
    for (const [id, h] of Object.entries(highlights)) {
      if (bound.has(id)) want.set(id, h.color);
    }
    if (selectedId && bound.has(selectedId) && !want.has(selectedId)) {
      want.set(selectedId, SELECTION_COLOR);
    }
    return want;
  }, [highlights, selectedId, boundEntityIds]);

  const outlines = useMemo(
    () =>
      Array.from(wantedHighlights.entries()).flatMap(([id, color]) => {
        const box = getBoundingBoxForEntity(id);
        return box ? [{ id, color, box }] : [];
      }),
    [wantedHighlights],
  );

  useEffect(() => {
    // clear meshes no longer wanted
    for (const id of applied.current) {
      if (!wantedHighlights.has(id)) clearEntityMesh(id);
    }
    // apply wanted
    for (const [id, color] of wantedHighlights) {
      highlightEntityMesh(id, color);
    }
    applied.current = new Set(wantedHighlights.keys());
  }, [wantedHighlights]);

  return (
    <>
      {outlines.map((item) => (
        <MeshBoundsOutline key={item.id} item={item} />
      ))}
    </>
  );
}
