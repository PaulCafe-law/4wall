// One clickable marker per entity. Color = overlay highlight if present, else the
// entity's base color. Position lerps toward the entity's (sim-updated) position so
// moving people / AMRs glide instead of teleporting.
import { useEffect, useRef, type WheelEvent as ReactWheelEvent } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { Entity } from '../domain/entities';
import { useFactoryStore } from '../store/factoryStore';
import { ENTITY_COLOR, OVERLAY, machineColor } from '../domain/colors';
import { broadcastLivePersonAnchorPreview } from '../domain/machineCameras';
import { AmrVisual } from './AmrModel';
import { AlertPulseRing, AmrSensorRings, GroundRing } from './SensorRings';
import { FACTORY_THEME } from './factoryTheme';

// 現場真人(source:'live')專用配色:醒目螢光綠,和模擬人員(奶油色)一眼區隔——
// 讓使用者立刻看出「這是攝影機真的偵測到的人」,不會淹沒在常駐的模擬人員裡。
const LIVE_PERSON_COLOR = '#2fd27a';
const LIVE_PERSON_EMISSIVE = '#0f9d58';
const LIVE_PERSON_DRAG_Y = 0.05;

function isAnchorPickerMode(): boolean {
  return globalThis.location?.search.includes('anchorPicker=1') === true;
}

function isDraggableLiveAnchor(entity: Entity): boolean {
  return (
    isAnchorPickerMode() &&
    entity.type === 'person' &&
    entity.source === 'live' &&
    (entity.attrs?.anchorPreview === true || entity.attrs?.placementRule === 'hc600_01_left_side_anchor')
  );
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function stopCanvasGesture(e: ThreeEvent<PointerEvent>) {
  e.stopPropagation();
  e.nativeEvent.preventDefault();
  e.nativeEvent.stopPropagation();
  e.nativeEvent.stopImmediatePropagation?.();
}

function baseColor(e: Entity): string {
  if (e.type === 'machine') return machineColor(e.status);
  if (e.type === 'device') {
    if (e.status === 'simulated') return '#d9a441';
    if (e.status === 'stale') return '#a56a16';
    if (e.status === 'unavailable') return '#7a807a';
    if (e.status === 'loading') return '#9ad0d2';
  }
  return ENTITY_COLOR[e.type] ?? '#cccccc';
}

function markerHeight(e: Entity): number {
  switch (e.type) {
    case 'person':
      return 1.05;
    case 'machine':
      return 1.4;
    case 'device':
      return 1.1;
    case 'amr':
      return 0.42;
    default:
      return 1;
  }
}

function Geometry({ entity, color }: { entity: Entity; color: string }) {
  const matProps = { color, emissive: color, emissiveIntensity: 0.18, roughness: 0.68 };
  switch (entity.type) {
    case 'person': {
      const live = entity.source === 'live';
      const bodyColor = live ? LIVE_PERSON_COLOR : '#f1d37a';
      const bodyEmissive = live ? LIVE_PERSON_EMISSIVE : '#c98222';
      return (
        <group>
          <mesh position={[0, 0.36, 0]} castShadow>
            <cylinderGeometry args={[0.16, 0.2, 0.72, 12]} />
            <meshStandardMaterial color={bodyColor} emissive={bodyEmissive} emissiveIntensity={live ? 0.4 : 0.08} roughness={0.72} />
          </mesh>
          <mesh position={[0, 0.86, 0]} castShadow>
            <sphereGeometry args={[0.16, 16, 16]} />
            <meshStandardMaterial color={live ? '#eafff4' : '#f6e6c8'} emissive={live ? bodyEmissive : '#000000'} emissiveIntensity={live ? 0.25 : 0} roughness={0.74} />
          </mesh>
          {/* 頭頂螢光信標:高過機台(1.4)頂端,讓真人即使站在機台旁也會冒出頭、看得到。 */}
          {live && (
            <mesh position={[0, 1.95, 0]}>
              <octahedronGeometry args={[0.2, 0]} />
              <meshStandardMaterial color={bodyColor} emissive={bodyEmissive} emissiveIntensity={0.7} roughness={0.4} />
            </mesh>
          )}
        </group>
      );
    }
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
    case 'device': {
      const ledColor =
        entity.status === 'live'
          ? '#2fd27a'
          : entity.status === 'stale'
            ? '#d9a441'
          : entity.status === 'simulated'
            ? '#d9a441'
            : entity.status === 'loading'
              ? '#9ad0d2'
              : '#7a807a';
      return (
        <group>
          <mesh position={[0, 0.42, 0]} castShadow>
            <boxGeometry args={[1.05, 0.84, 0.72]} />
            <meshStandardMaterial color="#18252a" metalness={0.28} roughness={0.58} />
          </mesh>
          <mesh position={[0, 0.43, 0.375]} castShadow>
            <boxGeometry args={[0.82, 0.58, 0.05]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={0.22}
              roughness={0.48}
            />
          </mesh>
          <mesh position={[-0.27, 0.43, 0.415]}>
            <boxGeometry args={[0.18, 0.12, 0.04]} />
            <meshStandardMaterial color="#050608" roughness={0.72} />
          </mesh>
          <mesh position={[0.28, 0.58, 0.43]}>
            <sphereGeometry args={[0.075, 16, 16]} />
            <meshStandardMaterial
              color={ledColor}
              emissive={ledColor}
              emissiveIntensity={0.9}
              roughness={0.3}
            />
          </mesh>
          <mesh position={[0, 0.94, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 0.34, 10]} />
            <meshStandardMaterial color="#7f8f93" metalness={0.45} roughness={0.42} />
          </mesh>
        </group>
      );
    }
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
  if (entity.type === 'device') {
    return (
      <mesh position={[0, 0.7, 0]}>
        <boxGeometry args={[1.55, 1.65, 1.45]} />
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
  if (entity.type !== 'person' && entity.type !== 'amr' && entity.type !== 'device') return null;
  const select = useFactoryStore.getState().select;
  const size = entity.type === 'person' ? 48 : 64;
  const ariaLabel =
    entity.type === 'device' && entity.deviceKind === 'openbmc_pi5'
      ? '查看 Pi5 OpenBMC 資訊'
      : `選取 ${entity.name}`;
  return (
    <Html position={[0, height, 0]} center zIndexRange={[40, 0]}>
      <button
        type="button"
        className="entity-screen-hit-target"
        style={{ width: size, height: size }}
        data-entity-hit={entity.id}
        aria-label={ariaLabel}
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
  const dragging = useRef(false);
  const dragPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), -LIVE_PERSON_DRAG_Y));
  const dragPoint = useRef(new THREE.Vector3());
  const select = useFactoryStore((s) => s.select);
  const setProbedCoord = useFactoryStore((s) => s.setProbedCoord);
  const setLivePersonAnchorDragging = useFactoryStore((s) => s.setLivePersonAnchorDragging);
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
  // 現場真人永遠標示身分:醒目名牌 + 持續脈動光環,一眼認得出它是真的偵測到的人。
  const isLivePerson = entity.type === 'person' && entity.source === 'live';
  const draggableLiveAnchor = isDraggableLiveAnchor(entity);
  const ringRadius =
    entity.type === 'person'
      ? 0.38
      : entity.type === 'amr' || entity.type === 'device'
        ? 0.9
        : entity.type === 'machine'
          ? 1.7
          : 1.15;
  const showLabel =
    selected ||
    !!highlight ||
    isLivePerson ||
    entity.type === 'device' ||
    (debugOpen && bound && entity.type === 'machine');
  const labelHeight = (bound ? 1.2 : markerHeight(entity)) + 0.6;

  useEffect(() => {
    return () => {
      if (dragging.current) setLivePersonAnchorDragging(false);
    };
  }, [setLivePersonAnchorDragging]);

  const moveLiveAnchor = (e: ThreeEvent<PointerEvent>) => {
    const point = e.ray.intersectPlane(dragPlane.current, dragPoint.current)
      ? dragPoint.current
      : e.point;
    const anchor = { x: round2(point.x), y: LIVE_PERSON_DRAG_Y, z: round2(point.z) };
    setProbedCoord({ x: anchor.x, z: anchor.z });
    const state = useFactoryStore.getState();
    const nextPeople = state.livePersons.map((person) =>
      person.id === entity.id || person.attrs?.anchorPreview === true
        ? {
            ...person,
            position: anchor,
            attrs: {
              ...(person.attrs ?? {}),
              fixedWorld: true,
              approximate: true,
              placementRule: 'hc600_01_left_side_anchor',
            },
          }
        : person,
    );
    if (nextPeople.length > 0) state.setLivePersons(nextPeople);
    broadcastLivePersonAnchorPreview(anchor);
  };

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    select(entity.id);
  };

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    select(entity.id);
    if (!draggableLiveAnchor) return;
    dragging.current = true;
    setLivePersonAnchorDragging(true);
    stopCanvasGesture(e);
    (e.target as HTMLElement | null)?.setPointerCapture?.(e.pointerId);
    moveLiveAnchor(e);
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging.current || !draggableLiveAnchor) return;
    stopCanvasGesture(e);
    moveLiveAnchor(e);
  };

  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return;
    stopCanvasGesture(e);
    dragging.current = false;
    setLivePersonAnchorDragging(false);
    (e.target as HTMLElement | null)?.releasePointerCapture?.(e.pointerId);
  };

  return (
    <group
      ref={ref}
      position={[entity.position.x, entity.position.y, entity.position.z]}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={onClick}
    >
      {bound && <BoundHitTarget entity={entity} />}
      {!bound && <Geometry entity={entity} color={color} />}
      {!bound && <InteractiveHitTarget entity={entity} />}
      {entity.type === 'amr' && <AmrSensorRings active={entity.status === 'moving' || selected || !!highlight} />}
      {selected && <GroundRing color={FACTORY_THEME.orange} radius={ringRadius} thickness={0.12} opacity={0.9} pulse />}
      {!!highlight && !selected && <GroundRing color={color} radius={ringRadius} thickness={0.1} opacity={0.82} pulse={entity.type !== 'zone'} />}
      {isLivePerson && !selected && !highlight && (
        <GroundRing color={LIVE_PERSON_COLOR} radius={0.52} thickness={0.12} opacity={0.92} pulse />
      )}
      {isAlert && <AlertPulseRing radius={ringRadius + 0.22} />}
      {!draggableLiveAnchor && <ScreenHitTarget entity={entity} height={labelHeight - 0.1} />}
      {showLabel && (
        <Html position={[0, labelHeight, 0]} center zIndexRange={[12, 0]} style={{ pointerEvents: 'none' }}>
          <div className={`marker-label ${entity.type === 'device' ? 'device-label' : ''}`}>
            {entity.name}
            {entity.type === 'device' ? (
              <span className={`device-source ${entity.status}`}>{entity.status.toUpperCase()}</span>
            ) : null}
          </div>
        </Html>
      )}
    </group>
  );
}
