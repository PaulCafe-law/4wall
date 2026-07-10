import '@testing-library/jest-dom/vitest';

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { useFactoryStore } from '../store/factoryStore';
import { AgentFeed } from './AgentFeed';

beforeEach(() => {
  useFactoryStore.setState(useFactoryStore.getInitialState(), true);
});

it('starts minimized when the demo needs the 3D entry to remain clickable', () => {
  const { container } = render(<AgentFeed initiallyMinimized />);

  expect(container.querySelector('.agent-feed.minimized')).toBeInTheDocument();

  fireEvent.pointerDown(screen.getByRole('button'));
  expect(container.querySelector('.agent-feed.minimized')).not.toBeInTheDocument();
});
