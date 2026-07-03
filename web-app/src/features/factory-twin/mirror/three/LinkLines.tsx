// Renders connection lines from the store (e.g. 派工: worker -> machine).
import { Line } from '@react-three/drei';
import { useFactoryStore } from '../store/factoryStore';
import { FACTORY_THEME } from './factoryTheme';

export function LinkLines() {
  const links = useFactoryStore((s) => s.links);
  const entities = useFactoryStore((s) => s.entities);

  return (
    <>
      {links.map((l) => {
        const a = entities[l.from];
        const b = entities[l.to];
        if (!a || !b) return null;
        const lift = Math.max(a.position.y, b.position.y) + 1.35;
        const points: [number, number, number][] = [
          [a.position.x, a.position.y + 0.45, a.position.z],
          [a.position.x, lift, a.position.z],
          [b.position.x, lift, b.position.z],
          [b.position.x, b.position.y + 0.75, b.position.z],
        ];
        return (
          <Line
            key={l.id}
            points={points}
            color={l.color || FACTORY_THEME.cyan}
            lineWidth={2.6}
            dashed
            dashSize={0.42}
            gapSize={0.18}
          />
        );
      })}
    </>
  );
}
