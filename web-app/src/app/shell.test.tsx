import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'

import { AppShell } from './shell'
import { createAuthValue, createSession, renderWithProviders } from '../test/utils'

describe('AppShell', () => {
  it('renders customer and internal navigation in separate vertical sections for internal users', () => {
    const { container } = renderWithProviders(
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<div>總覽內容</div>} />
        </Route>
      </Routes>,
      {
        route: '/',
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

    const navs = container.querySelectorAll('nav')
    expect(navs).toHaveLength(2)
    for (const nav of navs) {
      expect(nav).toHaveClass('flex', 'flex-col', 'items-start', 'gap-2')
    }

    expect(screen.getByRole('link', { name: '總覽' })).toBeVisible()
    expect(screen.getByRole('link', { name: '場址' })).toBeVisible()
    expect(screen.getByRole('link', { name: '任務' })).toBeVisible()
    expect(screen.getByRole('link', { name: '帳務' })).toBeVisible()
    expect(screen.getByRole('link', { name: '團隊' })).toBeVisible()
    expect(screen.getByRole('link', { name: '組織' })).toBeVisible()
    expect(screen.getByRole('link', { name: '支援佇列' })).toBeVisible()
    expect(screen.getByRole('link', { name: '稽核記錄' })).toBeVisible()
  })

  it('hides internal navigation for customer users', () => {
    renderWithProviders(
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<div>總覽內容</div>} />
        </Route>
      </Routes>,
      {
        route: '/',
        auth: createAuthValue({
          session: createSession({
            displayName: 'Customer User',
            email: 'customer@test.dev',
            globalRoles: [],
            memberships: [
              {
                membershipId: 'membership-1',
                organizationId: 'org-1',
                role: 'customer_admin',
                isActive: true,
              },
            ],
          }),
          isInternal: false,
        }),
      },
    )

    expect(screen.getByRole('link', { name: '總覽' })).toBeVisible()
    expect(screen.queryByRole('link', { name: '組織' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '支援佇列' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '稽核記錄' })).not.toBeInTheDocument()
  })
})
