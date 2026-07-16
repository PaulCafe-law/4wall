import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import type { DeviceEntity } from '../domain/entities';
import { useFactoryStore } from '../store/factoryStore';
import { EntityMarker } from './EntityMarker';

vi.mock('@react-three/fiber', () => ({
  useFrame: () => undefined,
}));

vi.mock('@react-three/drei', () => ({
  Html: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('./AmrModel', () => ({
  AmrVisual: () => null,
}));

vi.mock('./SensorRings', () => ({
  AlertPulseRing: () => null,
  AmrSensorRings: () => null,
  GroundRing: () => null,
}));

const openBmcEntity: DeviceEntity = {
  id: 'device-openbmc-pi5',
  type: 'device',
  deviceKind: 'openbmc_pi5',
  name: 'Pi5 / OpenBMC 節點',
  position: { x: 2.8, y: 0, z: -0.8 },
  status: 'stale',
  source: 'live',
};

beforeEach(() => {
  useFactoryStore.setState(useFactoryStore.getInitialState(), true);
  useFactoryStore.getState().setEntities({ [openBmcEntity.id]: openBmcEntity });
});

it('provides a keyboard-accessible scene control for the OpenBMC device', async () => {
  const user = userEvent.setup();
  useFactoryStore.getState().toggleRight();
  render(<EntityMarker entity={openBmcEntity} />);

  expect(screen.getByText('Pi5 / OpenBMC 節點')).toBeInTheDocument();
  expect(screen.getByText('STALE')).toBeInTheDocument();

  const control = screen.getByRole('button', { name: '查看 Pi5 OpenBMC 資訊' });
  await user.tab();
  expect(control).toHaveFocus();

  await user.keyboard('{Enter}');

  expect(useFactoryStore.getState().selectedId).toBe(openBmcEntity.id);
  expect(useFactoryStore.getState().rightOpen).toBe(true);
});

it('opens the OpenBMC detail rail with the Space key', async () => {
  const user = userEvent.setup();
  useFactoryStore.getState().toggleRight();
  render(<EntityMarker entity={openBmcEntity} />);

  const control = screen.getByRole('button', { name: '查看 Pi5 OpenBMC 資訊' });
  control.focus();
  await user.keyboard(' ');

  expect(useFactoryStore.getState().selectedId).toBe(openBmcEntity.id);
  expect(useFactoryStore.getState().rightOpen).toBe(true);
});
