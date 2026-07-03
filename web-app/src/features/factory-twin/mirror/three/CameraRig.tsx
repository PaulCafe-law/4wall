// Smoothly pans the current isometric view to a focused entity without resetting zoom or angle.
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useFactoryStore } from '../store/factoryStore';

type OrbitLike =
  | {
      target: THREE.Vector3;
      update: () => void;
      addEventListener?: (type: 'start', listener: () => void) => void;
      removeEventListener?: (type: 'start', listener: () => void) => void;
    }
  | null;

const ARRIVAL_EPSILON = 0.05;

export function CameraRig() {
  const cameraTarget = useFactoryStore((s) => s.cameraTarget);
  const entities = useFactoryStore((s) => s.entities);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitLike;

  const lookAt = useRef<THREE.Vector3 | null>(null);
  const camPos = useRef<THREE.Vector3 | null>(null);

  useEffect(() => {
    if (!controls?.addEventListener || !controls.removeEventListener) return;
    const cancelFocusFlight = () => {
      lookAt.current = null;
      camPos.current = null;
    };
    controls.addEventListener('start', cancelFocusFlight);
    return () => controls.removeEventListener?.('start', cancelFocusFlight);
  }, [controls]);

  useEffect(() => {
    if (!cameraTarget || !controls) return;
    const e = entities[cameraTarget.id];
    if (!e) return;
    const p = new THREE.Vector3(e.position.x, e.position.y + 0.8, e.position.z);
    const offset = camera.position.clone().sub(controls.target);
    lookAt.current = p;
    camPos.current = p.clone().add(offset);
    // re-run whenever a new focus is requested (nonce bumps even for same id)
  }, [cameraTarget, entities, camera, controls]);

  useFrame(() => {
    if (lookAt.current && camPos.current && controls) {
      controls.target.lerp(lookAt.current, 0.08);
      camera.position.lerp(camPos.current, 0.08);
      controls.update();
      const arrived =
        camera.position.distanceTo(camPos.current) < ARRIVAL_EPSILON &&
        controls.target.distanceTo(lookAt.current) < ARRIVAL_EPSILON;
      if (arrived) {
        lookAt.current = null;
        camPos.current = null;
      }
    }
  });

  return null;
}
