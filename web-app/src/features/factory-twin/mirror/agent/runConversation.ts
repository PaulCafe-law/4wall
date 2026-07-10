import { executeToolCall } from './tools';
import type { ToolCall } from '../api/types';
import type { AmrEntity, Entity, MachineEntity, PersonEntity } from '../domain/entities';
import { machineUsesLiveMetricsOnly, statusLabel } from '../domain/entities';
import { buildDemoSimulationContext, type DemoScenarioId } from '../domain/demoScenarios';
import { useFactoryStore, uid } from '../store/factoryStore';
import { useWarehouseDemoStore } from '../store/warehouseDemoStore';
import { readyWarehousePlans } from '../warehouse/decision';

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
  if (machineUsesLiveMetricsOnly(machine)) {
    return `${machine.name} 僅顯示真實資料；目前機台狀態為 ${statusLabel(machine.status)}。請查看即時儀表、HMI OCR 或攝影機資料。`;
  }
  return `${machine.name} 目前狀態 ${machine.status}，OEE ${machine.oee}%，溫度 ${machine.temperature}°C，今日產量 ${machine.todayCount}，告警 ${machine.alarms} 次。`;
}

export async function runConversation(
  userText: string,
  options: { labelSimulation?: boolean; demoScenarioId?: DemoScenarioId; warehousePresentation?: boolean } = {},
): Promise<void> {
  const store = useFactoryStore.getState();
  store.addMessage({ id: uid('msg'), role: 'user', text: userText });

  const text = userText.trim();
  const normalized = text.toLowerCase();
  const entities = Object.values(useFactoryStore.getState().entities);
  const machine = machineFromText(text, entities);
  const person = personFromText(text, entities);
  const replies: string[] = [];

  if (options.warehousePresentation) {
    const warehouse = useWarehouseDemoStore.getState();
    const plans = readyWarehousePlans(warehouse.planSet);
    const selected = plans.find((plan) => plan.id === warehouse.selectedPlanId) ?? plans[0];
    const percent = Number(text.match(/(?:增加|\+)?\s*(\d{1,3})\s*%/)?.[1]);
    const outage = Number(text.match(/停機\s*(\d{1,3})/)?.[1]);

    if (textIncludesAny(normalized, ['需求', '停機', '重跑', '產生', '情境'])) {
      runTool(
        {
          name: 'run_warehouse_scenario',
          arguments: {
            ...(Number.isFinite(percent) ? { familyDemandIncreasePercent: percent } : {}),
            ...(Number.isFinite(outage) ? { workstationOutageMinutes: outage } : {}),
          },
        },
        replies,
      );
      const updated = useWarehouseDemoStore.getState().planSet;
      replies.push(updated ? `提案編號 ${updated.id}，所有數值皆為展示工廠模擬結果。` : '目前沒有可比較的倉儲提案。');
    } else if (textIncludesAny(normalized, ['搬遷最少', '最少搬遷'])) {
      const plan = plans.find((candidate) => candidate.objective === 'minimum_moves');
      if (plan) {
        runTool({ name: 'select_warehouse_plan', arguments: { objective: 'minimum_moves' } }, replies);
        replies.push(`需搬遷 ${plan.relocationCount} 個 SKU，AMR 總距離 ${Math.round(plan.kpis.totalAgvDistance)} 公尺。`);
      }
    } else if (textIncludesAny(normalized, ['比較', '三套', '方案', '提案'])) {
      replies.push(
        plans.length
          ? plans
              .map(
                (plan) =>
                  `${plan.label}：搬遷 ${plan.relocationCount} 個 SKU、距離 ${Math.round(plan.kpis.totalAgvDistance)} 公尺、完成 ${plan.kpis.completedOrders} 單`,
              )
              .join('；')
          : '目前沒有可比較的倉儲提案。',
      );
    } else if (textIncludesAny(normalized, ['壅塞', '排隊'])) {
      replies.push(
        selected
          ? `${selected.label}提案的工作站平均排隊 ${selected.kpis.averageQueueMinutes.toFixed(1)} 分鐘；本情境的主要限制是 WS-03 停機 ${warehouse.scenario.workstationOutageMinutes} 分鐘。`
          : '目前沒有可用的排隊模擬結果。',
      );
    } else {
      replies.push(
        selected
          ? `目前顯示「${selected.label}」提案：搬遷 ${selected.relocationCount} 個 SKU，完成 ${selected.kpis.completedOrders} 單，服務水準 ${selected.kpis.serviceLevelPercent.toFixed(1)}%。`
          : '倉儲模擬資料正在建立中。',
      );
    }
  } else if (textIncludesAny(normalized, ['clear', '清除', '取消標記'])) {
    runTool({ name: 'clear_overlays', arguments: {} }, replies);
  } else if (
    options.demoScenarioId &&
    textIncludesAny(normalized, ['計畫', '實際', '對帳', '達成率'])
  ) {
    const context = buildDemoSimulationContext(options.demoScenarioId, useFactoryStore.getState().entities);
    replies.push(
      `今日模擬計畫 ${context.totals.plan} 件，實際 ${context.totals.actual} 件，差異 ${context.totals.delta} 件，達成率 ${context.totals.attainmentRate}%。`,
    );
  } else if (textIncludesAny(normalized, ['amr', '自主移動機器人', '搬運機器人'])) {
    const amrs = entities.filter(
      (entity): entity is AmrEntity => entity.type === 'amr' && entity.source === 'sim',
    );
    replies.push(
      amrs.length > 0
        ? amrs
            .map(
              (amr) =>
                `${amr.name} ${statusLabel(amr.status)}、電量 ${amr.battery}%${amr.task ? `、任務 ${amr.task}` : '、目前無任務'}`,
            )
            .join('；')
        : '目前模擬情境中沒有 AMR 資料。',
    );
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

  const reply = replies.filter(Boolean).join('\n');
  useFactoryStore.getState().addMessage({
    id: uid('msg'),
    role: 'assistant',
    text: options.labelSimulation && !reply.startsWith('模擬情境：') ? `模擬情境：${reply}` : reply,
  });
}
