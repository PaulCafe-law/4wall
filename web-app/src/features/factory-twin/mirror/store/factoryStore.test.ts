import { beforeEach, expect, it } from 'vitest';

import type { Entity, MachineEntity, PersonEntity } from '../domain/entities';
import { useFactoryStore } from './factoryStore';

const simPerson: PersonEntity = {
  id: 'person-sim',
  type: 'person',
  name: '小明',
  role: 'technician',
  position: { x: 0, y: 0, z: 0 },
  status: 'on-duty',
  source: 'sim',
};

const oldLivePerson: PersonEntity = {
  id: 'live-old',
  type: 'person',
  name: '現場人員 old',
  role: 'anonymous-presence',
  position: { x: 1, y: 0, z: 1 },
  status: 'on-duty',
  source: 'live',
  attrs: { fixedWorld: true },
};

const newLivePerson: PersonEntity = {
  id: 'live-new',
  type: 'person',
  name: '現場人員 new',
  role: 'anonymous-presence',
  position: { x: 2, y: 0, z: 2 },
  status: 'on-duty',
  source: 'live',
  attrs: { fixedWorld: true },
};

const machine: MachineEntity = {
  id: 'machine-1',
  type: 'machine',
  name: 'HC600-01',
  position: { x: 5, y: 0, z: 5 },
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
});

it('merges live people into entities and removes stale live people only', () => {
  const entities: Record<string, Entity> = {
    [simPerson.id]: simPerson,
    [oldLivePerson.id]: oldLivePerson,
    [machine.id]: machine,
  };
  useFactoryStore.getState().setEntities(entities);
  useFactoryStore.getState().select(oldLivePerson.id);

  useFactoryStore.getState().setLivePersons([newLivePerson]);

  const state = useFactoryStore.getState();
  expect(state.livePersons).toEqual([newLivePerson]);
  expect(state.entities[simPerson.id]).toEqual(simPerson);
  expect(state.entities[machine.id]).toEqual(machine);
  expect(state.entities[oldLivePerson.id]).toBeUndefined();
  expect(state.entities[newLivePerson.id]).toEqual(newLivePerson);
  expect(state.selectedId).toBeNull();
});

it('opens the right detail panel when an entity is selected', () => {
  useFactoryStore.setState({ rightOpen: false });

  useFactoryStore.getState().select(machine.id);

  expect(useFactoryStore.getState().selectedId).toBe(machine.id);
  expect(useFactoryStore.getState().rightOpen).toBe(true);
});

it('tracks cloud agent presence and pending reply counters', () => {
  expect(useFactoryStore.getState().cloudAgentOnline).toBe(false);
  expect(useFactoryStore.getState().pendingAgentReplies).toBe(0);

  useFactoryStore.getState().setCloudAgentOnline(true);
  expect(useFactoryStore.getState().cloudAgentOnline).toBe(true);

  useFactoryStore.getState().incPendingAgentReplies();
  useFactoryStore.getState().incPendingAgentReplies();
  expect(useFactoryStore.getState().pendingAgentReplies).toBe(2);

  useFactoryStore.getState().decPendingAgentReplies();
  expect(useFactoryStore.getState().pendingAgentReplies).toBe(1);

  useFactoryStore.getState().decPendingAgentReplies();
  useFactoryStore.getState().decPendingAgentReplies();
  expect(useFactoryStore.getState().pendingAgentReplies).toBe(0);
});
