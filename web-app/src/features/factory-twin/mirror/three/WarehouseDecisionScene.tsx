import { Html, Line, OrbitControls, OrthographicCamera } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { AgvRoute } from '../warehouse/routing';
import type { WarehouseLayout, WarehousePoint } from '../warehouse/layout';
import { readyWarehousePlans } from '../warehouse/decision';
import { useFactoryStore } from '../store/factoryStore';
import { useWarehouseDemoStore } from '../store/warehouseDemoStore';
import { AmrVisual } from './AmrModel';
import { WarehousePortal } from './WarehousePortal';

const AISLE_X = [-9, -3, 3, 9];
const RACK_X = [-11.2, -6.8, -5.2, -0.8, 0.8, 5.2, 6.8, 11.2];
const BAY_Z = [-8.75, -5.25, -1.75, 1.75, 5.25, 8.75];
const ROUTE_COLORS = ['#e27628', '#087b7a', '#b63d32', '#72853d'];
const BOX_COLORS = ['#b98d5c', '#d9b574', '#6e8792', '#a6ada4', '#c76b41'];

function WarehouseCameraFit() {
  const size = useThree((state) => state.size);
  const zoom = Math.max(8.5, Math.min(24, size.width / 34, size.height / 31));
  return (
    <OrthographicCamera
      makeDefault
      position={[23, 22, 27]}
      zoom={zoom}
      near={0.1}
      far={150}
      onUpdate={(camera) => camera.lookAt(0, 0.7, 0)}
    />
  );
}

function RackBank({ x, rowIndex, heatByBay }: { x: number; rowIndex: number; heatByBay: number[] }) {
  return (
    <group position={[x, 0, 0]}>
      {BAY_Z.map((z, bayIndex) => (
        <group key={z} position={[0, 0, z]}>
          {[-1.58, 1.58].map((offset) => (
            <mesh key={offset} position={[0, 1.95, offset]} castShadow>
              <boxGeometry args={[0.16, 3.9, 0.16]} />
              <meshStandardMaterial color="#315d62" metalness={0.3} roughness={0.56} />
            </mesh>
          ))}
          {[0.46, 1.32, 2.18, 3.04].map((height, levelIndex) => (
            <group key={height}>
              <mesh position={[0, height, 0]} castShadow>
                <boxGeometry args={[1.25, 0.12, 3.05]} />
                <meshStandardMaterial color="#d56f28" metalness={0.2} roughness={0.58} />
              </mesh>
              <mesh position={[0, height + 0.31, -0.72]} castShadow receiveShadow>
                <boxGeometry args={[0.88, 0.5, 1.02]} />
                <meshStandardMaterial
                  color={
                    heatByBay[bayIndex] >= 0.72
                      ? '#c84d32'
                      : heatByBay[bayIndex] >= 0.42
                        ? '#e4a13e'
                        : BOX_COLORS[(rowIndex * 7 + bayIndex * 3 + levelIndex) % BOX_COLORS.length]
                  }
                  emissive={heatByBay[bayIndex] >= 0.72 ? '#8f241d' : '#000000'}
                  emissiveIntensity={heatByBay[bayIndex] >= 0.72 ? 0.16 : 0}
                  roughness={0.82}
                />
              </mesh>
              {(rowIndex + bayIndex + levelIndex) % 3 !== 0 ? (
                <mesh position={[0, height + 0.25, 0.66]} castShadow receiveShadow>
                  <boxGeometry args={[0.78, 0.4, 0.92]} />
                  <meshStandardMaterial
                    color={
                      heatByBay[bayIndex] >= 0.72
                        ? '#c84d32'
                        : heatByBay[bayIndex] >= 0.42
                          ? '#e4a13e'
                          : BOX_COLORS[(rowIndex * 5 + bayIndex + levelIndex + 2) % BOX_COLORS.length]
                    }
                    emissive={heatByBay[bayIndex] >= 0.72 ? '#8f241d' : '#000000'}
                    emissiveIntensity={heatByBay[bayIndex] >= 0.72 ? 0.16 : 0}
                    roughness={0.82}
                  />
                </mesh>
              ) : null}
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}

function Workstation({ index, x }: { index: number; x: number }) {
  const unavailable = index === 2;
  return (
    <group position={[x, 0, 11]}>
      <mesh position={[0, 0.52, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.2, 1.04, 1.45]} />
        <meshStandardMaterial color={unavailable ? '#b94737' : '#dfe7e7'} roughness={0.64} />
      </mesh>
      <mesh position={[0, 1.32, -0.12]} castShadow>
        <boxGeometry args={[1.25, 0.72, 0.16]} />
        <meshStandardMaterial
          color="#25363b"
          emissive={unavailable ? '#c84535' : '#2a9c9a'}
          emissiveIntensity={0.38}
        />
      </mesh>
      <Html position={[0, 1.9, 0]} center>
        <span className={`warehouse-scene-label ${unavailable ? 'warning' : ''}`}>
          WS-{String(index + 1).padStart(2, '0')}
        </span>
      </Html>
    </group>
  );
}

function mapWarehousePoint(point: WarehousePoint, layout: WarehouseLayout): THREE.Vector3 {
  if (point.y >= layout.rows) {
    const workstationIndex = Math.max(0, Math.min(2, Math.round((point.x / layout.columns) * 2)));
    return new THREE.Vector3([-5, 0.09, 5][workstationIndex], 0.09, 10);
  }
  const aisleIndex = Math.max(0, Math.min(AISLE_X.length - 1, Math.floor((point.x / layout.columns) * AISLE_X.length)));
  const z = 8.4 - (point.y / Math.max(1, layout.rows)) * 16.8;
  return new THREE.Vector3(AISLE_X[aisleIndex], 0.09, z);
}

function pushDistinct(points: THREE.Vector3[], point: THREE.Vector3): void {
  const previous = points[points.length - 1];
  if (!previous || previous.distanceToSquared(point) > 0.01) points.push(point);
}

function visualRoute(route: AgvRoute, layout: WarehouseLayout): THREE.Vector3[] {
  const logical = route.waypoints.slice(0, 34).map((point) => mapWarehousePoint(point, layout));
  const safe: THREE.Vector3[] = [];
  for (const target of logical) {
    const current = safe[safe.length - 1];
    if (current && Math.abs(current.x - target.x) > 0.1) {
      const crossAisleZ = Math.abs(current.z - 9.8) + Math.abs(target.z - 9.8) <=
        Math.abs(current.z + 9.8) + Math.abs(target.z + 9.8)
        ? 9.8
        : -9.8;
      pushDistinct(safe, new THREE.Vector3(current.x, 0.09, crossAisleZ));
      pushDistinct(safe, new THREE.Vector3(target.x, 0.09, crossAisleZ));
    }
    pushDistinct(safe, target);
  }
  return safe.length > 1 ? safe : [new THREE.Vector3(-9, 0.09, 10), new THREE.Vector3(-9, 0.09, -8)];
}

function WarehouseAmr({ points, index, agvId }: { points: THREE.Vector3[]; index: number; agvId: string }) {
  const ref = useRef<THREE.Group>(null);
  const progressRef = useRef(index * 8.5);
  const paused = useFactoryStore((state) => state.simPaused);
  const speed = useFactoryStore((state) => state.simSpeed);
  const position = useMemo(() => new THREE.Vector3(), []);
  const direction = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    const group = ref.current;
    if (!group || points.length < 2) return;
    if (!paused) progressRef.current += Math.min(delta, 0.08) * speed * 0.72;
    const progress = progressRef.current % (points.length - 1);
    const segment = Math.floor(progress);
    const amount = progress - segment;
    position.copy(points[segment]).lerp(points[segment + 1], amount);
    direction.copy(points[segment + 1]).sub(points[segment]);
    group.position.copy(position);
    if (direction.lengthSq() > 0.001) group.rotation.y = Math.atan2(direction.x, direction.z);
  });

  return (
    <group ref={ref} scale={0.85}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
        <ringGeometry args={[0.55, 0.72, 28]} />
        <meshBasicMaterial color={ROUTE_COLORS[index % ROUTE_COLORS.length]} transparent opacity={0.82} />
      </mesh>
      <AmrVisual />
      <pointLight position={[0, 0.4, 0.25]} color={ROUTE_COLORS[index % ROUTE_COLORS.length]} intensity={1.7} distance={2.5} />
      <Html position={[0, 1.25, 0]} center zIndexRange={[30, 10]}>
        <span className="warehouse-amr-label" style={{ borderColor: ROUTE_COLORS[index % ROUTE_COLORS.length] }}>
          {agvId}
        </span>
      </Html>
    </group>
  );
}

function WarehouseWorld() {
  const planSet = useWarehouseDemoStore((state) => state.planSet);
  const selectedPlanId = useWarehouseDemoStore((state) => state.selectedPlanId);
  const beginTransition = useWarehouseDemoStore((state) => state.beginTransition);
  const plans = readyWarehousePlans(planSet);
  const selected = plans.find((plan) => plan.id === selectedPlanId) ?? plans[0];
  const routePoints = useMemo(() => {
    if (!selected || !planSet) return [];
    return selected.routes.map((route) => visualRoute(route, planSet.layout));
  }, [planSet, selected]);
  const rackHeat = useMemo(
    () =>
      RACK_X.map((_, rowIndex) =>
        BAY_Z.map((_, bayIndex) => {
          if (!selected) return 0;
          const first = selected.cellPickCounts[`cell-${rowIndex}-${bayIndex * 2}`] ?? 0;
          const second = selected.cellPickCounts[`cell-${rowIndex}-${bayIndex * 2 + 1}`] ?? 0;
          return Math.min(1, (first + second) / Math.max(1, selected.maxCellPicks * 1.45));
        }),
      ),
    [selected],
  );

  return (
    <>
      <color attach="background" args={['#cfd7d8']} />
      <fog attach="fog" args={['#cfd7d8', 35, 62]} />
      <ambientLight intensity={0.86} color="#f7f4ec" />
      <hemisphereLight args={['#f4fbff', '#677174', 0.72]} />
      <directionalLight
        position={[16, 28, 18]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
      />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[32, 27]} />
        <meshStandardMaterial color="#d9ddda" roughness={0.94} />
      </mesh>
      <mesh position={[0, 3.8, -13.2]} receiveShadow>
        <boxGeometry args={[32, 7.6, 0.3]} />
        <meshStandardMaterial color="#e8ebe7" roughness={0.86} />
      </mesh>
      <mesh position={[-15.8, 3.1, 0]} receiveShadow>
        <boxGeometry args={[0.3, 6.2, 26.5]} />
        <meshStandardMaterial color="#e1e5e2" roughness={0.86} />
      </mesh>
      {AISLE_X.map((x) => (
        <group key={x}>
          <mesh position={[x, 0.018, 0]}>
            <boxGeometry args={[2.3, 0.025, 22.2]} />
            <meshStandardMaterial color="#c7cecb" roughness={0.95} />
          </mesh>
          {[-9.8, 9.8].map((z) => (
            <mesh key={z} position={[x, 0.035, z]}>
              <boxGeometry args={[2.3, 0.03, 0.1]} />
              <meshStandardMaterial color="#f0aa46" roughness={0.8} />
            </mesh>
          ))}
        </group>
      ))}
      {RACK_X.map((x, index) => <RackBank key={x} x={x} rowIndex={index} heatByBay={rackHeat[index]} />)}

      {[-5, 0, 5].map((x, index) => <Workstation key={x} index={index} x={x} />)}
      <group position={[-12.7, 0, 11]}>
        <mesh position={[0, 0.04, 0]}>
          <boxGeometry args={[3.2, 0.08, 2.2]} />
          <meshStandardMaterial color="#e4b549" roughness={0.78} />
        </mesh>
        <Html position={[0, 0.2, 0]} center>
          <span className="warehouse-scene-label">AMR 充電區</span>
        </Html>
      </group>
      <group position={[12.4, 0, -10.8]}>
        <mesh position={[0, 0.04, 0]}>
          <boxGeometry args={[4.4, 0.08, 2.4]} />
          <meshStandardMaterial color="#5c8685" roughness={0.78} />
        </mesh>
        <Html position={[0, 0.2, 0]} center>
          <span className="warehouse-scene-label">收貨與緩衝區</span>
        </Html>
      </group>

      {selected && planSet
        ? routePoints.map((points, index) => (
            <group key={selected.routes[index]?.agvId ?? index}>
              <Line
                points={points}
                color={ROUTE_COLORS[index % ROUTE_COLORS.length]}
                lineWidth={3}
                dashed
                dashSize={0.5}
                gapSize={0.26}
                transparent
                opacity={0.72}
              />
              <WarehouseAmr
                points={points}
                index={index}
                agvId={(selected.routes[index]?.agvId ?? `AGV-${index + 1}`).replace(/^AGV-/, 'AMR-')}
              />
            </group>
          ))
        : null}

      <WarehousePortal
        position={[14.1, 0, 9.7]}
        rotationY={-Math.PI / 2}
        label="成型工廠"
        actionLabel="返回"
        onActivate={() => beginTransition('factory')}
      />

      <WarehouseCameraFit />

      <OrbitControls
        makeDefault
        enableDamping
        enablePan
        enableZoom
        minZoom={15}
        maxZoom={58}
        minPolarAngle={0.72}
        maxPolarAngle={1.28}
        target={[0, 0.7, 0]}
      />
    </>
  );
}

export default function WarehouseDecisionScene() {
  return (
    <Canvas
      orthographic
      shadows="percentage"
      dpr={[1, 1.65]}
      camera={{ position: [23, 22, 27], zoom: 24, near: 0.1, far: 150 }}
      onCreated={({ camera }) => camera.lookAt(0, 0.7, 0)}
    >
      <Suspense
        fallback={
          <Html center>
            <div className="glb-loading">載入 3D 智慧倉儲…</div>
          </Html>
        }
      >
        <WarehouseWorld />
      </Suspense>
    </Canvas>
  );
}
