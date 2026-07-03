import type { MachineEntity } from '../domain/entities';
import { OVERLAY } from '../domain/colors';
import type { FactoryState } from '../store/factoryStore';
import { clamp, formatSimTime, round1, staggerMs, type SimTick } from './simClock';
import { num, str } from './simHelpers';

const TEMP_ALARM_C = 83;
const AUTO_ALARM_MIN_MS = 22000;
const AUTO_ALARM_SPAN_MS = 42000;

export function triggerMachineAlarm(
  state: FactoryState,
  machine: MachineEntity,
  nowMs: number,
  reason = '溫度異常',
): boolean {
  if (machine.source !== 'sim') return false;
  if (machine.status === 'alarm' || machine.status === 'maintenance') return false;

  const alarmCount = machine.alarms + 1;
  state.patchEntity(machine.id, {
    status: 'alarm',
    temperature: Math.max(machine.temperature, TEMP_ALARM_C + 1.5),
    alarms: alarmCount,
    attrs: {
      ...(machine.attrs ?? {}),
      repairState: 'waiting_dispatch',
      simAlarmAt: nowMs,
      simNextAlarmAt: nowMs + staggerMs(machine.id, AUTO_ALARM_MIN_MS, AUTO_ALARM_SPAN_MS),
    },
  });
  state.setHighlight(machine.id, { color: OVERLAY.alarm });
  state.pushSimEvent({
    atMs: nowMs,
    type: 'machine',
    entityId: machine.id,
    important: true,
    message: `[${formatSimTime(nowMs)}] ${machine.name} 告警：${reason}`,
  });
  return true;
}

export function tickMachineLifecycle(state: FactoryState, machine: MachineEntity, tick: SimTick): void {
  if (machine.source !== 'sim') return;

  const attrs = machine.attrs ?? {};
  if (machine.status === 'running') {
    const carryMs = num(attrs.simCycleCarryMs, 0) + tick.deltaMs;
    const cycleMs = Math.max(machine.cycleTimeSec * 1000, 1000);
    const made = Math.floor(carryMs / cycleMs);
    const nextCarry = carryMs % cycleMs;
    const temperature = round1(machine.temperature + tick.deltaSec * 0.035 + (Math.random() - 0.45) * 0.08);
    const oee = Math.round(clamp(machine.oee + (Math.random() - 0.5) * 0.7, 58, 94));
    const nextAlarmAt = num(attrs.simNextAlarmAt, tick.nowMs + staggerMs(machine.id, AUTO_ALARM_MIN_MS, AUTO_ALARM_SPAN_MS));

    state.patchEntity(machine.id, {
      todayCount: machine.todayCount + made,
      temperature,
      oee,
      attrs: {
        ...attrs,
        simCycleCarryMs: nextCarry,
        simNextAlarmAt: nextAlarmAt,
      },
    });

    if (temperature >= TEMP_ALARM_C || tick.nowMs >= nextAlarmAt || Math.random() < tick.deltaSec * 0.0012) {
      triggerMachineAlarm(state, { ...machine, temperature, oee, todayCount: machine.todayCount + made }, tick.nowMs);
    }
    return;
  }

  if (machine.status === 'maintenance') {
    const dueAt = num(attrs.repairDoneAt, 0);
    if (dueAt > 0 && tick.nowMs >= dueAt) {
      state.patchEntity(machine.id, {
        status: 'running',
        temperature: round1(Math.min(machine.temperature, 70 + Math.random() * 3)),
        oee: Math.round(clamp(machine.oee + 8, 72, 90)),
        attrs: {
          ...attrs,
          repairState: undefined,
          repairDoneAt: undefined,
          repairWorkerId: undefined,
          simDispatchId: undefined,
          simNextAlarmAt: tick.nowMs + staggerMs(machine.id, AUTO_ALARM_MIN_MS, AUTO_ALARM_SPAN_MS),
        },
      });
      state.setHighlight(machine.id, null);
      state.pushSimEvent({
        atMs: tick.nowMs,
        type: 'repair',
        entityId: machine.id,
        important: true,
        message: `[${formatSimTime(tick.nowMs)}] ${machine.name} 修復完成，恢復運轉`,
      });
    }
    return;
  }

  if (machine.status === 'alarm' && str(attrs.repairState) === 'repairing') {
    state.setHighlight(machine.id, { color: OVERLAY.alarm });
  }
}
