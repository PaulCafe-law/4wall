// One clickable marker per entity. Color = overlay highlight if present, else the
// entity's base color. Position lerps toward the entity's (sim-updated) position so
// moving people / AMRs glide instead of teleporting.
import { useRef, type WheelEvent as ReactWheelEvent } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { Entity } from '../domain/entities';
import { useFactoryStore } from '../store/factoryStore';
import { ENTITY_COLOR, OVERLAY, machineColor } from '../domain/colors';
import { AmrVisual } from './AmrModel';
import { AlertPulseRing, AmrSensorRings, GroundRing } from './SensorRings';
import { FACTORY_THEME } from './factoryTheme';

function baseColor(e: Entity): string {
  if (e.type === 'machine') return machineColor(e.status);
  return ENTITY_COLOR[e.type] ?? '#cccccc';
}

function markerHeight(e: Entity): number {
  switch (e.type) {
    case 'person':
      return 1.05;
    case 'machine':
      return 1.4;
    case 'amr':
      return 0.42;
    default:
      return 1;
  }
}

function Geometry({ entity, color }: { entity: Entity; color: string }) {
  const matProps = { color, emissive: color, emissiveIntensity: 0.18, roughness: 0.68 };
  switch (entity.type) {
    case 'person':
      return (
        <group>
          <mesh position={[0, 0.36, 0]} castShadow>
            <cylinderGeometry args={[0.16, 0.2, 0.72, 12]} />
            <meshStandardMaterial color="#f1d37a" emissive="#c98222" emissiveIntensity={0.08} roughness={0.72} />
          </mesh>
          <mesh position={[0, 0.86, 0]} castShadow>
            <sphereGeometry args={[0.16, 16, 16]} />
            <meshStandardMaterial color="#f6e6c8" roughness={0.74} />
          </mesh>
        </group>
      );
    case 'machine':
      return (
        <mesh position={[0, 0.7, 0]} castShadow>
          <boxGeometry args={[2.2, 1.4, 1.6]} />
          <meshStandardMaterial {...matProps} />
        </mesh>
      );
    case 'camera':
      return (
        <group>
          <mesh castShadow>
            <boxGeometry args={[0.5, 0.4, 0.7]} />
            <meshStandardMaterial {...matProps} />
          </mesh>
          <mesh position={[0, 0, 0.5]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.18, 0.5, 12]} />
            <meshStandardMaterial {...matProps} />
          </mesh>
        </group>
      );
    case 'zone': {
      const sx = (entity.attrs?.sizeX as number) ?? 7;
      const sz = (entity.attrs?.sizeZ as number) ?? 7;
      const zc = (entity.attrs?.color as string) ?? color;
      return (
        <group>
          <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
            <planeGeometry args={[sx, sz]} />
            <meshStandardMaterial color={zc} transparent opacity={0.12} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          {/* raised outline so the area reads clearly on the real floor */}
          <lineSegments position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
            <edgesGeometry args={[new THREE.PlaneGeometry(sx, sz)]} />
            <lineBasicMaterial color={zc} transparent opacity={0.9} />
          </lineSegments>
          <mesh position={[0, 0.16, 0]} castShadow>
            <cylinderGeometry args={[0.36, 0.42, 0.22, 24]} />
            <meshStandardMaterial color={zc} transparent opacity={0.45} roughness={0.72} />
          </mesh>
        </group>
      );
    }
    case 'amr':
      return <AmrVisual />;
    case 'drone':
      return (
        <mesh castShadow>
          <octahedronGeometry args={[0.5, 0]} />
          <meshStandardMaterial {...matProps} />
        </mesh>
      );
    default:
      return (
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial {...matProps} />
        </mesh>
      );
  }
}

function BoundHitTarget({ entity }: { entity: Entity }) {
  if (entity.type !== 'machine') return null;
  return (
    <mesh position={[0, 0.9, 0]}>
      <boxGeometry args={[2.4, 1.8, 2.1]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

function InteractiveHitTarget({ entity }: { entity: Entity }) {
  if (entity.type === 'person') {
    return (
      <mesh position={[0, 1.05, 0]}>
        <cylinderGeometry args={[0.68, 0.68, 2.1, 18]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    );
  }
  if (entity.type === 'amr') {
    return (
      <mesh position={[0, 0.85, 0]}>
        <boxGeometry args={[2, 1.7, 2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    );
  }
  return null;
}

function forwardWheelToCanvas(event: ReactWheelEvent<HTMLButtonElement>) {
  event.preventDefault();
  event.stopPropagation();
  const canvas = document.querySelector('canvas');
  if (!canvas) return;
  canvas.dispatchEvent(
    new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: event.clientX,
      clientY: event.clientY,
      deltaMode: event.deltaMode,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      deltaZ: event.deltaZ,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
    }),
  );
}

function ScreenHitTarget({ entity, height }: { entity: Entity; height: number }) {
  if (entity.type !== 'person' && entity.type !== 'amr') return null;
  const select = useFactoryStore.getState().select;
  const size = entity.type === 'amr' ? 64 : 48;
  return (
    <Html position={[0, height, 0]} center zIndexRange={[40, 0]}>
      <button
        type="button"
        className="entity-screen-hit-target"
        style={{ width: size, height: size }}
        data-entity-hit={entity.id}
        aria-label={`選取 ${entity.name}`}
        onPointerDown={(event) => {
          event.stopPropagation();
          select(entity.id);
        }}
        onClick={(event) => {
          event.stopPropagation();
          select(entity.id);
        }}
        onWheel={forwardWheelToCanvas}
      />
    </Html>
  );
}

export function EntityMarker({ entity }: { entity: Entity }) {
  const ref = useRef<THREE.Group>(null);
  const select = useFactoryStore((s) => s.select);
  const selected = useFactoryStore((s) => s.selectedId === entity.id);
  const highlight = useFactoryStore((s) => s.highlights[entity.id]);
  const debugOpen = useFactoryStore((s) => s.debugOpen);
  // When the entity is bound to a real GLB mesh, that mesh IS the visual (and glows via
  // MeshHighlighter). We then skip the placeholder geometry and just float a label.
  const bound = useFactoryStore((s) => s.boundEntityIds.includes(entity.id));

  const target = new THREE.Vector3(entity.position.x, entity.position.y, entity.position.z);
  useFrame(() => {
    if (ref.current) ref.current.position.lerp(target, 0.15);
  });

  const color = highlight?.color ?? baseColor(entity);
  const isAlert = entity.status === 'alarm' || highlight?.color === OVERLAY.alarm || highlight?.color === FACTORY_THEME.alarm;
  const ringRadius = entity.type === 'person' ? 0.38 : entity.type === 'amr' ? 0.9 : entity.type === 'machine' ? 1.7 : 1.15;
  const showLabel = selected || !!highlight || (debugOpen && bound && entity.type === 'machine');
  const labelHeight = (bound ? 1.2 : markerHeight(entity)) + 0.6;

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    select(entity.id);
  };

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    select(entity.id);
  };

  return (
    <group
      ref={ref}
      position={[entity.position.x, entity.position.y, entity.position.z]}
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      {bound && <BoundHitTarget entity={entity} />}
      {!bound && <Geometry entity={entity} color={color} />}
      {!bound && <InteractiveHitTarget entity={entity} />}
      {entity.type === 'amr' && <AmrSensorRings active={entity.status === 'moving' || selected || !!highlight} />}
      {selected && <GroundRing color={FACTORY_THEME.orange} radius={ringRadius} thickness={0.12} opacity={0.9} pulse />}
      {!!highlight && !selected && <GroundRing color={color} radius={ringRadius} thickness={0.1} opacity={0.82} pulse={entity.type !== 'zone'} />}
      {isAlert && <AlertPulseRing radius={ringRadius + 0.22} />}
      <ScreenHitTarget entity={entity} height={labelHeight - 0.1} />
      {showLabel && (
        <Html position={[0, labelHeight, 0]} center zIndexRange={[12, 0]} style={{ pointerEvents: 'none' }}>
          <div className="marker-label">{entity.name}</div>
        </Html>
      )}
    </group>
  );
}
