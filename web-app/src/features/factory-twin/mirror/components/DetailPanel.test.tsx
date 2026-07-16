import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import type { DeviceEntity, Entity, PersonEntity } from '../domain/entities';
import { useFactoryStore } from '../store/factoryStore';
import { DetailPanel } from './DetailPanel';

const livePerson: PersonEntity = {
  id: 'live-person',
  type: 'person',
  name: '現場人員',
  role: 'anonymous-presence',
  position: { x: 1.25, y: 0.05, z: -3.5 },
  status: 'on-duty',
  source: 'live',
  attrs: { cameraLabel: '儀表板', confidence: 0.92 },
};

const openBmcDevice: DeviceEntity = {
  id: 'device-openbmc-pi5',
  type: 'device',
  deviceKind: 'openbmc_pi5',
  name: 'Pi5 / OpenBMC 節點',
  position: { x: 2.8, y: 0, z: -0.8 },
  status: 'live',
  source: 'live',
};

beforeEach(() => {
  useFactoryStore.setState(useFactoryStore.getInitialState(), true);
  const entities: Record<string, Entity> = { [livePerson.id]: livePerson };
  useFactoryStore.getState().setEntities(entities);
  useFactoryStore.getState().select(livePerson.id);
});

it('routes live person entities to the read-only detail panel', () => {
  render(<DetailPanel />);

  expect(screen.getByText('現場匿名人員')).toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});

it('shows OpenBMC detail only when the scene device is selected', () => {
  useFactoryStore.getState().setEntities({
    [livePerson.id]: livePerson,
    [openBmcDevice.id]: openBmcDevice,
  });
  useFactoryStore.getState().select(openBmcDevice.id);

  const { rerender } = render(
    <DetailPanel openBmcDetail={<div>OpenBMC 即時詳細資訊</div>} />,
  );

  expect(screen.getByText('OpenBMC 即時詳細資訊')).toBeInTheDocument();

  useFactoryStore.getState().select(livePerson.id);
  rerender(<DetailPanel openBmcDetail={<div>OpenBMC 即時詳細資訊</div>} />);

  expect(screen.queryByText('OpenBMC 即時詳細資訊')).not.toBeInTheDocument();
  expect(screen.getByText('現場匿名人員')).toBeInTheDocument();
});
