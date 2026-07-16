import { screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, vi } from 'vitest';

import { AppShell } from '../../app/shell';
import { RequireAuthenticated, RequireInternal } from '../../app/routes';
import { ApiError } from '../../lib/api';
import type { CameraDevice, CameraPersonObservation } from '../../lib/types';
import { createAuthValue, createSession, renderWithProviders } from '../../test/utils';
import { DemoFactoryPage, FactoryTwinPage, toLivePersons } from './FactoryTwinPage';
import {
  LIVE_PERSON_MACHINE_OFFSET_X_M,
  LIVE_PERSON_MACHINE_OFFSET_Z_M,
} from './mirror/domain/machineCameras';
import { buildMockEntities } from './mirror/domain/mockData';

const apiMock = vi.hoisted(() => ({
  listCameras: vi.fn(),
  listOpenBmcDevices: vi.fn(),
}));

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      listCameras: apiMock.listCameras,
      listOpenBmcDevices: apiMock.listOpenBmcDevices,
    },
  };
});

vi.mock('./FactoryTwinWorkspace', () => ({
  FactoryTwinWorkspace: ({
    platformCameras,
    livePersons,
    demoPresentation,
  }: {
    platformCameras: Array<{ name: string; attrs?: { latestGaugeReadings?: unknown[]; latestOcrObservation?: unknown } }>;
    livePersons: Array<{ id: string; name: string }>;
    demoPresentation?: boolean;
  }) => {
    const gaugeCount = platformCameras.reduce(
      (total, camera) => total + (camera.attrs?.latestGaugeReadings?.length ?? 0),
      0,
    );
    const ocrCount = platformCameras.filter((camera) => Boolean(camera.attrs?.latestOcrObservation)).length;
    return (
      <div data-testid="factory-twin-workspace">
        platform cameras: {platformCameras.length}
        gauge readings: {gaugeCount}
        ocr observations: {ocrCount}
        live persons: {livePersons.length}
        demo presentation: {String(Boolean(demoPresentation))}
        {platformCameras.map((camera) => (
          <span key={camera.name}>{camera.name}</span>
        ))}
        {livePersons.map((person) => (
          <span key={person.id}>{person.name}</span>
        ))}
      </div>
    );
  },
}));

function gaugeReading(cameraId: string, gaugeId: string): CameraDevice['latestGaugeReadings'][number] {
  return {
    readingId: `${cameraId}-${gaugeId}-reading`,
    cameraId,
    frameId: `${cameraId}-frame`,
    gaugeId,
    label: gaugeId,
    value: 0,
    unit: 'A',
    confidence: 0.98,
    rawPosition: 0,
    status: 'ok',
    source: 'live',
    capturedAt: '2026-07-02T23:28:55+08:00',
    receivedAt: '2026-07-02T23:28:57+08:00',
    metadata: {},
  };
}

function cameraFixture(
  cameraId: string,
  name: string,
  siteId: string | null,
  latestGaugeReadings: CameraDevice['latestGaugeReadings'] = [],
  latestPersonObservation: CameraDevice['latestPersonObservation'] = null,
): CameraDevice {
  return {
    cameraId,
    organizationId: 'org-1',
    siteId,
    name,
    status: 'active',
    rtspConfigured: true,
    samplingIntervalSeconds: 10,
    retentionDays: 7,
    localSpoolHours: 24,
    lastHeartbeatAt: new Date().toISOString(),
    lastFrameAt: new Date().toISOString(),
    lastError: null,
    uploadedFrameCount: 1,
    queuedFrameCount: 0,
    failedFrameCount: 0,
    latestGaugeReadings,
    latestOcrObservation: null,
    latestPersonObservation,
    latestFrame: {
      frameId: `${cameraId}-frame`,
      cameraId,
      capturedAt: '2026-06-19T14:57:04Z',
      storageKey: `camera-frames/${cameraId}.jpg`,
      contentType: 'image/jpeg',
      checksumSha256: 'a'.repeat(64),
      sizeBytes: 128,
      width: 1280,
      height: 720,
      uploadStatus: 'uploaded',
      analysisStatus: 'skipped',
      errorMessage: null,
      uploadExpiresAt: '2026-06-19T15:12:04Z',
      completedAt: '2026-06-19T14:57:05Z',
    },
  };
}

function personObservation(
  cameraId: string,
  overrides: Partial<CameraPersonObservation> = {},
): CameraPersonObservation {
  return {
    observationId: `${cameraId}-person-observation`,
    cameraId,
    frameId: `${cameraId}-frame`,
    source: 'live',
    capturedAt: new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    imageWidth: 1280,
    imageHeight: 720,
    calibrationId: 'factory-homography-1',
    detectorName: 'fake-person',
    personCount: 2,
    detections: [
      {
        bbox: [100, 120, 40, 160],
        confidence: 0.92,
        footPoint: [120, 280],
        floorPosition: { x: 1.25, z: -3.5 },
      },
      {
        bbox: [200, 150, 42, 180],
        confidence: 0.81,
        footPoint: [221, 330],
        floorPosition: { x: 4.25, z: -8.5 },
      },
    ],
    ...overrides,
  };
}

function renderFactoryRoute(auth = createAuthValue(), route = '/factory-twin') {
  return renderWithProviders(
    <Routes>
      <Route element={<RequireAuthenticated />}>
        <Route element={<AppShell />}>
          <Route path="/factory-twin" element={<FactoryTwinPage />} />
        </Route>
      </Route>
      <Route path="/login" element={<div>login page</div>} />
    </Routes>,
    { route, auth },
  );
}

function renderDemoRoute(auth = createAuthValue({ session: createSession({ globalRoles: ['platform_admin'] }) })) {
  return renderWithProviders(
    <Routes>
      <Route element={<RequireAuthenticated />}>
        <Route element={<AppShell />}>
          <Route
            path="/demo-factory"
            element={
              <RequireInternal>
                <DemoFactoryPage />
              </RequireInternal>
            }
          />
        </Route>
      </Route>
      <Route path="/login" element={<div>login page</div>} />
    </Routes>,
    { route: '/demo-factory', auth },
  );
}

describe('FactoryTwinPage', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
    window.localStorage.clear();
    apiMock.listCameras.mockReset();
    apiMock.listOpenBmcDevices.mockReset();
    apiMock.listOpenBmcDevices.mockResolvedValue({ devices: [] });
    apiMock.listCameras.mockResolvedValue({
      cameras: [
        cameraFixture('dental-1', 'AVTECH Ch1', 'fce8ab62e93843da961bbc751bf79176'),
        cameraFixture('wrong-site', 'PoE Camera 192.168.1.10', 'some-other-site'),
        cameraFixture('factory-1', 'PoE Camera 192.168.1.10', 'dd6cbdd3aa744736ad96d2791d689fce', [
          gaugeReading('factory-1', 'PRESS AM METER'),
          gaugeReading('factory-1', 'FLOW AM METER'),
        ]),
        cameraFixture('factory-2', 'PoE Camera 192.168.1.28', 'dd6cbdd3aa744736ad96d2791d689fce'),
        cameraFixture('factory-3', 'PoE Camera 192.168.1.31', 'dd6cbdd3aa744736ad96d2791d689fce'),
      ],
    });
  });

  it('adds a protected 4WALL AI platform page for the factory twin', async () => {
    renderFactoryRoute();

    expect(await screen.findByRole('heading', { name: '靚程工廠即時戰情室' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '工廠數位分身' })).toHaveAttribute('href', '/factory-twin');
    await waitFor(() => {
      expect(screen.getByTestId('factory-twin-workspace')).toHaveTextContent('platform cameras: 3');
    });
    // 統計卡已改為 3D 區塊上方的一行狀態列。
    expect(await screen.findByText(/3\/3 攝影機在線.*人員資料尚無.*真實資料/)).toBeInTheDocument();
    expect(screen.queryByText('快照更新')).not.toBeInTheDocument();
    expect(screen.queryByText('已綁定至數位分身的平台攝影機')).not.toBeInTheDocument();
    expect(screen.getByTestId('factory-twin-workspace')).toHaveTextContent('gauge readings: 2');
    expect(screen.getByTestId('factory-twin-workspace')).toHaveTextContent('live persons: 0');
    expect(screen.getByTestId('factory-twin-workspace')).toHaveTextContent('機台周遭');
    expect(screen.getByTestId('factory-twin-workspace')).toHaveTextContent('桌面分類');
    expect(screen.getByTestId('factory-twin-workspace')).toHaveTextContent('儀表板');
    expect(screen.getByTestId('factory-twin-workspace').textContent).toMatch(/機台周遭.*桌面分類.*儀表板/s);
    expect(screen.queryByText(/知識圖譜|Knowledge Graph/i)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(apiMock.listCameras).toHaveBeenCalledWith('test-token');
    });
    expect(apiMock.listOpenBmcDevices).not.toHaveBeenCalled();
  });

  it('redirects anonymous users to the login page', async () => {
    renderFactoryRoute(
      createAuthValue({
        status: 'anonymous',
        session: null,
        user: null,
      }),
    );

    expect(await screen.findByText('login page')).toBeInTheDocument();
    expect(screen.queryByText('靚程工廠即時戰情室')).not.toBeInTheDocument();
  });

  it('anchors fresh valid person observations beside HC600-01', async () => {
    apiMock.listCameras.mockResolvedValueOnce({
      cameras: [
        cameraFixture(
          'factory-1',
          'PoE Camera 192.168.1.10',
          'dd6cbdd3aa744736ad96d2791d689fce',
          [],
          personObservation('factory-1'),
        ),
      ],
    });

    renderFactoryRoute();

    expect(await screen.findByText(/現場 2 人/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('factory-twin-workspace')).toHaveTextContent('live persons: 1');
    });
    expect(screen.getByTestId('factory-twin-workspace').textContent).toContain('×2');
  });

  it('does not present offline-file person observations as live factory evidence', async () => {
    apiMock.listCameras.mockResolvedValueOnce({
      cameras: [
        cameraFixture(
          'factory-1',
          'PoE Camera 192.168.1.31',
          'dd6cbdd3aa744736ad96d2791d689fce',
          [],
          personObservation('factory-1', { source: 'offline_file' }),
        ),
      ],
    });

    renderFactoryRoute();

    expect(await screen.findByText(/人員資料尚無/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('factory-twin-workspace')).toHaveTextContent('live persons: 0');
    });
  });

  it('renders an internal-only accelerator workspace with separated data labels', async () => {
    apiMock.listCameras.mockResolvedValueOnce({
      cameras: [
        cameraFixture(
          'factory-1',
          'PoE Camera 192.168.1.10',
          'dd6cbdd3aa744736ad96d2791d689fce',
          [],
          personObservation('factory-1'),
        ),
        cameraFixture('factory-2', 'PoE Camera 192.168.1.28', 'dd6cbdd3aa744736ad96d2791d689fce'),
        cameraFixture('factory-3', 'PoE Camera 192.168.1.31', 'dd6cbdd3aa744736ad96d2791d689fce'),
      ],
    });

    renderDemoRoute();

    expect(await screen.findByRole('heading', { name: '4WALL 展示工廠' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '4WALL 展示工廠' })).toHaveAttribute('href', '/demo-factory');
    await waitFor(() => {
      expect(screen.getByTestId('factory-twin-workspace')).toHaveTextContent('platform cameras: 3');
    });
    expect(screen.getByText(/展示模式.*營運數據皆為模擬.*靚程授權影像 3\/3 在線/)).toBeInTheDocument();
    expect(screen.getByTestId('factory-twin-workspace')).toHaveTextContent('live persons: 0');
    expect(screen.getByTestId('factory-twin-workspace')).toHaveTextContent('demo presentation: true');
    expect(await screen.findByText('SIMULATED')).toBeInTheDocument();
    await waitFor(() => {
      expect(apiMock.listOpenBmcDevices).toHaveBeenCalledWith('test-token', {
        siteId: 'dd6cbdd3aa744736ad96d2791d689fce',
      });
    });
  });

  it('does not mask an OpenBMC API failure with simulated state', async () => {
    apiMock.listOpenBmcDevices.mockRejectedValueOnce(new ApiError(503, 'openbmc unavailable'));

    renderDemoRoute();

    expect(await screen.findByText('UNAVAILABLE')).toBeInTheDocument();
    expect(screen.queryByText('SIMULATED')).not.toBeInTheDocument();
    expect(screen.getByText('OpenBMC 服務目前無法讀取。')).toBeInTheDocument();
  });

  it('does not expose the accelerator workspace to customer-only accounts', async () => {
    const session = createSession({
      globalRoles: [],
      memberships: [
        {
          membershipId: 'jingcheng-membership',
          organizationId: 'jingcheng-org',
          organizationName: '靚程企業',
          organizationSlug: 'jingcheng',
          productMode: 'factory_ops',
          role: 'customer_viewer',
          isActive: true,
        },
      ],
    });

    renderDemoRoute(createAuthValue({ session, isInternal: false }));

    expect(await screen.findByText('這個頁面僅提供 internal 使用')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '4WALL 展示工廠' })).not.toBeInTheDocument();
  });

  it('shows a live-person anchor preview only in anchor picker mode', async () => {
    window.localStorage.setItem(
      'fourwall:factory-twin:hc600-01-live-person-anchor',
      JSON.stringify({ x: 1.5, y: 0.05, z: -8.5 }),
    );
    window.history.pushState({}, '', '/factory-twin?anchorPicker=1');
    apiMock.listCameras.mockResolvedValueOnce({ cameras: [] });

    renderFactoryRoute(createAuthValue(), '/factory-twin?anchorPicker=1');

    expect(await screen.findByText(/人員資料尚無/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('factory-twin-workspace')).toHaveTextContent('live persons: 1');
    });
    expect(screen.getByTestId('factory-twin-workspace')).toHaveTextContent('現場人員定位預覽');
  });

  it('drops expired observations and observations without detected people', async () => {
    apiMock.listCameras.mockResolvedValueOnce({
      cameras: [
        cameraFixture(
          'expired',
          'PoE Camera 192.168.1.10',
          'dd6cbdd3aa744736ad96d2791d689fce',
          [],
          personObservation('expired', { capturedAt: '2020-01-01T00:00:00Z' }),
        ),
        cameraFixture(
          'nobody',
          'PoE Camera 192.168.1.28',
          'dd6cbdd3aa744736ad96d2791d689fce',
          [],
          personObservation('nobody', { personCount: 0, detections: [] }),
        ),
      ],
    });

    renderFactoryRoute();

    await waitFor(() => {
      expect(screen.getByTestId('factory-twin-workspace')).toHaveTextContent('live persons: 0');
    });
  });

  it('falls back to a machine-side presence marker when floor projection is unavailable', async () => {
    apiMock.listCameras.mockResolvedValueOnce({
      cameras: [
        cameraFixture(
          'machine-cam',
          'PoE Camera 192.168.1.31',
          'dd6cbdd3aa744736ad96d2791d689fce',
          [],
          personObservation('machine-cam', {
            personCount: 2,
            detections: [
              {
                bbox: [100, 120, 40, 160],
                confidence: 0.92,
                footPoint: [120, 280],
                floorPosition: null,
              },
              {
                bbox: [200, 150, 42, 180],
                confidence: 0.81,
                footPoint: [221, 330],
                floorPosition: { x: 999, z: 999 },
              },
            ],
          }),
        ),
      ],
    });

    renderFactoryRoute();

    await waitFor(() => {
      expect(screen.getByTestId('factory-twin-workspace')).toHaveTextContent('live persons: 1');
    });
    expect(screen.getByTestId('factory-twin-workspace')).toHaveTextContent('現場人員 ×2');
  });

  it('shows loading instead of zero before the first camera response', () => {
    apiMock.listCameras.mockReturnValueOnce(new Promise(() => {}));

    renderFactoryRoute();

    expect(screen.getByText(/攝影機載入中・人員資料載入中・真實資料/)).toBeInTheDocument();
    expect(screen.queryByText(/現場 0 人|0 攝影機/)).not.toBeInTheDocument();
  });

  it('labels stale camera and person evidence with the last update age', async () => {
    const staleAt = new Date(Date.now() - 5 * 60_000).toISOString();
    const camera = cameraFixture(
      'stale-camera',
      'PoE Camera 192.168.1.31',
      'dd6cbdd3aa744736ad96d2791d689fce',
      [],
      personObservation('stale-camera', { capturedAt: staleAt, receivedAt: staleAt }),
    );
    camera.lastHeartbeatAt = staleAt;
    camera.lastFrameAt = staleAt;
    apiMock.listCameras.mockResolvedValueOnce({ cameras: [camera] });

    renderFactoryRoute();

    expect(await screen.findByText(/攝影機資料最近一次在 5 分鐘前/)).toBeInTheDocument();
    expect(screen.getByText(/人員資料最近一次在 5 分鐘前/)).toBeInTheDocument();
  });
});

describe('toLivePersons', () => {
  it('anchors the fallback presence marker at the calibrated HC600-01 live-person point', () => {
    const nowMs = Date.now();
    const machine = buildMockEntities()['m-hc600'];
    const camera = cameraFixture(
      'machine-cam',
      'PoE Camera 192.168.1.31',
      'dd6cbdd3aa744736ad96d2791d689fce',
      [],
      personObservation('machine-cam', {
        personCount: 2,
        detections: [
          { bbox: [100, 120, 40, 160], confidence: 0.92, footPoint: [120, 280], floorPosition: null },
          { bbox: [200, 150, 42, 180], confidence: 0.81, footPoint: [221, 330], floorPosition: null },
        ],
      }),
    );

    const persons = toLivePersons([camera], nowMs);

    expect(persons).toHaveLength(1);
    expect(persons[0].id).toBe('fw-live-person-machine-cam-presence');
    expect(persons[0].name).toBe('現場人員 ×2');
    expect(persons[0].source).toBe('live');
    expect(persons[0].position).toEqual({
      x: machine.position.x + LIVE_PERSON_MACHINE_OFFSET_X_M,
      y: 0.05,
      z: machine.position.z + LIVE_PERSON_MACHINE_OFFSET_Z_M,
    });
    expect(persons[0].attrs?.personCount).toBe(2);
    expect(persons[0].attrs?.approximate).toBe(true);
    expect(persons[0].attrs?.placementRule).toBe('hc600_01_left_side_anchor');
    expect(persons[0].attrs?.confidence).toBe(0.92);
  });

  it('uses a manually selected anchor for the HC600-01 live person marker', () => {
    const nowMs = Date.now();
    const manualAnchor = { x: 1.23, y: 0.05, z: -9.87 };
    const camera = cameraFixture(
      'machine-cam',
      'PoE Camera 192.168.1.31',
      'dd6cbdd3aa744736ad96d2791d689fce',
      [],
      personObservation('machine-cam', {
        personCount: 1,
        detections: [
          { bbox: [100, 120, 40, 160], confidence: 0.92, footPoint: [120, 280], floorPosition: null },
        ],
      }),
    );

    const persons = toLivePersons([camera], nowMs, manualAnchor);

    expect(persons).toHaveLength(1);
    expect(persons[0].position).toEqual(manualAnchor);
    expect(persons[0].attrs?.placementRule).toBe('hc600_01_left_side_anchor');
  });

  it('measures freshness by receivedAt within the 90s window and drops older ones', () => {
    const nowMs = Date.now();
    const freshCamera = cameraFixture(
      'fresh',
      'PoE Camera 192.168.1.31',
      'dd6cbdd3aa744736ad96d2791d689fce',
      [],
      personObservation('fresh', { receivedAt: new Date(nowMs - 80_000).toISOString() }),
    );
    const staleCamera = cameraFixture(
      'stale',
      'PoE Camera 192.168.1.31',
      'dd6cbdd3aa744736ad96d2791d689fce',
      [],
      personObservation('stale', { receivedAt: new Date(nowMs - 100_000).toISOString() }),
    );

    expect(toLivePersons([freshCamera], nowMs)).toHaveLength(1);
    expect(toLivePersons([staleCamera], nowMs)).toHaveLength(0);
  });

  it('prefers receivedAt over a lagging camera capturedAt clock', () => {
    const nowMs = Date.now();
    // Edge (Pi) clock lags: capturedAt looks old, but the platform received it just now.
    const camera = cameraFixture(
      'lagging-clock',
      'PoE Camera 192.168.1.28',
      'dd6cbdd3aa744736ad96d2791d689fce',
      [],
      personObservation('laggy', {
        capturedAt: new Date(nowMs - 600_000).toISOString(),
        receivedAt: new Date(nowMs - 5_000).toISOString(),
      }),
    );
    // Kept (not dropped) despite the stale capturedAt, because receivedAt is recent.
    expect(toLivePersons([camera], nowMs)).toHaveLength(1);
  });
});
