import * as THREE from 'three';
import { FACTORY_THEME } from './factoryTheme';

function Box({
  position,
  args,
  color,
  opacity = 1,
}: {
  position: [number, number, number];
  args: [number, number, number];
  color: string;
  opacity?: number;
}) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={args} />
      <meshStandardMaterial color={color} roughness={0.72} transparent={opacity < 1} opacity={opacity} />
    </mesh>
  );
}

function LowWall({ position, args }: { position: [number, number, number]; args: [number, number, number] }) {
  return <Box position={position} args={args} color={FACTORY_THEME.wall} />;
}

function Pallet({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <Box position={[0, 0.06, 0]} args={[1.25, 0.12, 0.9]} color={FACTORY_THEME.pallet} />
      <Box position={[-0.38, 0.2, -0.15]} args={[0.34, 0.28, 0.34]} color={FACTORY_THEME.box} />
      <Box position={[0, 0.2, -0.15]} args={[0.34, 0.28, 0.34]} color={FACTORY_THEME.box} />
      <Box position={[0.38, 0.2, -0.15]} args={[0.34, 0.28, 0.34]} color={FACTORY_THEME.box} />
      <Box position={[-0.18, 0.5, 0.18]} args={[0.34, 0.28, 0.34]} color={FACTORY_THEME.box} />
      <Box position={[0.22, 0.5, 0.18]} args={[0.34, 0.28, 0.34]} color={FACTORY_THEME.box} />
    </group>
  );
}

function MaterialBasket({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <Box position={[0, 0.15, 0]} args={[1.05, 0.3, 0.8]} color={FACTORY_THEME.basket} opacity={0.92} />
      <lineSegments position={[0, 0.32, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(1.08, 0.34, 0.84)]} />
        <lineBasicMaterial color={FACTORY_THEME.wall} transparent opacity={0.75} />
      </lineSegments>
    </group>
  );
}

function Rack({ position }: { position: [number, number, number] }) {
  const boxes = [-0.72, 0, 0.72].flatMap((x) =>
    [0.38, 1.02].map((y) => (
      <Box key={`${x}-${y}`} position={[x, y, 0]} args={[0.48, 0.34, 0.42]} color={FACTORY_THEME.box} />
    )),
  );
  return (
    <group position={position}>
      <Box position={[-1.05, 0.75, -0.35]} args={[0.08, 1.5, 0.08]} color={FACTORY_THEME.shelfBlue} />
      <Box position={[1.05, 0.75, -0.35]} args={[0.08, 1.5, 0.08]} color={FACTORY_THEME.shelfBlue} />
      <Box position={[-1.05, 0.75, 0.35]} args={[0.08, 1.5, 0.08]} color={FACTORY_THEME.shelfBlue} />
      <Box position={[1.05, 0.75, 0.35]} args={[0.08, 1.5, 0.08]} color={FACTORY_THEME.shelfBlue} />
      <Box position={[0, 0.42, 0]} args={[2.3, 0.08, 0.84]} color={FACTORY_THEME.shelfBlue} />
      <Box position={[0, 1.08, 0]} args={[2.3, 0.08, 0.84]} color={FACTORY_THEME.shelfBlue} />
      {boxes}
    </group>
  );
}

function InjectionMachineGhost({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <Box position={[0, 0.45, 0]} args={[1.95, 0.9, 1.35]} color={FACTORY_THEME.equipment} />
      <Box position={[0.6, 0.86, -0.18]} args={[0.68, 0.16, 0.48]} color={FACTORY_THEME.wallGlass} opacity={0.82} />
      <Box position={[-0.7, 0.72, 0.42]} args={[0.36, 0.22, 0.32]} color={FACTORY_THEME.steel} />
      <Box position={[0, 0.08, 0.84]} args={[1.7, 0.16, 0.1]} color={FACTORY_THEME.orange} />
    </group>
  );
}

function DockTruck() {
  return (
    <group position={[4.8, 0, 8.6]} rotation={[0, -Math.PI / 2, 0]}>
      <Box position={[0, 0.62, 0]} args={[3.2, 1.24, 1.35]} color="#cfd8d8" />
      <Box position={[-2.0, 0.58, 0]} args={[1.0, 1.16, 1.28]} color={FACTORY_THEME.equipmentDark} />
      <Box position={[-2.16, 0.82, -0.48]} args={[0.45, 0.36, 0.08]} color="#0c1117" />
      {[-1.9, 0.85, 2.0].map((x) => (
        <mesh key={x} position={[x, 0.16, -0.72]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.24, 0.24, 0.12, 24]} />
          <meshStandardMaterial color="#15191d" roughness={0.65} />
        </mesh>
      ))}
    </group>
  );
}

function ZonePlate({
  position,
  args,
  color,
}: {
  position: [number, number, number];
  args: [number, number];
  color: string;
}) {
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} receiveShadow>
        <planeGeometry args={args} />
        <meshStandardMaterial color={color} transparent opacity={0.22} side={THREE.DoubleSide} />
      </mesh>
      <lineSegments rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(args[0], args[1])]} />
        <lineBasicMaterial color={color} transparent opacity={0.75} />
      </lineSegments>
    </group>
  );
}

export function SmartFactoryFallback() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.025, 0]} receiveShadow>
        <planeGeometry args={[44, 28]} />
        <meshStandardMaterial color={FACTORY_THEME.floor} roughness={0.82} />
      </mesh>

      <LowWall position={[0, 0.72, -13.8]} args={[44, 1.45, 0.34]} />
      <LowWall position={[-22, 0.72, 0]} args={[0.34, 1.45, 28]} />
      <LowWall position={[22, 0.72, 0]} args={[0.34, 1.45, 28]} />
      <LowWall position={[-5.2, 0.72, 5.4]} args={[0.26, 1.45, 13.6]} />
      <LowWall position={[8.2, 0.72, 1.8]} args={[0.26, 1.45, 8.2]} />
      <LowWall position={[5.6, 0.72, 7.9]} args={[7.3, 1.45, 0.26]} />

      <ZonePlate position={[5.6, 0, -10.7]} args={[13.6, 5.6]} color={FACTORY_THEME.orange} />
      <ZonePlate position={[13.2, 0, 5.8]} args={[11.2, 7.8]} color={FACTORY_THEME.shelfBlue} />
      <ZonePlate position={[-9.8, 0, 7.4]} args={[8.8, 4.2]} color={FACTORY_THEME.cyan} />
      <ZonePlate position={[1.5, 0, 9.8]} args={[4.8, 3.2]} color={FACTORY_THEME.alarm} />

      {[-5.4, -2.4, 0.6, 3.6, 6.6].map((x, i) => (
        <InjectionMachineGhost key={x} position={[x, 0, -6.2 - (i % 2) * 2.2]} />
      ))}
      {[-3.8, 1.0, 5.8].map((x) => (
        <MaterialBasket key={x} position={[x, 0, -2.6]} />
      ))}

      <Rack position={[11.0, 0, 3.6]} />
      <Rack position={[14.4, 0, 3.6]} />
      <Rack position={[11.0, 0, 7.0]} />
      <Rack position={[14.4, 0, 7.0]} />
      <Pallet position={[17.5, 0, 8.4]} />
      <Pallet position={[16.9, 0, 1.2]} />

      <DockTruck />
      <Pallet position={[1.6, 0, 7.2]} />
      <Pallet position={[1.0, 0, 10.4]} />

      <Box position={[-10.4, 0.02, 8.2]} args={[4.2, 0.04, 2.2]} color={FACTORY_THEME.cyan} opacity={0.2} />
      {[-11.6, -10.2, -8.8].map((x) => (
        <Box key={x} position={[x, 0.04, 8.2]} args={[1.05, 0.08, 1.45]} color={FACTORY_THEME.wall} opacity={0.5} />
      ))}
    </group>
  );
}
