// Cloud-agent bridge: pushes compact world snapshots to planner-server and polls
// the per-session feed, executing tool calls decided by the laptop worker LLM.
import { useEffect } from 'react';
import { api } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';
import { useAuthedQuery } from '../../../../lib/auth-query';
import type { TwinAgentFeedEvent } from '../../../../lib/types';
import { executeToolCall } from '../agent/tools';
import type { Entity } from '../domain/entities';
import { machineUsesLiveMetricsOnly } from '../domain/entities';
import { uid, useFactoryStore } from '../store/factoryStore';

export const TWIN_AGENT_SESSION_ID = uid('twin-session');

const SNAPSHOT_INTERVAL_MS = 3000;
const UPDATES_INTERVAL_MS = 2000;
const MAX_SNAPSHOT_ENTITIES = 150;

const cursorRef = { current: null as number | null };
const processedSeqs = new Set<number>();

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function compactEntity(e: Entity): Record<string, unknown> {
  const base = {
    id: e.id,
    type: e.type,
    name: e.name,
    status: e.status,
    position: { x: round1(e.position.x), y: round1(e.position.y), z: round1(e.position.z) },
  };
  switch (e.type) {
    case 'machine':
      if (machineUsesLiveMetricsOnly(e)) {
        return {
          ...base,
          model: e.model,
          metricsSource: 'live',
          metricsAvailable: false,
        };
      }
      return {
        ...base,
        model: e.model,
        oee: e.oee,
        temperature: e.temperature,
        todayCount: e.todayCount,
        alarms: e.alarms,
      };
    case 'amr':
      return { ...base, battery: e.battery, task: e.task };
    case 'person':
      return { ...base, role: e.source === 'live' ? '現場人員' : e.role, station: e.station };
    case 'zone':
      return { ...base, capacity: e.capacity, used: e.used };
    default:
      return base;
  }
}

export function compactEntities(entities: Record<string, Entity>): Record<string, unknown>[] {
  return Object.values(entities).slice(0, MAX_SNAPSHOT_ENTITIES).map(compactEntity);
}

// Real platform data (gauge readings / HMI OCR / 派工單) rides along with each
// camera so the agent can answer 實際讀表 questions instead of only sim state.
function compactCameraRealData(camera: Entity): Record<string, unknown> {
  const attrs = (camera as { attrs?: Record<string, unknown> }).attrs ?? {};
  const summary: Record<string, unknown> = { name: camera.name, online: (camera as { online?: boolean }).online ?? false };

  const readings = attrs.latestGaugeReadings;
  if (Array.isArray(readings) && readings.length > 0) {
    summary.actualGaugeReadings = readings
      .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
      .slice(0, 30)
      .map((r) => ({
        label: r.label,
        value: r.value,
        unit: r.unit,
        status: r.status,
        capturedAt: r.capturedAt,
      }));
  }

  const observation = attrs.latestOcrObservation;
  if (typeof observation === 'object' && observation !== null) {
    const obs = observation as Record<string, unknown>;
    const structured = (typeof obs.structuredFields === 'object' && obs.structuredFields !== null
      ? obs.structuredFields
      : {}) as Record<string, unknown>;
    const gpt = (typeof obs.gptSummary === 'object' && obs.gptSummary !== null ? obs.gptSummary : {}) as Record<string, unknown>;
    summary.hmiOcr = {
      mode: obs.mode,
      capturedAt: obs.capturedAt,
      summary: typeof gpt.summary === 'string' ? gpt.summary : null,
      workOrder: structured.workOrder ?? null,
    };
  }
  return summary;
}

function buildWorldSnapshot(): Record<string, unknown> {
  const s = useFactoryStore.getState();
  return {
    entities: compactEntities(s.entities),
    recentEvents: s.simEvents
      .slice(0, 20)
      .map((event) => ({ atMs: event.atMs, type: event.type, message: event.message })),
    cameraSummary: s.platformCameras.map(compactCameraRealData),
  };
}

function handleFeedEvent(event: TwinAgentFeedEvent): void {
  const s = useFactoryStore.getState();
  if (event.kind === 'reply') {
    s.addMessage({ id: uid('msg'), role: 'assistant', text: event.text ?? '' });
    s.decPendingAgentReplies();
    return;
  }
  const results = (event.toolCalls ?? []).map((call) => {
    try {
      return executeToolCall(call).message;
    } catch {
      return `工具 ${call.name} 執行失敗`;
    }
  });
  if (results.length > 0) {
    s.addMessage({ id: uid('msg'), role: 'system', text: results.filter(Boolean).join('\n') });
  }
}

export function useTwinAgentBridge() {
  const auth = useAuth();

  useEffect(() => {
    const timer = window.setInterval(() => {
      const token = auth.session?.accessToken;
      if (!token) return;
      api
        .postTwinAgentSnapshot(token, {
          sessionId: TWIN_AGENT_SESSION_ID,
          capturedAt: new Date().toISOString(),
          world: buildWorldSnapshot(),
        })
        .catch(() => {});
    }, SNAPSHOT_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [auth]);

  const updatesQuery = useAuthedQuery({
    queryKey: ['factory-twin', 'twin-agent-updates', TWIN_AGENT_SESSION_ID],
    queryFn: (token) => api.getTwinAgentUpdates(token, TWIN_AGENT_SESSION_ID, cursorRef.current),
    refetchInterval: UPDATES_INTERVAL_MS,
    retry: false,
  });

  const updatesFailed = updatesQuery.isError;
  useEffect(() => {
    if (updatesFailed) useFactoryStore.getState().setCloudAgentOnline(false);
  }, [updatesFailed]);

  const updates = updatesQuery.data;
  useEffect(() => {
    if (!updates) return;
    useFactoryStore.getState().setCloudAgentOnline(updates.workerOnline);
    if (cursorRef.current !== null && updates.cursor < cursorRef.current) {
      processedSeqs.clear();
    }
    cursorRef.current = updates.cursor;
    for (const event of updates.events) {
      if (processedSeqs.has(event.seq)) continue;
      processedSeqs.add(event.seq);
      handleFeedEvent(event);
    }
  }, [updates]);
}
