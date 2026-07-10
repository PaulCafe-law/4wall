import '@testing-library/jest-dom/vitest';

import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('@react-three/drei', () => ({
  Html: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { WarehousePortal } from './WarehousePortal';

it('activates the portal through the standard button click event', () => {
  const onActivate = vi.fn();
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  try {
    render(<WarehousePortal onActivate={onActivate} />);
    fireEvent.click(screen.getByRole('button'));

    expect(onActivate).toHaveBeenCalledTimes(1);
  } finally {
    consoleError.mockRestore();
  }
});
