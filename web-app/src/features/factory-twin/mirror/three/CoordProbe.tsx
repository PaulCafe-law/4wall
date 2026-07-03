// Dev-only: while the GLB debug panel is open, clicking the floor reports the world (x, z)
// at that point (shown in the debug panel). Use it to read exact coordinates for placing
// spatial zones in src/domain/spatialZones.ts. Markers/zones sit above this plane, so their
// clicks take priority; only empty-floor clicks reach the probe.
import type { ThreeEvent } from '@react-three/fiber';
import { useFactoryStore } from '../store/factoryStore';

export function CoordProbe() {
  const debug = useFactoryStore((s) => s.debugOpen);
  const setProbedCoord = useFactoryStore((s) => s.setProbedCoord);
  if (!debug) return null;

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    setProbedCoord({ x: Math.round(e.point.x * 100) / 100, z: Math.round(e.point.z * 100) / 100 });
  };

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} onClick={onClick}>
      <planeGeometry args={[4000, 4000]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}
