import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { PropsWithChildren, ReactNode } from 'react'
import { vi } from 'vitest'

import { AuthContext, type AuthContextValue } from '../lib/auth'
import type { SessionUser, WebSession } from '../lib/types'

export function createSession(user?: Partial<SessionUser>): WebSession {
  return {
    accessToken: 'test-token',
    tokenType: 'bearer',
    expiresInSeconds: 900,
    user: {
      userId: 'user-1',
      email: 'user@test.dev',
      displayName: 'Test User',
      globalRoles: [],
      memberships: [],
      ...user,
    },
  }
}

export function createAuthValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  const session = overrides.session ?? createSession()
  const user = overrides.user ?? session.user

  return {
    status: 'authenticated',
    session,
    user,
    isInternal: Boolean(user?.globalRoles.some((role) => role === 'platform_admin' || role === 'ops')),
    globalRoles: user?.globalRoles ?? [],
    login: vi.fn(async () => {}),
    signup: vi.fn(async () => {}),
    acceptInvite: vi.fn(async () => {}),
    logout: vi.fn(async () => {}),
    markExpired: vi.fn(),
    canReadOrganization: vi.fn(() => true),
    canWriteOrganization: vi.fn(() => true),
    ...overrides,
  }
}

export function renderWithProviders(
  ui: ReactNode,
  {
    route = '/',
    auth = createAuthValue(),
  }: {
    route?: string
    auth?: AuthContextValue
  } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={auth}>
          <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>
    )
  }

  return render(ui, { wrapper: Wrapper })
}
