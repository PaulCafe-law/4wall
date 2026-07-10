import '@testing-library/jest-dom/vitest';

import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

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

it('presents deterministic accelerator scenarios and resets the selected scenario', () => {
  const onScenarioChange = vi.fn();

  renderWithProviders(
    <SimControlPanel
      demoPresentation
      scenarioId="plan_gap"
      onScenarioChange={onScenarioChange}
    />,
  );

  expect(screen.getByText('展示情境')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '正常' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '機台異常' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'AMR 延遲' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '計畫落後' })).toHaveClass('active');

  fireEvent.click(screen.getByRole('button', { name: 'AMR 延遲' }));
  expect(onScenarioChange).toHaveBeenCalledWith('amr_delay');

  fireEvent.click(screen.getByRole('button', { name: '重設目前情境' }));
  expect(onScenarioChange).toHaveBeenCalledWith('plan_gap');
});
