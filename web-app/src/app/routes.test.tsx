import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'

import { RequireAuthenticated, RequireInternal } from './routes'
import { createAuthValue, renderWithProviders } from '../test/utils'

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
