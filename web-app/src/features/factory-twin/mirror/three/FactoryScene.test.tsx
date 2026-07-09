import '@testing-library/jest-dom/vitest';

import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { useFactoryStore } from '../store/factoryStore';
import { FactoryScene } from './FactoryScene';

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children, onCreated }: { children: ReactNode; onCreated?: (state: { camera: { lookAt: () => void } }) => void }) => {
    onCreated?.({ camera: { lookAt: vi.fn() } });
    return <div data-testid="factory-canvas">{children}</div>;
  },
}));

vi.mock('@react-three/drei', () => ({
  ContactShadows: () => null,
  Html: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  OrbitControls: ({ enabled }: { enabled?: boolean }) => (
    <div data-testid="orbit-controls" data-enabled={String(enabled)} />
  ),
}));

vi.mock('./FactoryModel', () => ({ FactoryModel: () => null }));
vi.mock('./EntityMarker', () => ({ EntityMarker: () => null }));
vi.mock('./LinkLines', () => ({ LinkLines: () => null }));
vi.mock('./CameraRig', () => ({ CameraRig: () => null }));
vi.mock('./MeshHighlighter', () => ({ MeshHighlighter: () => null }));
vi.mock('./FitToGlb', () => ({ FitToGlb: () => null }));
vi.mock('./CoordProbe', () => ({ CoordProbe: () => null }));
vi.mock('./CalloutOverlay', () => ({ CalloutOverlay: () => null }));

beforeEach(() => {
  useFactoryStore.setState(useFactoryStore.getInitialState(), true);
});

it('keeps orbit controls enabled during normal viewing', () => {
  render(<FactoryScene />);

  expect(screen.getByTestId('orbit-controls')).toHaveAttribute('data-enabled', 'true');
});

it('disables orbit controls while dragging the HC600-01 live person anchor', () => {
  useFactoryStore.getState().setLivePersonAnchorDragging(true);

  render(<FactoryScene />);

  expect(screen.getByTestId('orbit-controls')).toHaveAttribute('data-enabled', 'false');
});
