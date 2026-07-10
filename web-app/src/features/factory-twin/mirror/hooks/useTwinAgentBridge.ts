// Cloud-agent bridge: pushes compact world snapshots to planner-server and polls
// the per-session feed, executing tool calls decided by the laptop worker LLM.
import { useEffect } from 'react';
import { api } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';
import { useAuthedQuery } from '../../../../lib/auth-query';
import type { TwinAgentFeedEvent } from '../../../../lib/types';
import {
  WORK_ORDER_CONFIDENCE_THRESHOLD,
  isWorkOrderCellKnown,
  parseWorkOrderSheet,
} from '../../../../lib/work-order';
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
const LIVE_SOURCE_FRESH_MS = 90_000;

export interface TwinAgentLiveDataStatus {
  mode: 'live' | 'simulation';
  cameraState: 'loading' | 'ready' | 'error';
  cameraCount: number | null;
  cameraLatestAt: string | null;
  personState: 'loading' | 'current' | 'stale' | 'unavailable' | 'error';
  personLatestAt: string | null;
}

const cursorRef = { current: null as number | null };
const processedSeqs = new Set<number>();

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function ageSeconds(value: unknown): number | null {
  if (typeof value !== 'string' || !value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.round((Date.now() - timestamp) / 1000));
}

function ageText(seconds: number | null): string {
  if (seconds === null) return '尚無更新時間';
  if (seconds < 10) return '剛剛';
  if (seconds < 60) return `${seconds} 秒前`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  return `${Math.round(hours / 24)} 天前`;
}

function freshness(value: unknown, freshMs = LIVE_SOURCE_FRESH_MS): Record<string, unknown> {
  const seconds = ageSeconds(value);
  return {
    state: seconds === null ? 'unavailable' : seconds * 1000 <= freshMs ? 'current' : 'stale',
    ageSeconds: seconds,
    ageText: ageText(seconds),
  };
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
      return {
        ...base,
        dataSource: e.source === 'live' ? 'live' : 'simulation',
        battery: e.battery,
        task: e.task,
      };
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
    freshness: freshness(value.receivedAt ?? value.capturedAt),
    detections,
  };
}

function workOrderReview(structuredFields: Record<string, unknown>): Record<string, unknown> | null {
  if (!isRecord(structuredFields.workOrder)) return null;
  const sheet = parseWorkOrderSheet(structuredFields);
  if (!sheet) {
    return {
      status: 'pending_confirmation',
      statusText: '待確認',
      reasons: ['派工單結構尚未完整'],
    };
  }

  const leaves = [
    ...Object.values(sheet.fields),
    ...Object.values(sheet.quantities).flatMap((row) => [row.left, row.right]),
  ].filter(isWorkOrderCellKnown);
  const confidences = leaves.map((leaf) => leaf.confidence).filter(Number.isFinite);
  const lowConfidence = confidences.some((value) => value < WORK_ORDER_CONFIDENCE_THRESHOLD);
  const reasons: string[] = [];
  if (!sheet.stabilized) reasons.push('尚未完成多幀確認');
  if (lowConfidence) reasons.push('部分欄位辨識信心不足');
  const pending = reasons.length > 0;
  return {
    status: pending ? 'pending_confirmation' : 'confirmed',
    statusText: pending ? '待確認' : '已確認',
    stabilized: sheet.stabilized,
    minimumConfidence: confidences.length > 0 ? Math.min(...confidences) : null,
    reasons,
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
  const capturedAt = attrs.latestFrameCapturedAt ?? attrs.lastFrameAt ?? null;
  const summary: Record<string, unknown> = {
    id: camera.id,
    name: camera.name,
    siteLabel: camera.siteLabel,
    machineId: machineIdForCamera(camera.id),
    online: camera.online,
    capturedAt,
    freshness: freshness(capturedAt ?? attrs.lastHeartbeatAt),
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
        freshness: freshness(r.receivedAt ?? r.capturedAt),
      }));
  }

  const observation = attrs.latestOcrObservation;
  if (isRecord(observation)) {
    const structured = isRecord(observation.structuredFields) ? observation.structuredFields : {};
    const gpt = isRecord(observation.gptSummary) ? observation.gptSummary : {};
    const screenVisibility = compactScreenVisibility(structured.screenVisibility);
    const review = workOrderReview(structured);
    summary.hmiOcr = {
      mode: observation.mode,
      modeText: ocrModeText(observation.mode),
      capturedAt: observation.capturedAt,
      receivedAt: observation.receivedAt ?? null,
      freshness: freshness(observation.receivedAt ?? observation.capturedAt),
      summary: typeof gpt.summary === 'string' ? gpt.summary : null,
      workOrder: structured.workOrder ?? null,
      ...(review ? { workOrderReview: review } : {}),
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
        freshness: hmiOcr?.freshness ?? freshness(hmiOcr?.capturedAt),
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

function buildDataAvailability(
  entities: Record<string, Entity>,
  platformCameras: CameraEntity[],
  liveDataStatus?: TwinAgentLiveDataStatus,
): Record<string, unknown> {
  const liveAmrCount = Object.values(entities).filter(
    (entity) => entity.type === 'amr' && entity.source === 'live',
  ).length;
  const simulatedAmrCount = Object.values(entities).filter(
    (entity) => entity.type === 'amr' && entity.source !== 'live',
  ).length;
  const cameraLatestAt = liveDataStatus?.cameraLatestAt ?? null;
  const personLatestAt = liveDataStatus?.personLatestAt ?? null;

  return {
    camera: {
      state: liveDataStatus?.cameraState ?? 'ready',
      count: liveDataStatus ? liveDataStatus.cameraCount : platformCameras.length,
      latestAt: cameraLatestAt,
      freshness: freshness(cameraLatestAt),
    },
    people: {
      state: liveDataStatus?.personState ?? 'unavailable',
      latestAt: personLatestAt,
      freshness: freshness(personLatestAt),
    },
    amr:
      liveAmrCount > 0
        ? { state: 'current', source: 'live', count: liveAmrCount }
        : liveDataStatus?.mode === 'live'
          ? {
              state: 'not_connected',
              source: 'live',
              count: 0,
              text: '靚程工廠目前沒有接入真實 AMR 資料',
            }
          : simulatedAmrCount > 0
            ? { state: 'simulation', source: 'simulation', count: simulatedAmrCount }
            : { state: 'unavailable', count: 0 },
  };
}

function buildWorldSnapshot(liveDataStatus?: TwinAgentLiveDataStatus): Record<string, unknown> {
  const s = useFactoryStore.getState();
  return {
    dataAvailability: buildDataAvailability(s.entities, s.platformCameras, liveDataStatus),
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

export function useTwinAgentBridge(liveDataStatus?: TwinAgentLiveDataStatus) {
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
          world: buildWorldSnapshot(liveDataStatus),
          ...(organizationId ? { organizationId } : {}),
        }),
      ).catch(() => {});
    };
    publishSnapshot();
    const timer = window.setInterval(() => {
      publishSnapshot();
    }, SNAPSHOT_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [auth.session?.accessToken, liveDataStatus]);

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
