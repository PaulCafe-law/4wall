import { Html } from '@react-three/drei';
import { useEffect, useState } from 'react';

export function WarehousePortal({
  position = [5.8, 0, -18.8],
  rotationY = Math.PI,
  label = '智慧倉儲模擬區',
  actionLabel = '進入',
  onActivate,
}: {
  position?: [number, number, number];
  rotationY?: number;
  label?: string;
  actionLabel?: string;
  onActivate: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  useEffect(() => () => {
    document.body.style.cursor = '';
  }, []);

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 1.9, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.7, 3.8, 0.28]} />
        <meshStandardMaterial color="#26343a" roughness={0.58} metalness={0.25} />
      </mesh>
      <mesh position={[0, 1.75, -0.17]} castShadow>
        <boxGeometry args={[3.15, 3.25, 0.12]} />
        <meshStandardMaterial
          color={hovered ? '#e2f2ef' : '#cbd8d6'}
          emissive={hovered ? '#e58a32' : '#4b7778'}
          emissiveIntensity={hovered ? 0.42 : 0.2}
          roughness={0.62}
        />
      </mesh>
      {Array.from({ length: 8 }, (_, index) => (
        <mesh key={index} position={[0, 0.38 + index * 0.39, -0.25]}>
          <boxGeometry args={[3, 0.035, 0.05]} />
          <meshStandardMaterial color="#617477" roughness={0.66} />
        </mesh>
      ))}
      <mesh position={[0, 3.93, -0.1]} castShadow>
        <boxGeometry args={[4.25, 0.46, 0.55]} />
        <meshStandardMaterial color="#e47c2b" emissive="#e47c2b" emissiveIntensity={0.16} roughness={0.6} />
      </mesh>
      <mesh
        position={[0, 1.75, -0.42]}
        onClick={(event) => {
          event.stopPropagation();
          onActivate();
        }}
        onPointerEnter={(event) => {
          event.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerLeave={() => {
          setHovered(false);
          document.body.style.cursor = '';
        }}
      >
        <planeGeometry args={[3.15, 3.25]} />
        <meshBasicMaterial transparent opacity={0.001} />
      </mesh>
      <pointLight position={[0, 2.3, -1.2]} color="#f2a255" intensity={hovered ? 7 : 4} distance={7} />
      <Html position={[0, 4.65, 0]} center zIndexRange={[60, 20]}>
        <button
          className="warehouse-portal-label"
          type="button"
          onPointerDown={(event) => {
            event.stopPropagation();
            onActivate();
          }}
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          <span>{label}</span>
          <strong>{actionLabel} →</strong>
        </button>
      </Html>
    </group>
  );
}
