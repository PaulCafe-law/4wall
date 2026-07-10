import '@testing-library/jest-dom/vitest';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const bridgeMock = vi.hoisted(() => vi.fn());
const warehouseSceneMock = vi.hoisted(() => ({ fail: false }));

vi.mock('./mirror/three/FactoryScene', () => ({
  FactoryScene: ({ onEnterWarehouse }: { onEnterWarehouse?: () => void }) => (
    <div data-testid="scene">
      {onEnterWarehouse ? <button type="button" onClick={onEnterWarehouse}>進入倉儲</button> : null}
    </div>
  ),
}));
vi.mock('./mirror/three/WarehouseDecisionScene', () => ({
  default: () => {
    if (warehouseSceneMock.fail) throw new Error('warehouse scene failed');
    return <div data-testid="warehouse-scene" />;
  },
}));
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
vi.mock('./mirror/components/warehouse/WarehouseDecisionControls', () => ({ WarehouseDecisionControls: () => null }));
vi.mock('./mirror/components/warehouse/WarehouseDecisionInspector', () => ({ WarehouseDecisionInspector: () => null }));
vi.mock('./mirror/sim/simEngine', () => ({ useSimEngine: () => undefined }));
vi.mock('./mirror/hooks/useLocalAgent', () => ({ useLocalAgent: () => undefined }));
vi.mock('./mirror/hooks/useTwinAgentBridge', () => ({
  DEMO_TWIN_AGENT_SESSION_ID: 'demo-session-initial',
  useTwinAgentBridge: bridgeMock,
}));

import { FactoryTwinWorkspace } from './FactoryTwinWorkspace';
import type { CameraEntity } from './mirror/domain/entities';
import { useFactoryStore } from './mirror/store/factoryStore';
import { useWarehouseDemoStore } from './mirror/store/warehouseDemoStore';

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
  warehouseSceneMock.fail = false;
  useFactoryStore.setState(useFactoryStore.getInitialState(), true);
  useWarehouseDemoStore.getState().disable();
});

it('keeps a return path when the warehouse scene fails to render', async () => {
  warehouseSceneMock.fail = true;
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  render(<FactoryTwinWorkspace platformCameras={[]} livePersons={[]} demoPresentation />);

  fireEvent.click(screen.getByRole('button', { name: '進入倉儲' }));
  expect(useFactoryStore.getState().leftOpen).toBe(false);
  act(() => useWarehouseDemoStore.getState().completeTransition());

  expect(await screen.findByRole('alert')).toHaveTextContent('3D 智慧倉儲暫時無法載入');
  fireEvent.click(screen.getByRole('button', { name: '← 返回成型工廠' }));
  expect(useFactoryStore.getState().leftOpen).toBe(true);
  act(() => useWarehouseDemoStore.getState().completeTransition());
  expect(screen.getByTestId('scene')).toBeInTheDocument();
  consoleError.mockRestore();
});

it('does not expose or initialize the warehouse portal for the customer workspace', () => {
  render(
    <FactoryTwinWorkspace
      platformCameras={[authorizedCamera]}
      livePersons={[]}
      liveOnly
    />,
  );

  expect(screen.queryByRole('button', { name: '進入倉儲' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '立即進入智慧倉儲模擬區' })).not.toBeInTheDocument();
  expect(useWarehouseDemoStore.getState().enabled).toBe(false);
  expect(useWarehouseDemoStore.getState().planSet).toBeNull();
});

it('keeps a warehouse entry available while the factory model is loading', () => {
  render(<FactoryTwinWorkspace platformCameras={[]} livePersons={[]} demoPresentation />);

  fireEvent.click(screen.getByRole('button', { name: '立即進入智慧倉儲模擬區' }));

  expect(useWarehouseDemoStore.getState().transition).toBe('to_warehouse');
});

it('enters the isolated warehouse space through the in-scene portal', async () => {
  render(
    <FactoryTwinWorkspace
      platformCameras={[]}
      livePersons={[]}
      demoPresentation
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: '進入倉儲' }));
  expect(screen.getByText('前往智慧倉儲區')).toBeInTheDocument();
  expect(useFactoryStore.getState().leftOpen).toBe(false);

  act(() => useWarehouseDemoStore.getState().completeTransition());

  expect(await screen.findByTestId('warehouse-scene')).toBeInTheDocument();
  expect(useWarehouseDemoStore.getState().space).toBe('warehouse');

  act(() => useWarehouseDemoStore.getState().beginTransition('factory'));
  expect(useFactoryStore.getState().leftOpen).toBe(true);
});

it('keeps the assistant open when entering the warehouse on a projection viewport', () => {
  const originalWidth = window.innerWidth;
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1920 });

  try {
    render(<FactoryTwinWorkspace platformCameras={[]} livePersons={[]} demoPresentation />);
    fireEvent.click(screen.getByRole('button', { name: '進入倉儲' }));
    expect(useFactoryStore.getState().leftOpen).toBe(true);
  } finally {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
  }
});

it('uses the compact warehouse layout when an agent action starts the transition', () => {
  render(<FactoryTwinWorkspace platformCameras={[]} livePersons={[]} demoPresentation />);

  act(() => useWarehouseDemoStore.getState().beginTransition('warehouse'));

  expect(useFactoryStore.getState().leftOpen).toBe(false);
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
