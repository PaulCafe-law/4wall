// The R3F canvas: lights, ground grid, the factory model (GLB or placeholder),
// one marker per entity, link lines, and the camera rig.
import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, OrbitControls, Html } from '@react-three/drei';
import { useFactoryStore } from '../store/factoryStore';
import { FactoryModel } from './FactoryModel';
import { EntityMarker } from './EntityMarker';
import { LinkLines } from './LinkLines';
import { CameraRig } from './CameraRig';
import { MeshHighlighter } from './MeshHighlighter';
import { FitToGlb } from './FitToGlb';
import { CoordProbe } from './CoordProbe';
import { CalloutOverlay } from './CalloutOverlay';
import { FACTORY_THEME, ISO_CAMERA } from './factoryTheme';

export function FactoryScene() {
  const entities = useFactoryStore((s) => s.entities);
  const select = useFactoryStore((s) => s.select);
  const glbLoadState = useFactoryStore((s) => s.glbLoadState);
  const showRuntimeOverlays = glbLoadState !== 'loading';

  return (
    <Canvas
      orthographic
      shadows="percentage"
      dpr={[1, 1.75]}
      camera={ISO_CAMERA}
      onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
      onPointerMissed={() => select(null)}
    >
      <color attach="background" args={[FACTORY_THEME.background]} />
      <ambientLight color="#f4f6f7" intensity={0.78} />
      <hemisphereLight args={['#f7fbff', '#161b21', 0.5]} />
      <directionalLight
        position={[18, 26, 16]}
        intensity={1.45}
        color="#ffffff"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-camera-left={-35}
        shadow-camera-right={35}
        shadow-camera-top={35}
        shadow-camera-bottom={-35}
      />

      <Suspense
        fallback={
          <Html center>
            <div className="glb-loading">載入靚程工廠 3D 模型…</div>
          </Html>
        }
      >
        <FactoryModel />
      </Suspense>

      {showRuntimeOverlays
        ? Object.values(entities).map((e) => <EntityMarker key={e.id} entity={e} />)
        : null}

      {showRuntimeOverlays ? <LinkLines /> : null}
      {showRuntimeOverlays ? <MeshHighlighter /> : null}
      <ContactShadows position={[0, -0.01, 0]} opacity={0.28} scale={55} blur={2.6} far={18} />
      {showRuntimeOverlays ? <CalloutOverlay /> : null}
      <FitToGlb />
      <CoordProbe />
      <CameraRig />

      <OrbitControls
        makeDefault
        enableDamping
        enablePan
        enableZoom
        maxZoom={220}
        zoomSpeed={0.55}
        minPolarAngle={0.7}
        maxPolarAngle={1.28}
      />
    </Canvas>
  );
}
