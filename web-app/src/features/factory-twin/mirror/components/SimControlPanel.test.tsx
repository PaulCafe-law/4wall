import '@testing-library/jest-dom/vitest';

import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { renderWithProviders } from '../../../../test/utils';
import type { PersonEntity } from '../domain/entities';
import { useFactoryStore } from '../store/factoryStore';
import { SimControlPanel } from './SimControlPanel';

const livePerson: PersonEntity = {
  id: 'live-1',
  type: 'person',
  name: '現場人員 1',
  role: 'anonymous-presence',
  position: { x: 1, y: 0, z: 2 },
  status: 'on-duty',
  source: 'live',
};

beforeEach(() => {
  useFactoryStore.setState(useFactoryStore.getInitialState(), true);
});

it('重置演示 keeps live-presence persons in the reseeded entities', () => {
  useFactoryStore.getState().setLivePersons([livePerson]);

  renderWithProviders(<SimControlPanel />);
  fireEvent.click(screen.getByText('重置演示'));

  const state = useFactoryStore.getState();
  expect(state.entities[livePerson.id]).toEqual(livePerson);
  expect(state.entities['m-hc600']).toBeDefined();
  expect(state.livePersons).toEqual([livePerson]);
  expect(state.messages.some((m) => m.text === '演示已重置')).toBe(true);
});
