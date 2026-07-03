import { screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, vi } from 'vitest';

import { renderWithProviders } from '../../../../../test/utils';
import type { CameraEntity } from '../../domain/entities';
import { CameraFeed } from './CameraMonitor';

const apiMock = vi.hoisted(() => ({
  fetchCameraLatestFrameBlob: vi.fn(),
}));

vi.mock('../../../../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../../../../lib/api')>('../../../../../lib/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      fetchCameraLatestFrameBlob: apiMock.fetchCameraLatestFrameBlob,
    },
  };
});

const createObjectURLMock = vi.fn();
const revokeObjectURLMock = vi.fn();

function cameraFixture(overrides: Partial<CameraEntity> = {}): CameraEntity {
  const now = new Date().toISOString();
  return {
    id: 'fw-camera-factory-1',
    type: 'camera',
    name: '機台周遭',
    position: { x: 0, y: 0, z: 0 },
    status: 'active',
    source: 'live',
    siteLabel: '靚程工廠 / HC600-01',
    online: true,
    samplingIntervalSeconds: 10,
    feedMode: 'snapshot',
    attrs: {
      platformCameraId: 'factory-1',
      latestFrameId: 'frame-1',
      latestFrameCapturedAt: now,
      uploadStatus: 'uploaded',
      analysisStatus: 'skipped',
      uploadedFrameCount: 1,
      lastFrameAt: now,
      lastHeartbeatAt: now,
      lastError: null,
    },
    ...overrides,
  };
}

beforeEach(() => {
  apiMock.fetchCameraLatestFrameBlob.mockReset();
  apiMock.fetchCameraLatestFrameBlob.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }));
  createObjectURLMock.mockReset();
  createObjectURLMock.mockReturnValue('blob:factory-frame');
  revokeObjectURLMock.mockReset();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURLMock });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURLMock });
});

describe('Factory Twin CameraFeed', () => {
  it('fetches and renders only the real Fourth Wall latest frame for snapshot cameras', async () => {
    const { container, unmount } = renderWithProviders(<CameraFeed entity={cameraFixture()} />);

    expect(await screen.findByAltText('機台周遭 雲端最新截圖')).toHaveAttribute('src', 'blob:factory-frame');
    await waitFor(() => {
      expect(apiMock.fetchCameraLatestFrameBlob).toHaveBeenCalledWith('test-token', 'factory-1');
    });
    expect(container).not.toHaveTextContent('Fourth Wall Camera');
    expect(container).not.toHaveTextContent('Frame');
    expect(container).not.toHaveTextContent('Upload');
    expect(container).not.toHaveTextContent('Analysis');

    unmount();
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:factory-frame');
  });

  it('does not call the platform image API for mock cameras', () => {
    const { container } = renderWithProviders(<CameraFeed entity={cameraFixture({ feedMode: 'mock', source: 'sim' })} />);

    expect(apiMock.fetchCameraLatestFrameBlob).not.toHaveBeenCalled();
    expect(container.querySelector('img')).not.toBeInTheDocument();
  });

  it('renders an old platform frame without stale text over the image', async () => {
    const staleTime = new Date(Date.now() - 10 * 60_000).toISOString();
    const { container } = renderWithProviders(
      <CameraFeed
        entity={cameraFixture({
          attrs: {
            platformCameraId: 'factory-1',
            latestFrameId: 'frame-old',
            latestFrameCapturedAt: staleTime,
            uploadStatus: 'uploaded',
            analysisStatus: 'skipped',
            uploadedFrameCount: 1,
            lastFrameAt: staleTime,
            lastHeartbeatAt: staleTime,
            lastError: null,
          },
        })}
      />,
    );

    expect(await screen.findByAltText('機台周遭 雲端最新截圖')).toHaveAttribute('src', 'blob:factory-frame');
    expect(container).not.toHaveTextContent('停更');
    expect(container).not.toHaveTextContent('最後更新');
  });

  it('shows no overlay text when the platform has no uploaded frame', () => {
    const { container } = renderWithProviders(
      <CameraFeed
        entity={cameraFixture({
          attrs: {
            platformCameraId: 'factory-1',
            uploadedFrameCount: 0,
          },
        })}
      />,
    );

    expect(apiMock.fetchCameraLatestFrameBlob).not.toHaveBeenCalled();
    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent('無畫面');
  });
});
