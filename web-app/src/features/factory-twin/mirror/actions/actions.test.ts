import { beforeEach, expect, it } from 'vitest';

import type { Entity, MachineEntity, PersonEntity } from '../domain/entities';
import { useFactoryStore } from '../store/factoryStore';
import { assign_task } from './actions';

const livePerson: PersonEntity = {
  id: 'live-person',
  type: 'person',
  name: '現場人員',
  role: 'anonymous-presence',
  position: { x: 0, y: 0, z: 0 },
  status: 'on-duty',
  source: 'live',
  attrs: { fixedWorld: true },
};

const machine: MachineEntity = {
  id: 'machine-1',
  type: 'machine',
  name: 'HC600-01',
  position: { x: 1, y: 0, z: 1 },
  status: 'running',
  source: 'sim',
  model: 'HC600',
  oee: 90,
  temperature: 70,
  cycleTimeSec: 30,
  todayCount: 10,
  alarms: 0,
};

beforeEach(() => {
  useFactoryStore.setState(useFactoryStore.getInitialState(), true);
  const entities: Record<string, Entity> = {
    [livePerson.id]: livePerson,
    [machine.id]: machine,
  };
  useFactoryStore.getState().setEntities(entities);
});

it('rejects assigning anonymous live person detections', () => {
  const result = assign_task({ worker: livePerson.id, target: machine.id });
  const state = useFactoryStore.getState();

  expect(result.ok).toBe(false);
  expect(result.message).toContain('現場匿名人員不可派工');
  expect(state.links).toHaveLength(0);
  expect(state.highlights).toEqual({});
  expect(state.entities[livePerson.id]).toEqual(livePerson);
});
