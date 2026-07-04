import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import type { PersonEntity } from '../../domain/entities';
import { LivePersonDetail } from './LivePersonDetail';

it('renders live person metadata without chat controls', () => {
  const entity: PersonEntity = {
    id: 'live-person',
    type: 'person',
    name: '現場人員',
    role: 'anonymous-presence',
    position: { x: 1.25, y: 0.05, z: -3.5 },
    status: 'on-duty',
    source: 'live',
    attrs: {
      cameraLabel: '儀表板',
      confidence: 0.92,
      capturedAt: '2026-07-04T10:00:00+08:00',
      frameId: 'frame-1',
      calibrationId: 'cal-1',
      detectorName: 'fake-person',
    },
  };

  render(<LivePersonDetail entity={entity} />);

  expect(screen.getByText('現場匿名人員')).toBeInTheDocument();
  expect(screen.getByText('儀表板')).toBeInTheDocument();
  expect(screen.getByText('92%')).toBeInTheDocument();
  expect(screen.getByText('frame-1')).toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
