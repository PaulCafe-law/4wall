import { useEffect, useRef } from 'react';
import { useFactoryStore } from '../store/factoryStore';

function severityFor(type: string): 'info' | 'warning' | 'critical' {
  if (type === 'machine') return 'warning';
  if (type === 'repair') return 'info';
  return 'info';
}

function titleFor(type: string): string {
  if (type === 'machine') return '機台告警';
  if (type === 'dispatch') return '自動派工';
  if (type === 'repair') return '修復閉環';
  if (type === 'amr') return 'AMR 任務';
  if (type === 'drone') return '巡檢事件';
  return 'Factory Twin 事件';
}

export function useLocalAgent(enabled = true) {
  const seen = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled) {
      useFactoryStore.getState().setAgentConnected(false);
      return;
    }
    useFactoryStore.getState().setAgentConnected(true);
    return () => useFactoryStore.getState().setAgentConnected(false);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    return useFactoryStore.subscribe((state) => {
      for (const event of state.simEvents) {
        if (seen.current.has(event.id) || event.important === false) continue;
        seen.current.add(event.id);
        state.addAgentNotification({
          id: `local-agent-${event.id}`,
          auditId: `local-audit-${event.id}`,
          title: titleFor(event.type),
          message: event.message,
          severity: severityFor(event.type),
          entityId: event.entityId,
          createdAtMs: Date.now(),
          lineMode: 'mock',
        });
      }
    });
  }, [enabled]);
}
