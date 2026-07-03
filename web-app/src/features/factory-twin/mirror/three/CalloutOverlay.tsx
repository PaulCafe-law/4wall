import { useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useFactoryStore } from '../store/factoryStore';
import type { Entity } from '../domain/entities';
import { getBoundingBoxForEntity } from './glbRegistry';

type LabelSide = 'left' | 'right';
type AnchorMode = 'center' | 'top';

interface CalloutDef {
  key: string;
  label: string;
  anchorIds: string[];
  side: LabelSide;
  slot: number;
  mode?: AnchorMode;
  yOffset?: number;
}

interface ProjectedCallout extends CalloutDef {
  anchorX: number;
  anchorY: number;
  labelX: number;
  labelY: number;
  visible: boolean;
}

const CALLOUTS: CalloutDef[] = [
  { key: 'material', label: '倉儲 / 物料暫存區', anchorIds: ['zone-stage'], side: 'left', slot: 0, mode: 'center', yOffset: 1.0 },
  { key: 'people', label: '人員定位', anchorIds: ['p-xiaoming'], side: 'left', slot: 1, mode: 'top', yOffset: 1.0 },
  { key: 'dock', label: '出貨 / 物流區', anchorIds: ['zone-dock'], side: 'left', slot: 2, mode: 'center', yOffset: 0.9 },
  {
    key: 'hc600',
    label: 'HC600 成型區',
    anchorIds: ['m-hc600', 'm-hc600-002', 'm-hc600-003', 'm-hc600-004', 'm-hc600-005', 'm-hc600-006', 'm-hc600-007'],
    side: 'right',
    slot: 0,
    mode: 'top',
    yOffset: 0.55,
  },
  {
    key: 'camera',
    label: '監視器覆蓋',
    anchorIds: ['m-hc600', 'm-hc600-002', 'm-hc600-003', 'm-hc600-004', 'm-hc600-005', 'm-hc600-006', 'm-hc600-007'],
    side: 'right',
    slot: 1,
    mode: 'top',
    yOffset: 1.85,
  },
  { key: 'amr', label: 'AMR 搬運模擬', anchorIds: ['amr-01'], side: 'right', slot: 2, mode: 'top', yOffset: 0.7 },
];

function boxForEntity(entity: Entity): THREE.Box3 {
  const glbBox = getBoundingBoxForEntity(entity.id);
  if (glbBox && !glbBox.isEmpty()) return glbBox.clone();

  const sizeX = typeof entity.attrs?.sizeX === 'number' ? entity.attrs.sizeX : 0.7;
  const sizeZ = typeof entity.attrs?.sizeZ === 'number' ? entity.attrs.sizeZ : 0.7;
  const height = entity.type === 'machine' ? 1.8 : entity.type === 'amr' ? 0.6 : entity.type === 'person' ? 1.4 : 0.35;
  return new THREE.Box3(
    new THREE.Vector3(entity.position.x - sizeX / 2, entity.position.y, entity.position.z - sizeZ / 2),
    new THREE.Vector3(entity.position.x + sizeX / 2, entity.position.y + height, entity.position.z + sizeZ / 2),
  );
}

function resolveAnchor(def: CalloutDef, entities: Record<string, Entity>): THREE.Vector3 | null {
  const boxes: THREE.Box3[] = [];
  for (const id of def.anchorIds) {
    const entity = entities[id];
    if (!entity) continue;
    boxes.push(boxForEntity(entity));
  }
  if (boxes.length === 0) return null;

  const box = boxes.reduce((acc, item) => acc.union(item), boxes[0].clone());
  const center = box.getCenter(new THREE.Vector3());
  const yOffset = def.yOffset ?? 0;

  if ((def.mode ?? 'center') === 'top') {
    return new THREE.Vector3(center.x, box.max.y + yOffset, center.z);
  }
  return new THREE.Vector3(center.x, center.y + yOffset, center.z);
}

function labelPoint(side: LabelSide, slot: number, width: number, height: number) {
  const labelWidth = 220;
  const padding = 34;
  const ySlots = [
    Math.max(82, height * 0.24),
    Math.max(150, height * 0.38),
    Math.max(230, height - 92),
  ];
  const x = side === 'left' ? padding : Math.max(padding, width - labelWidth - padding);
  const y = Math.min(ySlots[slot] ?? height * 0.5, height - 58);
  return { x, y };
}

function projectToViewport(v: THREE.Vector3, camera: THREE.Camera, width: number, height: number) {
  const ndc = v.clone().project(camera);
  return {
    x: (ndc.x * 0.5 + 0.5) * width,
    y: (-ndc.y * 0.5 + 0.5) * height,
    visible: ndc.z >= -1 && ndc.z <= 1 && ndc.x >= -1.15 && ndc.x <= 1.15 && ndc.y >= -1.15 && ndc.y <= 1.15,
  };
}

function signatureOf(items: ProjectedCallout[]): string {
  return items
    .map((item) => `${item.key}:${Math.round(item.anchorX)}:${Math.round(item.anchorY)}:${Math.round(item.labelX)}:${Math.round(item.labelY)}:${item.visible ? 1 : 0}`)
    .join('|');
}

export function CalloutOverlay() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const entities = useFactoryStore((s) => s.entities);
  const [items, setItems] = useState<ProjectedCallout[]>([]);
  const lastSignature = useRef('');

  useFrame(() => {
    const next: ProjectedCallout[] = [];
    for (const def of CALLOUTS) {
      const anchor = resolveAnchor(def, entities);
      if (!anchor) continue;

      const projected = projectToViewport(anchor, camera, size.width, size.height);
      const label = labelPoint(def.side, def.slot, size.width, size.height);
      next.push({
        ...def,
        anchorX: projected.x,
        anchorY: projected.y,
        labelX: label.x,
        labelY: label.y,
        visible: projected.visible,
      });
    }

    const signature = signatureOf(next);
    if (signature !== lastSignature.current) {
      lastSignature.current = signature;
      setItems(next);
    }
  });

  return (
    <Html fullscreen zIndexRange={[2, 0]}>
      <div className="factory-callouts" aria-hidden="true">
        <svg className="factory-callout-lines" width="100%" height="100%" viewBox={`0 0 ${size.width} ${size.height}`} preserveAspectRatio="none">
          {items
            .filter((item) => item.visible)
            .map((item) => {
              const labelEdgeX = item.side === 'left' ? item.labelX + 210 : item.labelX;
              const labelEdgeY = item.labelY + 15;
              const elbowOffset = item.side === 'left' ? 76 : -76;
              const elbowX = Math.abs(item.anchorX - labelEdgeX) < 110 ? labelEdgeX + elbowOffset : item.anchorX - elbowOffset;
              const points = `${labelEdgeX},${labelEdgeY} ${elbowX},${labelEdgeY} ${item.anchorX},${item.anchorY}`;
              return (
                <g key={item.key} data-callout-key={item.key}>
                  <polyline points={points} />
                  <circle cx={item.anchorX} cy={item.anchorY} r="4" />
                </g>
              );
            })}
        </svg>
        {items.map((item) => (
          <div
            key={item.key}
            className={`factory-callout ${item.side}`}
            data-callout-key={item.key}
            style={{ left: item.labelX, top: item.labelY, opacity: item.visible ? 1 : 0.28 }}
          >
            {item.label}
          </div>
        ))}
      </div>
    </Html>
  );
}
