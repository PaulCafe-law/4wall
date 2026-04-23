import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'

import { AppShell } from './shell'
import { createAuthValue, createSession, renderWithProviders } from '../test/utils'

describe('AppShell', () => {
  it('keeps the authenticated navigation in a vertical rail layout', () => {
    const { container } = renderWithProviders(
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/missions" element={<div>任務頁面</div>} />
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
    expect(nav).toHaveClass('flex', 'flex-col', 'items-start', 'gap-2')

    expect(screen.getByRole('link', { name: '總覽' })).toBeVisible()
    expect(screen.getByRole('link', { name: '場域' })).toBeVisible()
    expect(screen.getByRole('link', { name: '任務' })).toBeVisible()
    expect(screen.getByRole('link', { name: '帳務' })).toBeVisible()
    expect(screen.getByRole('link', { name: '即時營運' })).toBeVisible()
    expect(screen.getByRole('link', { name: '組織' })).toBeVisible()
    expect(screen.getByRole('link', { name: '稽核記錄' })).toBeVisible()
  })

  it('hides live ops from customer navigation', () => {
    renderWithProviders(
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/missions" element={<div>任務頁面</div>} />
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

    expect(screen.queryByRole('link', { name: '即時營運' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '支援工作台' })).not.toBeInTheDocument()
  })
})
