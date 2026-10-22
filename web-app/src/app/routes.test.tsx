import { render, screen, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { Outlet, Route, Routes } from 'react-router-dom'

import { AppRoutes, RequireAuthenticated, RequireInternal } from './routes'
import { AuthContext, type AuthContextValue } from '../lib/auth'
import { createAuthValue, renderWithProviders } from '../test/utils'

vi.mock('../lib/auth', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/auth')>()
  return { ...original, AuthProvider: ({ children }: PropsWithChildren) => children }
})
vi.mock('./shell', () => ({ AppShell: () => <Outlet /> }))
vi.mock('../features/overview/OverviewPage', () => ({ OverviewPage: () => <div>已登入首頁</div> }))
vi.mock('../features/factory-twin/FactoryTwinPage', () => ({
  FactoryTwinPage: () => <div>工廠營運首頁</div>,
  DemoFactoryPage: () => <div>工廠展示頁</div>,
}))
vi.mock('../features/auth/LineAccountLinkPage', () => ({
  LineAccountLinkPage: () => <div>LINE 帳號連結頁</div>,
}))

function renderApp(
  hostname: string,
  route = '/',
  auth: AuthContextValue = createAuthValue({ status: 'anonymous', session: null, user: null }),
) {
  window.history.replaceState({}, '', route)
  return render(
    <AuthContext.Provider value={auth}>
      <AppRoutes hostname={hostname} />
    </AuthContext.Provider>,
  )
}

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState({}, '', '/')
})

describe('platform root login', () => {
  it('renders the actual login form at the canonical root without navigating to /login', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState')
    const pushState = vi.spyOn(window.history, 'pushState')

    renderApp('platform.4wall.io')

    expect(await screen.findByRole('heading', { name: /^登入$/ })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '帳號或電子郵件' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/')
    for (const [, , url] of [...replaceState.mock.calls, ...pushState.mock.calls]) {
      expect(new URL(String(url ?? '/'), window.location.origin).pathname).not.toBe('/login')
    }
  })

  it('aliases client-side /login navigation to the root while preserving query and fragment', async () => {
    renderApp('platform.4wall.io', '/login?expired=1&lineLink=1#flow=a%2Fb')

    expect(await screen.findByRole('heading', { name: /^登入$/ })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/')
    expect(window.location.search).toBe('?expired=1&lineLink=1')
    expect(window.location.hash).toBe('#flow=a%2Fb')
    expect(screen.getByText('你的工作階段已過期，請重新登入以恢復權限。')).toBeInTheDocument()
  })

  it('keeps session restoration at the root without exposing protected content', () => {
    renderApp('platform.4wall.io', '/', createAuthValue({ status: 'restoring', session: null, user: null }))

    expect(screen.getByText('正在恢復登入狀態')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^登入$/ })).not.toBeInTheDocument()
    expect(screen.queryByText('已登入首頁')).not.toBeInTheDocument()
    expect(window.location.pathname).toBe('/')
  })

  it('shows an expired session at the root without changing the URL', async () => {
    renderApp('platform.4wall.io', '/', createAuthValue({ status: 'expired', session: null, user: null }))

    expect(await screen.findByText('你的工作階段已過期，請重新登入以恢復權限。')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/')
  })

  it('preserves the existing authenticated dashboard destination', async () => {
    renderApp('platform.4wall.io', '/', createAuthValue())

    expect(await screen.findByText('已登入首頁')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/overview')
  })

  it('preserves the factory customer home destination', async () => {
    const auth = createAuthValue()
    auth.user = {
      ...auth.user!,
      memberships: [{
        membershipId: 'factory-membership', organizationId: 'factory-organization',
        productMode: 'factory_ops', role: 'customer_viewer', isActive: true,
      }],
    }
    renderApp('platform.4wall.io', '/', auth)

    expect(await screen.findByText('工廠營運首頁')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/factory-twin')
  })

  it('preserves the authenticated LINE login continuation', async () => {
    renderApp('platform.4wall.io', '/login?lineLink=1', createAuthValue())

    expect(await screen.findByText('LINE 帳號連結頁')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/line/link')
  })

  it.each(['localhost', 'four-wall-web-staging.onrender.com'])(
    'keeps the anonymous root redirect on %s',
    async (hostname) => {
      renderApp(hostname)

      expect(await screen.findByRole('heading', { name: /^登入$/ })).toBeInTheDocument()
      await waitFor(() => expect(window.location.pathname).toBe('/login'))
    },
  )

  it.each(['localhost', 'four-wall-web-staging.onrender.com'])(
    'keeps /login as the login address on %s',
    async (hostname) => {
      renderApp(hostname, '/login?expired=1')

      expect(await screen.findByRole('heading', { name: /^登入$/ })).toBeInTheDocument()
      expect(window.location.pathname).toBe('/login')
      expect(window.location.search).toBe('?expired=1')
    },
  )
})

describe('route guards', () => {
  it('expired session redirects back to login', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<div>登入頁</div>} />
        <Route element={<RequireAuthenticated />}>
          <Route path="/" element={<div>受保護頁面</div>} />
        </Route>
      </Routes>,
      {
        auth: createAuthValue({ status: 'expired', session: null, user: null }),
      },
    )

    expect(await screen.findByText('登入頁')).toBeInTheDocument()
  })

  it('non-internal users cannot open internal routes', async () => {
    const baseAuth = createAuthValue()

    renderWithProviders(
      <Routes>
        <Route
          path="/"
          element={
            <RequireInternal>
              <div>內部頁面</div>
            </RequireInternal>
          }
        />
      </Routes>,
      {
        auth: createAuthValue({
          ...baseAuth,
          user: {
            ...baseAuth.user!,
            globalRoles: [],
          },
          isInternal: false,
        }),
      },
    )

    expect(await screen.findByText('這個頁面僅提供 internal 使用')).toBeInTheDocument()
  })
})
