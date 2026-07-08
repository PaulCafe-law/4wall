import { beforeEach, expect, it } from 'vitest';

import type { AmrEntity, Entity, MachineEntity, PersonEntity } from '../domain/entities';
import { buildMockEntities } from '../domain/mockData';
import { SPATIAL_ZONES } from '../domain/spatialZones';
import { useFactoryStore } from '../store/factoryStore';
import {
  ACTIONS,
  assign_task,
  dispatch_amr,
  set_machine_state,
  trigger_demo_incident,
} from './actions';

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

const liveMachine: MachineEntity = {
  id: 'm-live-01',
  type: 'machine',
  name: 'LIVE-01 成型機',
  position: { x: 2, y: 0, z: 2 },
  status: 'running',
  source: 'live',
  model: 'HC600',
  oee: 88,
  temperature: 71,
  cycleTimeSec: 30,
  todayCount: 100,
  alarms: 0,
};

function seedMockEntities(extra: Entity[] = []): void {
  const entities = buildMockEntities();
  for (const zone of SPATIAL_ZONES) entities[zone.id] = zone;
  for (const e of extra) entities[e.id] = e;
  useFactoryStore.getState().setEntities(entities);
}

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

it('registers the sim command actions', () => {
  expect(ACTIONS.dispatch_amr).toBe(dispatch_amr);
  expect(ACTIONS.set_machine_state).toBe(set_machine_state);
  expect(ACTIONS.trigger_demo_incident).toBe(trigger_demo_incident);
});

it('dispatch_amr sends the idle AMR to the target with a routed task', () => {
  seedMockEntities();

  const result = dispatch_amr({ target: 'zone-dock' });

  expect(result.ok).toBe(true);
  const state = useFactoryStore.getState();
  const amr = state.entities['amr-01'] as AmrEntity;
  expect(amr.status).toBe('moving');
  expect(amr.task).toBe('前往 卸貨 / 送貨區');
  expect(amr.route?.length).toBeGreaterThan(1);
  expect(amr.attrs?.simState).toBe('moving');
  expect(amr.attrs?.simTaskLabel).toBe('前往 卸貨 / 送貨區');
  expect(amr.attrs?.simTaskToId).toBe('zone-dock');
  expect(amr.attrs?.routeIdx).toBe(1);
  expect(amr.attrs?.simNextTaskAt).toBe(120_000);
  expect(state.highlights['amr-01']).toBeDefined();
  expect(state.highlights['zone-dock']).toBeDefined();
  expect(state.links).toHaveLength(1);
  expect(state.cameraTarget?.id).toBe('zone-dock');
  expect(state.simEvents[0]?.type).toBe('amr');
});

it('dispatch_amr resolves AMR and target by name / alias', () => {
  seedMockEntities();

  const result = dispatch_amr({ amrId: 'AMR-02', target: 'HC600-03' });

  expect(result.ok).toBe(true);
  const amr = useFactoryStore.getState().entities['amr-02'] as AmrEntity;
  expect(amr.attrs?.simTaskToId).toBe('m-hc600-003');
});

it('dispatch_amr rejects an unknown target', () => {
  seedMockEntities();

  const result = dispatch_amr({ target: '不存在的地方' });

  expect(result.ok).toBe(false);
  expect(result.message).toContain('找不到目的地');
  expect((useFactoryStore.getState().entities['amr-01'] as AmrEntity).status).toBe('idle');
});

it('dispatch_amr rejects an unknown AMR id', () => {
  seedMockEntities();

  const result = dispatch_amr({ amrId: 'amr-99', target: 'zone-dock' });

  expect(result.ok).toBe(false);
  expect(result.message).toContain('找不到 AMR');
});

it('set_machine_state alarm uses the store trigger and bumps manualAlarmNonce', () => {
  seedMockEntities();

  const result = set_machine_state({ machineId: 'HC600-03', state: 'alarm' });

  expect(result.ok).toBe(true);
  const state = useFactoryStore.getState();
  expect(state.manualAlarmNonce).toBe(1);
  expect(state.manualAlarmTargetId).toBe('m-hc600-003');
});

it('set_machine_state running clears repair state and highlight', () => {
  seedMockEntities();
  const s = useFactoryStore.getState();
  s.patchEntity('m-hc600-003', {
    status: 'alarm',
    temperature: 88,
    attrs: { repairState: 'waiting_dispatch' },
  });
  s.setHighlight('m-hc600-003', { color: '#c0492f' });

  const result = set_machine_state({ machineId: 'm-hc600-003', state: 'running' });

  expect(result.ok).toBe(true);
  const state = useFactoryStore.getState();
  const target = state.entities['m-hc600-003'] as MachineEntity;
  expect(target.status).toBe('running');
  expect(target.temperature).toBe(74);
  expect(target.attrs?.repairState).toBeUndefined();
  expect(target.attrs?.simNextAlarmAt).toBe(60_000);
  expect(state.highlights['m-hc600-003']).toBeUndefined();
});

it('set_machine_state maintenance schedules repairDoneAt', () => {
  seedMockEntities();

  const result = set_machine_state({ machineId: 'm-hc600-003', state: 'maintenance' });

  expect(result.ok).toBe(true);
  const target = useFactoryStore.getState().entities['m-hc600-003'] as MachineEntity;
  expect(target.status).toBe('maintenance');
  expect(target.attrs?.repairState).toBe('repairing');
  expect(target.attrs?.repairDoneAt).toBe(15_000);
});

it('set_machine_state refuses live machines and unknown ids', () => {
  seedMockEntities([liveMachine]);

  const hc600 = set_machine_state({ machineId: 'm-hc600', state: 'running' });
  expect(hc600.ok).toBe(false);
  expect(hc600.message).toContain('模擬機台');

  const live = set_machine_state({ machineId: 'm-live-01', state: 'idle' });
  expect(live.ok).toBe(false);
  expect(live.message).toContain('模擬機台');

  const unknown = set_machine_state({ machineId: 'm-nope', state: 'idle' });
  expect(unknown.ok).toBe(false);
  expect(unknown.message).toContain('找不到機台');
});

it('trigger_demo_incident bumps manualAlarmNonce', () => {
  seedMockEntities();

  const result = trigger_demo_incident({});

  expect(result.ok).toBe(true);
  expect(result.message).toBe('已觸發演示告警，維修派工將自動啟動');
  expect(useFactoryStore.getState().manualAlarmNonce).toBe(1);
  expect(useFactoryStore.getState().manualAlarmTargetId).toBeNull();
});

it('trigger_demo_incident resolves the target machine by alias', () => {
  seedMockEntities();

  trigger_demo_incident({ machineId: 'HC600-02' });

  const state = useFactoryStore.getState();
  expect(state.manualAlarmNonce).toBe(1);
  expect(state.manualAlarmTargetId).toBe('m-hc600-002');
});

it('trigger_demo_incident rejects an unresolvable machine id without firing an alarm', () => {
  seedMockEntities();

  const result = trigger_demo_incident({ machineId: 'HC600-99' });

  expect(result.ok).toBe(false);
  expect(result.message).toContain('找不到機台');
  expect(useFactoryStore.getState().manualAlarmNonce).toBe(0);
  expect(useFactoryStore.getState().manualAlarmTargetId).toBeNull();
});

it('coerces non-string entity refs instead of throwing', () => {
  const result = set_machine_state({ machineId: 3 as unknown as string, state: 'idle' });

  expect(result.ok).toBe(false);
  expect(result.message).toContain('找不到機台');
});
