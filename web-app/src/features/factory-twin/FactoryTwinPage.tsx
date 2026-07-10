import { useEffect, useMemo, useState } from 'react';

import { api } from '../../lib/api';
import { isFactoryOpsCustomer, useAuth } from '../../lib/auth';
import { useAuthedQuery } from '../../lib/auth-query';
import type { CameraDevice } from '../../lib/types';
import { FactoryTwinWorkspace } from './FactoryTwinWorkspace';
import type { CameraEntity, PersonEntity, Vec3 } from './mirror/domain/entities';
import type { TwinAgentLiveDataStatus } from './mirror/hooks/useTwinAgentBridge';
import {
  HC600_01_LIVE_PERSON_ANCHOR_CHANGED_EVENT,
  livePersonAnchorForCamera,
  readStoredLivePersonAnchor,
} from './mirror/domain/machineCameras';
import { REAL_FACTORY_MOVEMENT_AREA } from './mirror/domain/movementArea';

const JINGCHENG_SITE_ID = 'dd6cbdd3aa744736ad96d2791d689fce';
// 現場人員保留窗:人在時偵測器每 ~10 秒送一次正向觀測維持新鮮;偵測器不再送「0 人」空觀測
// (見 gpu-person-presence main.py),所以人離開後由此窗自然老化清除。90 秒兼顧「不閃爍」與「離開後及時消失」。
const LIVE_PERSON_FRESH_MS = 90_000;
// Clocks differ across the camera edge (Pi), the detector host, and the browser.
// Allow observations that look slightly "in the future" from the client's clock.
const LIVE_PERSON_FUTURE_SKEW_MS = 60_000;
const LIVE_PERSON_BOUNDS_MARGIN_M = 2;
const CAMERA_SIGNAL_FRESH_MS = 90_000;

const FACTORY_CAMERA_LABELS: Array<{ ip: string; label: string; order: number }> = [
  { ip: '192.168.1.31', label: '機台周遭', order: 0 },
  { ip: '192.168.1.28', label: '桌面分類', order: 1 },
  { ip: '192.168.1.10', label: '儀表板', order: 2 },
];

function matchingFactoryCamera(camera: CameraDevice): { label: string; order: number } | null {
  const match = FACTORY_CAMERA_LABELS.find((item) => camera.name.includes(item.ip));
  if (!match) return null;
  if (camera.siteId && camera.siteId !== JINGCHENG_SITE_ID) return null;
  return { label: match.label, order: match.order };
}

function cameraSortOrder(camera: CameraDevice): number {
  return matchingFactoryCamera(camera)?.order ?? Number.MAX_SAFE_INTEGER;
}

function hasFreshCameraSignal(camera: CameraDevice): boolean {
  if (camera.status === 'inactive' || camera.lastError) return false;
  const timestamps = [camera.lastHeartbeatAt, camera.lastFrameAt, camera.latestFrame?.capturedAt]
    .filter((value): value is string => Boolean(value))
    .map((value) => Date.parse(value))
    .filter(Number.isFinite);
  if (timestamps.length === 0) return false;
  return Date.now() - Math.max(...timestamps) <= CAMERA_SIGNAL_FRESH_MS;
}

function latestTimestamp(values: Array<string | null | undefined>): string | null {
  let latestValue: string | null = null;
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!value) continue;
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed) || parsed <= latestMs) continue;
    latestMs = parsed;
    latestValue = value;
  }
  return latestValue;
}

function relativeAge(value: string | null, nowMs: number): string {
  if (!value) return '尚無更新時間';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return '更新時間不明';
  const seconds = Math.max(0, Math.round(((nowMs || Date.now()) - parsed) / 1000));
  if (seconds < 10) return '剛剛';
  if (seconds < 60) return `${seconds} 秒前`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  return `${Math.round(hours / 24)} 天前`;
}

function timestampIsFresh(value: string | null, nowMs: number, freshMs: number): boolean {
  if (!value) return false;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  const age = (nowMs || Date.now()) - parsed;
  return age >= -LIVE_PERSON_FUTURE_SKEW_MS && age <= freshMs;
}

function toFactoryCamera(camera: CameraDevice): CameraEntity {
  const label = matchingFactoryCamera(camera)?.label ?? camera.name;
  const online = hasFreshCameraSignal(camera);
  return {
    id: `fw-camera-${camera.cameraId}`,
    type: 'camera',
    name: label,
    position: { x: -1.5 + cameraSortOrder(camera) * 1.5, y: 1.6, z: -6.5 },
    status: online ? 'active' : 'inactive',
    source: 'live',
    siteLabel: '靚程工廠 / HC600-01',
    online,
    samplingIntervalSeconds: camera.samplingIntervalSeconds || 10,
    feedMode: 'snapshot',
    attrs: {
      platformCameraId: camera.cameraId,
      platformCameraName: camera.name,
      platformOrganizationId: camera.organizationId,
      latestFrameId: camera.latestFrame?.frameId ?? null,
      latestFrameCapturedAt: camera.latestFrame?.capturedAt ?? null,
      latestGaugeReadings: camera.latestGaugeReadings,
      latestOcrObservation: camera.latestOcrObservation,
      latestPersonObservation: camera.latestPersonObservation,
      uploadStatus: camera.latestFrame?.uploadStatus ?? null,
      analysisStatus: camera.latestFrame?.analysisStatus ?? null,
      uploadedFrameCount: camera.uploadedFrameCount,
      queuedFrameCount: camera.queuedFrameCount,
      failedFrameCount: camera.failedFrameCount,
      lastFrameAt: camera.lastFrameAt,
      lastHeartbeatAt: camera.lastHeartbeatAt,
      lastError: camera.lastError,
    },
  };
}

function isFreshObservation(timestamp: string, nowMs: number): boolean {
  if (nowMs <= 0) return false;
  const tMs = Date.parse(timestamp);
  if (!Number.isFinite(tMs)) return false;
  const age = nowMs - tMs;
  // Freshness is measured against the platform receive time (accurate NTP clock),
  // tolerating small forward skew so edge/browser clock drift does not hide people.
  return age >= -LIVE_PERSON_FUTURE_SKEW_MS && age <= LIVE_PERSON_FRESH_MS;
}

function isWithinLivePersonBounds(position: { x: number; z: number }): boolean {
  const bounds = REAL_FACTORY_MOVEMENT_AREA.bounds;
  return (
    Number.isFinite(position.x) &&
    Number.isFinite(position.z) &&
    position.x >= bounds.minX - LIVE_PERSON_BOUNDS_MARGIN_M &&
    position.x <= bounds.maxX + LIVE_PERSON_BOUNDS_MARGIN_M &&
    position.z >= bounds.minZ - LIVE_PERSON_BOUNDS_MARGIN_M &&
    position.z <= bounds.maxZ + LIVE_PERSON_BOUNDS_MARGIN_M
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- 測試需直接驗證 live 人員投影邏輯
export function toLivePersons(
  cameras: CameraDevice[],
  nowMs: number,
  livePersonAnchorOverride: Vec3 | null = null,
): PersonEntity[] {
  return cameras.flatMap((camera): PersonEntity[] => {
    const match = matchingFactoryCamera(camera);
    const observation = camera.latestPersonObservation;
    if (!match || !observation) return [];
    // Prefer platform receive time over camera capture time: the Pi's clock can lag,
    // which would otherwise push a just-received observation outside the window.
    const freshnessTimestamp = observation.receivedAt || observation.capturedAt;
    if (!isFreshObservation(freshnessTimestamp, nowMs)) return [];
    if (observation.personCount <= 0) return [];

    const anchor = livePersonAnchorForCamera(`fw-camera-${camera.cameraId}`, livePersonAnchorOverride);
    if (anchor) {
      const confidences = observation.detections
        .map((detection) => detection.confidence)
        .filter((value) => Number.isFinite(value));

      return [
        {
          id: `fw-live-person-${camera.cameraId}-presence`,
          type: 'person',
          name: observation.personCount > 1 ? `現場人員 ×${observation.personCount}` : '現場人員',
          role: 'anonymous-presence',
          station: match.label,
          position: anchor,
          status: 'on-duty',
          source: 'live',
          attrs: {
            fixedWorld: true,
            approximate: true,
            platformCameraId: camera.cameraId,
            platformCameraName: camera.name,
            cameraLabel: match.label,
            observationId: observation.observationId,
            frameId: observation.frameId,
            capturedAt: observation.capturedAt,
            receivedAt: observation.receivedAt,
            calibrationId: observation.calibrationId,
            detectorName: observation.detectorName,
            personCount: observation.personCount,
            placementRule: 'hc600_01_left_side_anchor',
            ...(confidences.length > 0 ? { confidence: Math.max(...confidences) } : {}),
          },
        } satisfies PersonEntity,
      ];
    }

    const projected = observation.detections.flatMap((detection, index) => {
      const floorPosition = detection.floorPosition;
      if (!floorPosition || !isWithinLivePersonBounds(floorPosition)) return [];

      return [
        {
          id: `fw-live-person-${camera.cameraId}-${observation.observationId}-${index}`,
          type: 'person',
          name: `現場人員 ${match.order + 1}-${index + 1}`,
          role: 'anonymous-presence',
          station: match.label,
          position: { x: floorPosition.x, y: 0.05, z: floorPosition.z },
          status: 'on-duty',
          source: 'live',
          attrs: {
            fixedWorld: true,
            platformCameraId: camera.cameraId,
            platformCameraName: camera.name,
            cameraLabel: match.label,
            observationId: observation.observationId,
            frameId: observation.frameId,
            capturedAt: observation.capturedAt,
            receivedAt: observation.receivedAt,
            calibrationId: observation.calibrationId,
            detectorName: observation.detectorName,
            confidence: detection.confidence,
            bbox: detection.bbox,
            footPoint: detection.footPoint,
          },
        } satisfies PersonEntity,
      ];
    });
    if (projected.length > 0) return projected;

    // 偵測到人但沒有任何有效地板投影(未校正或投影超出廠區)時,
    // 退回「攝影機對映機台旁」的估算位置,聚合成單一現場人員標記。
    const fallbackAnchor = livePersonAnchorForCamera(`fw-camera-${camera.cameraId}`, livePersonAnchorOverride);
    if (!fallbackAnchor) return [];
    const confidences = observation.detections
      .map((detection) => detection.confidence)
      .filter((value) => Number.isFinite(value));

    return [
      {
        id: `fw-live-person-${camera.cameraId}-presence`,
        type: 'person',
        name: observation.personCount > 1 ? `現場人員 ×${observation.personCount}` : '現場人員',
        role: 'anonymous-presence',
        station: match.label,
        position: fallbackAnchor,
        status: 'on-duty',
        source: 'live',
        attrs: {
          fixedWorld: true,
          approximate: true,
          platformCameraId: camera.cameraId,
          platformCameraName: camera.name,
          cameraLabel: match.label,
          observationId: observation.observationId,
          frameId: observation.frameId,
          capturedAt: observation.capturedAt,
          receivedAt: observation.receivedAt,
          calibrationId: observation.calibrationId,
          detectorName: observation.detectorName,
          personCount: observation.personCount,
          ...(confidences.length > 0 ? { confidence: Math.max(...confidences) } : {}),
        },
      } satisfies PersonEntity,
    ];
  });
}

export type FactoryTwinExperience = 'standard' | 'accelerator-demo';

export function DemoFactoryPage() {
  return <FactoryTwinPage experience="accelerator-demo" />;
}

export function FactoryTwinPage({ experience = 'standard' }: { experience?: FactoryTwinExperience }) {
  const auth = useAuth();
  const acceleratorDemo = experience === 'accelerator-demo';
  const liveOnly = !acceleratorDemo && isFactoryOpsCustomer(auth.user);
  const [nowMs, setNowMs] = useState(0);
  const [anchorPickerMode] = useState(() => new URLSearchParams(window.location.search).get('anchorPicker') === '1');
  const [livePersonAnchorOverride, setLivePersonAnchorOverride] = useState<Vec3 | null>(() =>
    readStoredLivePersonAnchor(),
  );
  const camerasQuery = useAuthedQuery({
    queryKey: ['factory-twin', 'cameras'],
    queryFn: api.listCameras,
    staleTime: 5_000,
    refetchInterval: 10_000,
  });

  useEffect(() => {
    const updateNow = () => setNowMs(Date.now());
    updateNow();
    const interval = window.setInterval(updateNow, 15_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleAnchorChanged = (event: Event) => {
      setLivePersonAnchorOverride((event as CustomEvent<Vec3 | null>).detail ?? readStoredLivePersonAnchor());
    };
    window.addEventListener(HC600_01_LIVE_PERSON_ANCHOR_CHANGED_EVENT, handleAnchorChanged);
    window.addEventListener('storage', handleAnchorChanged);
    return () => {
      window.removeEventListener(HC600_01_LIVE_PERSON_ANCHOR_CHANGED_EVENT, handleAnchorChanged);
      window.removeEventListener('storage', handleAnchorChanged);
    };
  }, []);

  const factoryCameraRecords = useMemo(() => {
    return [...(camerasQuery.data?.cameras ?? [])]
      .filter((camera) => Boolean(matchingFactoryCamera(camera)))
      .sort((a, b) => cameraSortOrder(a) - cameraSortOrder(b) || a.name.localeCompare(b.name));
  }, [camerasQuery.data?.cameras]);

  const platformCameras = useMemo(() => factoryCameraRecords.map(toFactoryCamera), [factoryCameraRecords]);

  const livePersons = useMemo(() => {
    const people = toLivePersons(camerasQuery.data?.cameras ?? [], nowMs, livePersonAnchorOverride);
    const previewAnchor =
      livePersonAnchorOverride ?? livePersonAnchorForCamera('fw-camera-hc600-01-anchor-preview');
    if (people.length > 0 || !anchorPickerMode || !previewAnchor) return people;
    return [
      {
        id: 'fw-live-person-anchor-preview',
        type: 'person',
        name: '現場人員定位預覽',
        role: 'anchor-preview',
        station: 'HC600-01',
        position: previewAnchor,
        status: 'on-duty',
        source: 'live',
        attrs: {
          fixedWorld: true,
          approximate: true,
          anchorPreview: true,
          placementRule: 'hc600_01_left_side_anchor',
        },
      } satisfies PersonEntity,
    ];
  }, [anchorPickerMode, camerasQuery.data?.cameras, livePersonAnchorOverride, nowMs]);
  const onlineCount = platformCameras.filter((camera) => camera.online).length;
  const livePersonCount = livePersons.reduce((total, person) => {
    if (person.attrs?.anchorPreview === true) return total;
    const count = person.attrs?.personCount;
    return total + (typeof count === 'number' && Number.isFinite(count) && count > 0 ? count : 1);
  }, 0);
  const initialLoading = camerasQuery.isLoading && !camerasQuery.data;
  const initialError = camerasQuery.isError && !camerasQuery.data;
  const cameraLatestAt = latestTimestamp(
    factoryCameraRecords.flatMap((camera) => [camera.lastFrameAt, camera.latestFrame?.capturedAt]),
  );
  const latestPersonObservation = factoryCameraRecords
    .map((camera) => camera.latestPersonObservation)
    .filter((observation): observation is NonNullable<CameraDevice['latestPersonObservation']> => Boolean(observation))
    .sort(
      (a, b) =>
        Date.parse(b.receivedAt || b.capturedAt) - Date.parse(a.receivedAt || a.capturedAt),
    )[0] ?? null;
  const personLatestAt = latestPersonObservation
    ? latestPersonObservation.receivedAt || latestPersonObservation.capturedAt
    : null;
  const personFresh = timestampIsFresh(personLatestAt, nowMs, LIVE_PERSON_FRESH_MS);
  const personState: TwinAgentLiveDataStatus['personState'] = initialLoading
    ? 'loading'
    : initialError
      ? 'error'
      : !personLatestAt
        ? 'unavailable'
        : personFresh
          ? 'current'
          : 'stale';
  const liveDataStatus = useMemo<TwinAgentLiveDataStatus>(
    () => ({
      mode: liveOnly ? 'live' : 'simulation',
      cameraState: initialLoading ? 'loading' : initialError ? 'error' : 'ready',
      cameraCount: initialLoading ? null : platformCameras.length,
      cameraLatestAt,
      personState,
      personLatestAt,
    }),
    [cameraLatestAt, initialError, initialLoading, liveOnly, personLatestAt, personState, platformCameras.length],
  );

  const cameraStatusText = initialLoading
    ? '攝影機載入中'
    : initialError
      ? '攝影機資料無法讀取'
      : platformCameras.length === 0
        ? '尚無攝影機資料'
        : onlineCount > 0
          ? `${onlineCount}/${platformCameras.length} 攝影機在線`
          : `攝影機資料最近一次在 ${relativeAge(cameraLatestAt, nowMs)}`;
  const cameraEvidenceText =
    !initialLoading && !initialError && cameraLatestAt
      ? timestampIsFresh(cameraLatestAt, nowMs, CAMERA_SIGNAL_FRESH_MS)
        ? `現場資料 ${relativeAge(cameraLatestAt, nowMs)}`
        : `現場資料最近一次在 ${relativeAge(cameraLatestAt, nowMs)}`
      : null;
  const personStatusText = initialLoading
    ? '人員資料載入中'
    : initialError
      ? '人員資料無法讀取'
      : livePersonCount > 0
        ? `現場 ${livePersonCount} 人`
        : latestPersonObservation && personFresh && latestPersonObservation.personCount === 0
          ? '現場 0 人（最近一次辨識）'
          : personLatestAt
            ? `人員資料最近一次在 ${relativeAge(personLatestAt, nowMs)}`
            : '人員資料尚無';
  const statusParts = acceleratorDemo
    ? [
        '展示模式',
        '營運數據皆為模擬',
        initialLoading
          ? '靚程授權影像載入中'
          : initialError
            ? '靚程授權影像暫時無法載入'
            : platformCameras.length > 0
              ? `靚程授權影像 ${onlineCount}/${platformCameras.length} 在線`
              : '靚程授權影像尚無資料',
        cameraLatestAt ? `影像最近更新 ${relativeAge(cameraLatestAt, nowMs)}` : null,
      ].filter(Boolean)
    : [cameraStatusText, cameraEvidenceText, personStatusText, '真實資料'].filter(Boolean);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b px-4 py-1.5 md:px-6 ${
          acceleratorDemo
            ? 'border-amber-300 bg-amber-50 text-amber-950'
            : 'border-chrome-200/80 bg-chrome-50/90'
        }`}
      >
        <h1 className="font-display text-sm font-semibold tracking-[-0.02em] text-chrome-950">
          {acceleratorDemo ? '4WALL 展示工廠' : '靚程工廠即時戰情室'}
        </h1>
        <p className="font-mono text-[11px] text-chrome-600">
          {statusParts.join('・')}
        </p>
      </div>

      {camerasQuery.isError ? (
        <div className="border-b border-amber-200 bg-amber-50/90 px-4 py-1.5 text-xs text-amber-900 md:px-6">
          {acceleratorDemo
            ? '靚程授權影像暫時無法載入，展示情境與模擬助手仍可正常使用。'
            : '暫時無法讀取攝影機資料，目前不會顯示最新現場資訊。'}
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <FactoryTwinWorkspace
          platformCameras={platformCameras}
          livePersons={acceleratorDemo ? [] : livePersons}
          liveOnly={liveOnly}
          liveDataStatus={liveDataStatus}
          demoPresentation={acceleratorDemo}
        />
      </div>
    </div>
  );
}
