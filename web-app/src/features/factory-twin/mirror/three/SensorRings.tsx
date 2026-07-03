import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FACTORY_THEME } from './factoryTheme';

interface GroundRingProps {
  color?: string;
  radius?: number;
  thickness?: number;
  opacity?: number;
  pulse?: boolean;
}

export function GroundRing({
  color = FACTORY_THEME.orange,
  radius = 1.3,
  thickness = 0.12,
  opacity = 0.85,
  pulse = false,
}: GroundRingProps) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!ref.current || !pulse) return;
    const t = clock.getElapsedTime();
    const s = 1 + Math.sin(t * 3.2) * 0.08;
    ref.current.scale.setScalar(s);
    const mat = ref.current.material as THREE.MeshBasicMaterial;
    mat.opacity = opacity * (0.72 + Math.sin(t * 3.2) * 0.2);
  });

  return (
    <mesh ref={ref} position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={6}>
      <ringGeometry args={[radius, radius + thickness, 80]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

export function AlertPulseRing({ radius = 1.55 }: { radius?: number }) {
  return <GroundRing color={FACTORY_THEME.alarm} radius={radius} thickness={0.16} opacity={0.9} pulse />;
}

export function AmrSensorRings({ active = true }: { active?: boolean }) {
  const outer = useRef<THREE.Mesh>(null);
  const inner = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!active) return;
    const t = clock.getElapsedTime();
    const wave = (Math.sin(t * 2.2) + 1) / 2;
    if (outer.current) {
      outer.current.scale.setScalar(1 + wave * 0.16);
      (outer.current.material as THREE.MeshBasicMaterial).opacity = 0.22 + wave * 0.18;
    }
    if (inner.current) {
      inner.current.scale.setScalar(1.02 + (1 - wave) * 0.08);
      (inner.current.material as THREE.MeshBasicMaterial).opacity = 0.35;
    }
  });

  return (
    <group>
      <mesh ref={inner} position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={5}>
        <ringGeometry args={[0.52, 0.58, 96]} />
        <meshBasicMaterial color={FACTORY_THEME.cyanSoft} transparent opacity={0.35} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={outer} position={[0, 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={5}>
        <ringGeometry args={[0.86, 0.92, 96]} />
        <meshBasicMaterial color={FACTORY_THEME.cyan} transparent opacity={0.3} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
