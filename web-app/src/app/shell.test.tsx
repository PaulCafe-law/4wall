import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'

import { AppShell } from './shell'
import { createAuthValue, createSession, renderWithProviders } from '../test/utils'

describe('AppShell', () => {
  beforeEach(() => {
    window.localStorage.removeItem('fw.sidebar-collapsed')
  })
  it('keeps the authenticated navigation responsive', () => {
    const { container } = renderWithProviders(
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/missions" element={<div>任務工作區</div>} />
        </Route>
      </Routes>,
      {
        route: '/missions',
        auth: createAuthValue({
          session: createSession({
            displayName: 'Production Platform Admin',
            email: 'platform@prod.internal.test',
            globalRoles: ['platform_admin'],
          }),
          isInternal: true,
        }),
      },
    )

    const nav = container.querySelector('nav')
    expect(nav).not.toBeNull()
    expect(nav).toHaveClass('flex', 'gap-2', 'overflow-x-auto', 'md:flex-col', 'md:items-start')

    expect(screen.getByRole('link', { name: '總覽' })).toBeVisible()
    expect(screen.getByRole('link', { name: '場域' })).toBeVisible()
    expect(screen.getByRole('link', { name: '場域地圖' })).toBeVisible()
    expect(screen.getByRole('link', { name: '任務' })).toBeVisible()
    expect(screen.getByRole('link', { name: '帳務' })).toBeVisible()
    expect(screen.getByRole('link', { name: '控制平面' })).toBeVisible()
    expect(screen.getByRole('link', { name: '即時營運' })).toBeVisible()
    expect(screen.getByRole('link', { name: '組織' })).toBeVisible()
    expect(screen.getByRole('link', { name: '支援工作台' })).toBeVisible()
    expect(screen.getByRole('link', { name: '稽核紀錄' })).toBeVisible()
  })

  it('hides internal navigation from customer users', () => {
    renderWithProviders(
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/missions" element={<div>任務工作區</div>} />
        </Route>
      </Routes>,
      {
        route: '/missions',
        auth: createAuthValue({
          session: createSession({
            displayName: 'Customer Admin',
            email: 'admin@customer.test',
            memberships: [
              {
                membershipId: 'membership-1',
                organizationId: 'org-001',
                role: 'customer_admin',
                isActive: true,
              },
            ],
          }),
          isInternal: false,
        }),
      },
    )

    expect(screen.queryByRole('link', { name: '控制平面' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '即時營運' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '支援工作台' })).not.toBeInTheDocument()
  })

  it('shows a factory customer only live factory navigation', () => {
    renderWithProviders(
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/factory-twin" element={<div>靚程現場</div>} />
        </Route>
      </Routes>,
      {
        route: '/factory-twin',
        auth: createAuthValue({
          session: createSession({
            displayName: '靚程測試帳號',
            memberships: [
              {
                membershipId: 'jingcheng-membership',
                organizationId: 'jingcheng-org',
                organizationName: '靚程企業',
                organizationSlug: 'jingcheng',
                productMode: 'factory_ops',
                role: 'customer_viewer',
                isActive: true,
              },
            ],
          }),
          isInternal: false,
        }),
      },
    )

    expect(screen.getByRole('link', { name: '工廠戰情室' })).toBeVisible()
    expect(screen.getByRole('link', { name: '即時攝影機' })).toBeVisible()
    expect(screen.queryByRole('link', { name: '倉儲模擬' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '任務' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '資料引擎' })).not.toBeInTheDocument()
  })

  it('collapses the sidebar into a narrow rail and persists the choice in localStorage', async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/missions" element={<div>任務工作區</div>} />
        </Route>
      </Routes>,
      { route: '/missions' },
    )

    expect(screen.getByRole('link', { name: '總覽' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: '收合側欄' }))

    expect(screen.queryByRole('link', { name: '總覽' })).not.toBeInTheDocument()
    expect(screen.queryByText('目前帳號')).not.toBeInTheDocument()
    expect(window.localStorage.getItem('fw.sidebar-collapsed')).toBe('1')
    // 主內容區仍在，寬度由 grid 欄位自動補滿。
    expect(screen.getByText('任務工作區')).toBeVisible()

    await user.click(screen.getByRole('button', { name: '展開側欄' }))

    expect(screen.getByRole('link', { name: '總覽' })).toBeVisible()
    expect(window.localStorage.getItem('fw.sidebar-collapsed')).toBeNull()
  })

  it('restores the collapsed sidebar from localStorage on mount', () => {
    window.localStorage.setItem('fw.sidebar-collapsed', '1')

    renderWithProviders(
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/missions" element={<div>任務工作區</div>} />
        </Route>
      </Routes>,
      { route: '/missions' },
    )

    expect(screen.queryByRole('link', { name: '總覽' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '展開側欄' })).toBeVisible()
  })
})
