import '@testing-library/jest-dom/vitest';

import { render } from '@testing-library/react';
import { vi } from 'vitest';

// 這些子元件會拉進 R3F Canvas / sim / agent，jsdom 下無法（也不需要）渲染，
// 全部替換成輕量占位，只留下 .col-center 容器上的 wheel 監聽行為受測。
vi.mock('./mirror/three/FactoryScene', () => ({ FactoryScene: () => <div data-testid="scene" /> }));
vi.mock('./mirror/three/WorkOrderOverlay', () => ({ WorkOrderOverlay: () => null }));
vi.mock('./mirror/components/ChatPanel', () => ({ ChatPanel: () => <div /> }));
vi.mock('./mirror/components/AgentFeed', () => ({ AgentFeed: () => <div /> }));
vi.mock('./mirror/components/DebugPanel', () => ({ DebugPanel: () => <div /> }));
vi.mock('./mirror/components/DetailPanel', () => ({ DetailPanel: () => <div /> }));
vi.mock('./mirror/components/SimControlPanel', () => ({ SimControlPanel: () => <div /> }));
vi.mock('./mirror/components/warehouse/WarehouseSimulator', () => ({
  WarehouseSimulator: () => <div />,
}));
vi.mock('./mirror/sim/simEngine', () => ({ useSimEngine: () => undefined }));
vi.mock('./mirror/hooks/useLocalAgent', () => ({ useLocalAgent: () => undefined }));
vi.mock('./mirror/hooks/useTwinAgentBridge', () => ({ useTwinAgentBridge: () => undefined }));

import { FactoryTwinWorkspace } from './FactoryTwinWorkspace';

it('attaches a non-passive wheel listener on the 3D container that prevents page scroll', () => {
  const { container } = render(<FactoryTwinWorkspace platformCameras={[]} livePersons={[]} />);

  const center = container.querySelector('.col-center');
  expect(center).not.toBeNull();

  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120 });
  const preventDefault = vi.spyOn(event, 'preventDefault');

  center!.dispatchEvent(event);

  expect(preventDefault).toHaveBeenCalled();
});

it('removes the wheel listener on unmount', () => {
  const { container, unmount } = render(
    <FactoryTwinWorkspace platformCameras={[]} livePersons={[]} />,
  );
  const center = container.querySelector('.col-center') as HTMLElement;
  const removeSpy = vi.spyOn(center, 'removeEventListener');

  unmount();

  expect(removeSpy).toHaveBeenCalledWith('wheel', expect.any(Function));
});
