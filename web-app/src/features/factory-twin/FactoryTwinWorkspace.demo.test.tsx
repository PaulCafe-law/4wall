import '@testing-library/jest-dom/vitest';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const bridgeMock = vi.hoisted(() => vi.fn());

vi.mock('./mirror/three/FactoryScene', () => ({ FactoryScene: () => <div data-testid="scene" /> }));
vi.mock('./mirror/three/WorkOrderOverlay', () => ({
  WorkOrderOverlay: () => <div data-testid="work-order-overlay" />,
}));
vi.mock('./mirror/components/ChatPanel', () => ({
  ChatPanel: ({ sessionId }: { sessionId?: string }) => <div data-testid="chat-session">{sessionId}</div>,
}));
vi.mock('./mirror/components/AgentFeed', () => ({ AgentFeed: () => null }));
vi.mock('./mirror/components/DebugPanel', () => ({ DebugPanel: () => null }));
vi.mock('./mirror/components/DetailPanel', () => ({ DetailPanel: () => null }));
vi.mock('./mirror/components/SimControlPanel', () => ({
  SimControlPanel: ({ onScenarioChange }: { onScenarioChange?: (id: string) => void }) => (
    <button type="button" onClick={() => onScenarioChange?.('plan_gap')}>
      切換計畫落後
    </button>
  ),
}));
vi.mock('./mirror/components/warehouse/WarehouseSimulator', () => ({ WarehouseSimulator: () => null }));
vi.mock('./mirror/sim/simEngine', () => ({ useSimEngine: () => undefined }));
vi.mock('./mirror/hooks/useLocalAgent', () => ({ useLocalAgent: () => undefined }));
vi.mock('./mirror/hooks/useTwinAgentBridge', () => ({
  DEMO_TWIN_AGENT_SESSION_ID: 'demo-session-initial',
  useTwinAgentBridge: bridgeMock,
}));

import { FactoryTwinWorkspace } from './FactoryTwinWorkspace';
import type { CameraEntity } from './mirror/domain/entities';
import { useFactoryStore } from './mirror/store/factoryStore';

const authorizedCamera: CameraEntity = {
  id: 'camera-1',
  type: 'camera',
  name: '靚程授權攝影機',
  position: { x: 0, y: 1, z: 0 },
  status: 'active',
  source: 'live',
  siteLabel: '靚程工廠',
  online: true,
  samplingIntervalSeconds: 10,
  feedMode: 'snapshot',
};

beforeEach(() => {
  vi.clearAllMocks();
  useFactoryStore.setState(useFactoryStore.getInitialState(), true);
});

it('keeps the accelerator workspace labelled and rotates the assistant session on scenario reset', async () => {
  render(
    <FactoryTwinWorkspace
      platformCameras={[authorizedCamera]}
      livePersons={[]}
      demoPresentation
      liveDataStatus={{
        mode: 'simulation',
        cameraState: 'ready',
        cameraCount: 1,
        cameraLatestAt: new Date().toISOString(),
        personState: 'unavailable',
        personLatestAt: null,
      }}
    />,
  );

  expect(screen.getByText('4WALL 展示工廠')).toBeInTheDocument();
  expect(screen.getByText('模擬營運數據')).toBeInTheDocument();
  expect(screen.getByText('靚程授權影像 1/1 在線')).toBeInTheDocument();
  expect(screen.queryByTestId('work-order-overlay')).not.toBeInTheDocument();
  expect(screen.getByTestId('chat-session')).toHaveTextContent('demo-session-initial');
  expect(bridgeMock).toHaveBeenLastCalledWith(
    expect.objectContaining({ mode: 'simulation' }),
    expect.objectContaining({
      sessionId: 'demo-session-initial',
      snapshotScope: 'accelerator_demo',
      includeLiveEvidence: false,
      demoScenarioId: 'normal',
    }),
  );

  fireEvent.click(screen.getByRole('button', { name: '切換計畫落後' }));

  await waitFor(() => {
    const latestOptions = bridgeMock.mock.calls.at(-1)?.[1];
    expect(latestOptions.demoScenarioId).toBe('plan_gap');
    expect(latestOptions.sessionId).not.toBe('demo-session-initial');
  });
  expect(screen.getByTestId('chat-session')).not.toHaveTextContent('demo-session-initial');
  expect(useFactoryStore.getState().messages[0]?.text).toContain('模擬情境：計畫落後已載入');
});
