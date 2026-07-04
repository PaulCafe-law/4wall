import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import type { Entity, PersonEntity } from '../domain/entities';
import { useFactoryStore } from '../store/factoryStore';
import { DetailPanel } from './DetailPanel';

const livePerson: PersonEntity = {
  id: 'live-person',
  type: 'person',
  name: '現場人員',
  role: 'anonymous-presence',
  position: { x: 1.25, y: 0.05, z: -3.5 },
  status: 'on-duty',
  source: 'live',
  attrs: { cameraLabel: '儀表板', confidence: 0.92 },
};

beforeEach(() => {
  useFactoryStore.setState(useFactoryStore.getInitialState(), true);
  const entities: Record<string, Entity> = { [livePerson.id]: livePerson };
  useFactoryStore.getState().setEntities(entities);
  useFactoryStore.getState().select(livePerson.id);
});

it('routes live person entities to the read-only detail panel', () => {
  render(<DetailPanel />);

  expect(screen.getByText('現場匿名人員')).toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});
