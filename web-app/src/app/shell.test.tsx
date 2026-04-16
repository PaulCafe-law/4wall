import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'

import { AppShell } from './shell'
import { createAuthValue, createSession, renderWithProviders } from '../test/utils'

describe('AppShell', () => {
  it('renders customer and internal navigation in separate vertical sections for internal users', () => {
    const { container } = renderWithProviders(
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<div>overview</div>} />
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

    expect(screen.getByRole('link', { name: 'Control Plane' })).toBeVisible()
    expect(screen.getAllByRole('link').length).toBeGreaterThanOrEqual(10)
  })

  it('shows customer navigation for customer users without internal links', () => {
    renderWithProviders(
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<div>overview</div>} />
        </Route>
      </Routes>,
      {
        route: '/',
        auth: createAuthValue({
          session: createSession({
            displayName: 'Customer User',
            email: 'customer@test.dev',
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

    expect(screen.getByRole('link', { name: 'Control Plane' })).toBeVisible()
    expect(screen.queryByRole('link', { name: '憌????' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '蝯?' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '?舀雿?' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '蝔賣閮?' })).not.toBeInTheDocument()
  })
})
