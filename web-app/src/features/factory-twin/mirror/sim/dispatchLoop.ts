import type { MachineEntity, PersonEntity, Vec3 } from '../domain/entities';
import { OVERLAY } from '../domain/colors';
import type { FactoryState } from '../store/factoryStore';
import { useFactoryStore } from '../store/factoryStore';
import { assign_task } from '../actions/actions';
import { clamp, formatSimTime, round1, type SimTick } from './simClock';
import { distance2d, pathBetween, str } from './simHelpers';

const ARRIVAL_DISTANCE = 1.2;
const REPAIR_DURATION_MS = 10_000;

function isRepairWorker(person: PersonEntity): boolean {
  return /維修|技師|repair|tech/i.test(`${person.id} ${person.name} ${person.role}`);
}

function isAvailableWorker(person: PersonEntity): boolean {
  const attrs = person.attrs ?? {};
  return (
    person.source === 'sim' &&
    !attrs.assignedTo &&
    !attrs.walkPath &&
    !attrs.simBusy &&
    !attrs.repairingMachineId
  );
}

function chooseWorker(state: FactoryState, machine: MachineEntity): PersonEntity | null {
  const candidates = Object.values(state.entities).filter(
    (entity): entity is PersonEntity => entity.type === 'person' && isAvailableWorker(entity),
  );
  if (candidates.length === 0) return null;

  return candidates
    .map((person) => {
      const priority = isRepairWorker(person) || person.id === 'p-zhiqiang' ? 0 : 40;
      return { person, score: priority + distance2d(person.position, machine.position) };
    })
    .sort((a, b) => a.score - b.score)[0].person;
}

function baseHomeFor(worker: PersonEntity): Vec3 {
  const p = worker.attrs?.baseHome as Partial<Vec3> | undefined;
  if (typeof p?.x === 'number' && typeof p.y === 'number' && typeof p.z === 'number') {
    return { x: p.x, y: p.y, z: p.z };
  }
  return worker.position;
}

function dispatchWorker(state: FactoryState, machine: MachineEntity, worker: PersonEntity, tick: SimTick): void {
  const dispatchId = `sim-dispatch-${machine.id}`;
  const baseHome = baseHomeFor(worker);
  state.patchEntity(worker.id, {
    attrs: {
      ...(worker.attrs ?? {}),
      baseHome,
      simBusy: true,
      repairingMachineId: machine.id,
      simDispatchId: dispatchId,
    },
  });

  assign_task({
    worker: worker.id,
    target: machine.id,
    task: '安排維修檢查',
    dispatchId,
    selectTarget: false,
    focusTarget: false,
  });

  state.patchEntity(machine.id, {
    attrs: {
      ...(machine.attrs ?? {}),
      repairState: 'dispatched',
      repairWorkerId: worker.id,
      simDispatchId: dispatchId,
    },
  });
  state.setHighlight(machine.id, { color: OVERLAY.alarm });
  state.pushSimEvent({
    atMs: tick.nowMs,
    type: 'dispatch',
    entityId: machine.id,
    important: true,
    message: `[${formatSimTime(tick.nowMs)}] 已派工 ${worker.name} 前往 ${machine.name}`,
  });
}

function startRepair(state: FactoryState, machine: MachineEntity, worker: PersonEntity, tick: SimTick): void {
  const dispatchId = str(machine.attrs?.simDispatchId, `sim-dispatch-${machine.id}`);
  state.patchEntity(machine.id, {
    status: 'maintenance',
    attrs: {
      ...(machine.attrs ?? {}),
      repairState: 'repairing',
      repairWorkerId: worker.id,
      repairDueAt: tick.nowMs + REPAIR_DURATION_MS,
      simDispatchId: dispatchId,
    },
  });
  state.patchEntity(worker.id, {
    status: 'on-duty',
    station: machine.name,
    attrs: {
      ...(worker.attrs ?? {}),
      simBusy: true,
      repairingMachineId: machine.id,
      walkPath: undefined,
      walkPathIdx: undefined,
    },
  });
  state.setHighlight(machine.id, { color: OVERLAY.highlight });
  state.pushSimEvent({
    atMs: tick.nowMs,
    type: 'repair',
    entityId: machine.id,
    important: true,
    message: `[${formatSimTime(tick.nowMs)}] ${worker.name} 抵達 ${machine.name}，開始維修`,
  });
}

function finishRepair(state: FactoryState, machine: MachineEntity, worker: PersonEntity, tick: SimTick): void {
  const dispatchId = str(machine.attrs?.simDispatchId, `sim-dispatch-${machine.id}`);
  const baseHome = baseHomeFor(worker);
  const returnPath = pathBetween(worker.position, baseHome, worker);

  state.patchEntity(machine.id, {
    status: 'running',
    temperature: round1(clamp(machine.temperature - 12, 66, 74)),
    oee: Math.round(clamp(machine.oee + 8, 76, 91)),
    attrs: {
      ...(machine.attrs ?? {}),
      repairState: undefined,
      repairWorkerId: undefined,
      repairDueAt: undefined,
      simDispatchId: undefined,
      simNextAlarmAt: tick.nowMs + 45_000 + Math.random() * 45_000,
    },
  });
  state.patchEntity(worker.id, {
    status: returnPath.length > 1 ? 'moving' : 'on-duty',
    attrs: {
      ...(worker.attrs ?? {}),
      assignedTo: undefined,
      task: undefined,
      simBusy: false,
      repairingMachineId: undefined,
      simDispatchId: undefined,
      walkPath: returnPath.length > 1 ? returnPath : undefined,
      walkPathIdx: returnPath.length > 1 ? 1 : undefined,
      walkTargetName: '返回駐點',
      home: baseHome,
    },
  });
  state.removeLink(dispatchId);
  state.setHighlight(machine.id, null);
  state.setHighlight(worker.id, null);
  state.pushSimEvent({
    atMs: tick.nowMs,
    type: 'repair',
    entityId: machine.id,
    important: true,
    message: `[${formatSimTime(tick.nowMs)}] ${machine.name} 維修完成，${worker.name} 返回駐點`,
  });
}

export function tickDispatchLoop(state: FactoryState, tick: SimTick): void {
  const machineIds = Object.values(state.entities)
    .filter((entity): entity is MachineEntity => entity.type === 'machine' && entity.source === 'sim')
    .map((entity) => entity.id);

  for (const machineId of machineIds) {
    const currentState = useFactoryStore.getState();
    const entity = currentState.entities[machineId];
    if (entity?.type !== 'machine' || entity.source !== 'sim') continue;
    const machine = entity;
    const repairState = str(machine.attrs?.repairState);

    if (machine.status === 'alarm' && repairState === 'waiting_dispatch') {
      const worker = chooseWorker(currentState, machine);
      if (worker) dispatchWorker(currentState, machine, worker, tick);
      continue;
    }

    if (machine.status === 'alarm' && repairState === 'dispatched') {
      const workerId = str(machine.attrs?.repairWorkerId);
      const worker = currentState.entities[workerId];
      if (worker?.type === 'person' && distance2d(worker.position, machine.position) <= ARRIVAL_DISTANCE) {
        startRepair(currentState, machine, worker, tick);
      }
      continue;
    }

    if (machine.status === 'maintenance' && repairState === 'repairing') {
      const dueAt = typeof machine.attrs?.repairDueAt === 'number' ? machine.attrs.repairDueAt : 0;
      const workerId = str(machine.attrs?.repairWorkerId);
      const worker = currentState.entities[workerId];
      if (dueAt > 0 && tick.nowMs >= dueAt && worker?.type === 'person') {
        finishRepair(currentState, machine, worker, tick);
      }
    }
  }
}
