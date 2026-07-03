import { executeToolCall } from './tools';
import type { ToolCall } from '../api/types';
import type { Entity, MachineEntity, PersonEntity } from '../domain/entities';
import { useFactoryStore, uid } from '../store/factoryStore';

function textIncludesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term.toLowerCase()));
}

function machineFromText(text: string, entities: Entity[]): MachineEntity | null {
  const normalized = text.toLowerCase().replace(/\s+/g, '');
  const machines = entities.filter((entity): entity is MachineEntity => entity.type === 'machine');
  const hcMatch = normalized.match(/hc600[-.]?0?([1-7])|([1-7])號/);
  if (hcMatch) {
    const n = Number(hcMatch[1] ?? hcMatch[2]);
    const id = n === 1 ? 'm-hc600' : `m-hc600-00${n}`;
    return machines.find((machine) => machine.id === id) ?? null;
  }
  return (
    machines.find((machine) => {
      const tokens = [machine.id, machine.name, machine.model, ...(machine.aliases ?? [])]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase().replace(/\s+/g, ''));
      return tokens.some((token) => token && normalized.includes(token));
    }) ??
    machines.find((machine) => machine.model.toLowerCase() === 'hc600') ??
    machines[0] ??
    null
  );
}

function personFromText(text: string, entities: Entity[]): PersonEntity | null {
  const normalized = text.toLowerCase();
  const people = entities.filter((entity): entity is PersonEntity => entity.type === 'person');
  if (text.includes('小明')) return people.find((person) => person.id === 'p-xiaoming') ?? null;
  if (text.includes('志強') || text.includes('志强')) {
    return people.find((person) => person.id === 'p-zhiqiang') ?? null;
  }
  return (
    people.find((person) => {
      const tokens = [person.id, person.name, person.role, person.station].filter(Boolean);
      return tokens.some((token) => normalized.includes(String(token).toLowerCase()));
    }) ??
    people.find((person) => person.id === 'p-xiaoming') ??
    people[0] ??
    null
  );
}

function runTool(call: ToolCall, messages: string[]): void {
  const result = executeToolCall(call);
  messages.push(result.message);
}

function statusText(machine: MachineEntity): string {
  return `${machine.name} 目前狀態 ${machine.status}，OEE ${machine.oee}%，溫度 ${machine.temperature}°C，今日產量 ${machine.todayCount}，告警 ${machine.alarms} 次。`;
}

export async function runConversation(userText: string): Promise<void> {
  const store = useFactoryStore.getState();
  store.addMessage({ id: uid('msg'), role: 'user', text: userText });

  const text = userText.trim();
  const normalized = text.toLowerCase();
  const entities = Object.values(useFactoryStore.getState().entities);
  const machine = machineFromText(text, entities);
  const person = personFromText(text, entities);
  const replies: string[] = [];

  if (textIncludesAny(normalized, ['clear', '清除', '取消標記'])) {
    runTool({ name: 'clear_overlays', arguments: {} }, replies);
  } else if (textIncludesAny(normalized, ['派', '指派', '維修', '處理', 'repair', 'assign']) && machine) {
    const worker = person ?? personFromText('志強', entities);
    runTool(
      {
        name: 'assign_task',
        arguments: {
          worker: worker?.id ?? 'p-zhiqiang',
          target: machine.id,
          task: `${machine.name} 現場確認`,
        },
      },
      replies,
    );
  } else if ((text.includes('在哪') || textIncludesAny(normalized, ['where', 'location'])) && person) {
    runTool({ name: 'focus_camera', arguments: { id: person.id } }, replies);
    runTool({ name: 'highlight_entity', arguments: { ids: [person.id], color: '#f59e0b' } }, replies);
    replies.push(`${person.name} 目前在 ${person.station ?? '工廠內'} 附近。`);
  } else if (machine && textIncludesAny(normalized, ['狀況', '狀態', '今天', 'oee', 'temperature', 'hc600'])) {
    runTool({ name: 'focus_camera', arguments: { id: machine.id } }, replies);
    runTool({ name: 'highlight_entity', arguments: { ids: [machine.id], color: '#ff7a1a' } }, replies);
    replies.push(statusText(machine));
  } else if (machine) {
    runTool({ name: 'focus_camera', arguments: { id: machine.id } }, replies);
    replies.push(statusText(machine));
  } else {
    replies.push('我可以在本機 demo 模式下協助查人員位置、查 HC600 狀態、指派人員維修，以及清除標記。');
  }

  useFactoryStore
    .getState()
    .addMessage({ id: uid('msg'), role: 'assistant', text: replies.filter(Boolean).join('\n') });
}
