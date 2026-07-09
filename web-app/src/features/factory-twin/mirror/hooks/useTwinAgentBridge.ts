// Cloud-agent bridge: pushes compact world snapshots to planner-server and polls
// the per-session feed, executing tool calls decided by the laptop worker LLM.
import { useEffect } from 'react';
import { api } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';
import { useAuthedQuery } from '../../../../lib/auth-query';
import type { TwinAgentFeedEvent } from '../../../../lib/types';
import { executeToolCall } from '../agent/tools';
import type { CameraEntity, Entity, MachineEntity, PersonEntity } from '../domain/entities';
import { machineUsesLiveMetricsOnly } from '../domain/entities';
import { machineIdForCamera } from '../domain/machineCameras';
import { uid, useFactoryStore } from '../store/factoryStore';

export const TWIN_AGENT_SESSION_ID = uid('twin-session');

const SNAPSHOT_INTERVAL_MS = 3000;
const UPDATES_INTERVAL_MS = 2000;
const MAX_SNAPSHOT_ENTITIES = 150;
const NEARBY_PERSON_RADIUS_M = 5;

const cursorRef = { current: null as number | null };
const processedSeqs = new Set<number>();

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function compactPosition(position: { x: number; y: number; z: number }): Record<string, number> {
  return { x: round1(position.x), y: round1(position.y), z: round1(position.z) };
}

function gaugeStatusText(status: unknown): string {
  if (status === 'ok') return '正常';
  if (status === 'degraded') return '異常';
  if (status === 'failed') return '辨識失敗';
  if (status === 'unknown') return '未判定';
  return typeof status === 'string' && status.trim() ? status : '未判定';
}

function ocrModeText(mode: unknown): string {
  if (mode === 'temperature_monitor') return '溫度監視畫面';
  if (mode === 'machine_monitor') return '機台監視畫面';
  return '未判定畫面';
}

function screenVisibilityText(status: unknown): string {
  if (status === 'lit') return '螢幕有亮，代表目前有開機跡象';
  if (status === 'dark') return '螢幕是暗的';
  return '螢幕狀態未判定';
}

function isMachine(entity: Entity): entity is MachineEntity {
  return entity.type === 'machine';
}

function isLivePerson(entity: Entity): entity is PersonEntity {
  return entity.type === 'person' && entity.source === 'live';
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
          id: e.id,
          type: e.type,
          name: e.name,
          position: compactPosition(e.position),
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
function compactPersonObservation(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const detections = Array.isArray(value.detections)
    ? value.detections
        .filter(isRecord)
        .slice(0, 10)
        .map((detection) => {
          const floorPosition = isRecord(detection.floorPosition) ? detection.floorPosition : null;
          return {
            confidence: detection.confidence,
            floorPosition:
              floorPosition && typeof floorPosition.x === 'number' && typeof floorPosition.z === 'number'
                ? { x: round1(floorPosition.x), z: round1(floorPosition.z) }
                : null,
          };
        })
    : [];
  return {
    personCount: value.personCount,
    capturedAt: value.capturedAt,
    receivedAt: value.receivedAt,
    detectorName: value.detectorName ?? null,
    detections,
  };
}

function compactScreenVisibility(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  return {
    status: value.status,
    statusText: screenVisibilityText(value.status),
    confidence: value.confidence,
    meanLuma: value.meanLuma,
    p90Luma: value.p90Luma,
    p98Luma: value.p98Luma,
  };
}

function compactCameraRealData(camera: CameraEntity): Record<string, unknown> {
  const attrs = camera.attrs ?? {};
  const summary: Record<string, unknown> = {
    id: camera.id,
    name: camera.name,
    siteLabel: camera.siteLabel,
    machineId: machineIdForCamera(camera.id),
    online: camera.online,
    capturedAt: attrs.latestFrameCapturedAt ?? attrs.lastFrameAt ?? null,
  };

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
        statusText: gaugeStatusText(r.status),
        capturedAt: r.capturedAt,
      }));
  }

  const observation = attrs.latestOcrObservation;
  if (isRecord(observation)) {
    const structured = isRecord(observation.structuredFields) ? observation.structuredFields : {};
    const gpt = isRecord(observation.gptSummary) ? observation.gptSummary : {};
    const screenVisibility = compactScreenVisibility(structured.screenVisibility);
    summary.hmiOcr = {
      mode: observation.mode,
      modeText: ocrModeText(observation.mode),
      capturedAt: observation.capturedAt,
      summary: typeof gpt.summary === 'string' ? gpt.summary : null,
      workOrder: structured.workOrder ?? null,
      ...(screenVisibility ? { screenVisibility } : {}),
    };
  }
  const personObservation = compactPersonObservation(attrs.latestPersonObservation);
  if (personObservation) summary.actualPersonObservation = personObservation;
  return summary;
}

function cameraHasActualData(camera: CameraEntity): boolean {
  const attrs = camera.attrs ?? {};
  return (
    (Array.isArray(attrs.latestGaugeReadings) && attrs.latestGaugeReadings.length > 0) ||
    isRecord(attrs.latestOcrObservation) ||
    isRecord(attrs.latestPersonObservation)
  );
}

function distance2d(a: Entity['position'], b: Entity['position']): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function compactNearbyPerson(person: PersonEntity): Record<string, unknown> {
  const attrs = person.attrs ?? {};
  return {
    id: person.id,
    name: person.name,
    station: person.station ?? null,
    position: compactPosition(person.position),
    sourceCamera: attrs.cameraLabel ?? attrs.platformCameraName ?? null,
    observedAt: attrs.receivedAt ?? attrs.capturedAt ?? null,
    personCount: typeof attrs.personCount === 'number' ? attrs.personCount : 1,
    approximate: attrs.approximate === true,
    confidence: typeof attrs.confidence === 'number' ? round1(attrs.confidence) : null,
  };
}

function screenPowerInferenceFor(cameraSummaries: Record<string, unknown>[]): Record<string, unknown> | null {
  for (const camera of cameraSummaries) {
    const hmiOcr = isRecord(camera.hmiOcr) ? camera.hmiOcr : null;
    const visibility = hmiOcr && isRecord(hmiOcr.screenVisibility) ? hmiOcr.screenVisibility : null;
    const status = visibility?.status;
    if (visibility && (status === 'lit' || status === 'dark')) {
      return {
        state: status === 'lit' ? 'screen_lit' : 'screen_dark',
        text: screenVisibilityText(status),
        sourceCamera: camera.name ?? null,
        capturedAt: hmiOcr?.capturedAt ?? null,
        confidence: visibility.confidence ?? null,
      };
    }
  }
  return null;
}

function buildMachineRealData(
  entities: Record<string, Entity>,
  platformCameras: CameraEntity[],
  livePersons: PersonEntity[],
): Record<string, unknown>[] {
  const machines = Object.values(entities).filter(isMachine);
  const people = livePersons.length > 0 ? livePersons : Object.values(entities).filter(isLivePerson);

  return machines.flatMap((machine) => {
    const relatedCameras = platformCameras.filter((camera) => machineIdForCamera(camera.id) === machine.id);
    const relatedCameraSummaries = relatedCameras.map(compactCameraRealData);
    const screenPowerInference = screenPowerInferenceFor(relatedCameraSummaries);
    const nearbyLivePersons = people
      .filter((person) => distance2d(machine.position, person.position) <= NEARBY_PERSON_RADIUS_M)
      .map(compactNearbyPerson);
    if (!machineUsesLiveMetricsOnly(machine) && relatedCameras.length === 0 && nearbyLivePersons.length === 0) {
      return [];
    }

    return [
      {
        machineId: machine.id,
        machineName: machine.name,
        aliases: machine.aliases ?? [],
        ...(screenPowerInference ? { screenPowerInference } : {}),
        metricsSource: machineUsesLiveMetricsOnly(machine) ? 'live' : machine.source,
        actualDataAvailable: relatedCameras.some(cameraHasActualData) || nearbyLivePersons.length > 0,
        relatedCameras: relatedCameraSummaries,
        nearbyLivePersons,
      },
    ];
  });
}

function buildWorldSnapshot(): Record<string, unknown> {
  const s = useFactoryStore.getState();
  return {
    entities: compactEntities(s.entities),
    recentEvents: s.simEvents
      .slice(0, 20)
      .map((event) => ({ atMs: event.atMs, type: event.type, message: event.message })),
    cameraSummary: s.platformCameras.map(compactCameraRealData),
    machineRealData: buildMachineRealData(s.entities, s.platformCameras, s.livePersons),
  };
}

function snapshotOrganizationId(): string | undefined {
  const organizationIds = new Set(
    useFactoryStore
      .getState()
      .platformCameras.map((camera) => camera.attrs?.platformOrganizationId)
      .filter((value): value is string => typeof value === 'string' && value.length > 0),
  );
  return organizationIds.size === 1 ? [...organizationIds][0] : undefined;
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
    const publishSnapshot = () => {
      const token = auth.session?.accessToken;
      if (!token) return;
      const organizationId = snapshotOrganizationId();
      void Promise.resolve(
        api.postTwinAgentSnapshot(token, {
          sessionId: TWIN_AGENT_SESSION_ID,
          capturedAt: new Date().toISOString(),
          world: buildWorldSnapshot(),
          ...(organizationId ? { organizationId } : {}),
        }),
      ).catch(() => {});
    };
    publishSnapshot();
    const timer = window.setInterval(() => {
      publishSnapshot();
    }, SNAPSHOT_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [auth.session?.accessToken]);

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
