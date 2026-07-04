import { screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, vi } from 'vitest';

import { AppShell } from '../../app/shell';
import { RequireAuthenticated } from '../../app/routes';
import type { CameraDevice, CameraPersonObservation } from '../../lib/types';
import { createAuthValue, renderWithProviders } from '../../test/utils';
import { FactoryTwinPage } from './FactoryTwinPage';

const apiMock = vi.hoisted(() => ({
  listCameras: vi.fn(),
}));

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      listCameras: apiMock.listCameras,
    },
  };
});

vi.mock('./FactoryTwinWorkspace', () => ({
  FactoryTwinWorkspace: ({
    platformCameras,
    livePersons,
  }: {
    platformCameras: Array<{ name: string; attrs?: { latestGaugeReadings?: unknown[]; latestOcrObservation?: unknown } }>;
    livePersons: Array<{ id: string; name: string }>;
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

function renderFactoryRoute(auth = createAuthValue()) {
  return renderWithProviders(
    <Routes>
      <Route element={<RequireAuthenticated />}>
        <Route element={<AppShell />}>
          <Route path="/factory-twin" element={<FactoryTwinPage />} />
        </Route>
      </Route>
      <Route path="/login" element={<div>login page</div>} />
    </Routes>,
    { route: '/factory-twin', auth },
  );
}

describe('FactoryTwinPage', () => {
  beforeEach(() => {
    apiMock.listCameras.mockReset();
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

  it('adds a protected Fourth Wall platform page for the factory twin', async () => {
    renderFactoryRoute();

    expect(await screen.findByRole('heading', { name: '靚程工廠 Digital Twin' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '工廠數位分身' })).toHaveAttribute('href', '/factory-twin');
    await waitFor(() => {
      expect(screen.getByTestId('factory-twin-workspace')).toHaveTextContent('platform cameras: 3');
    });
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
    expect(screen.queryByText('靚程工廠 Digital Twin')).not.toBeInTheDocument();
  });

  it('projects fresh valid person observations into live person entities', async () => {
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

    expect(await screen.findByText('現場人數')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('factory-twin-workspace')).toHaveTextContent('live persons: 2');
    });
    expect(screen.getByTestId('factory-twin-workspace')).toHaveTextContent('現場人員 3-1');
    expect(screen.getByTestId('factory-twin-workspace')).toHaveTextContent('現場人員 3-2');
  });

  it('drops expired, null, and out-of-bounds live person projections', async () => {
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
          'bad-projection',
          'PoE Camera 192.168.1.28',
          'dd6cbdd3aa744736ad96d2791d689fce',
          [],
          personObservation('bad-projection', {
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
      expect(screen.getByTestId('factory-twin-workspace')).toHaveTextContent('live persons: 0');
    });
  });
});
