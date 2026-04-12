import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'

import { RequireAuthenticated, RequireInternal } from './routes'
import { createAuthValue, renderWithProviders } from '../test/utils'

describe('route guards', () => {
  it('redirects expired sessions back to login', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<div>登入頁</div>} />
        <Route element={<RequireAuthenticated />}>
          <Route path="/" element={<div>已登入內容</div>} />
        </Route>
      </Routes>,
      {
        auth: createAuthValue({ status: 'expired', session: null, user: null }),
      },
    )

    expect(await screen.findByText('登入頁')).toBeInTheDocument()
  })

  it('blocks non-internal users from internal-only pages', async () => {
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
          user: createAuthValue().user && {
            ...createAuthValue().user!,
            globalRoles: [],
          },
          isInternal: false,
        }),
      },
    )

    expect(await screen.findByText('你目前沒有這個頁面的權限')).toBeInTheDocument()
  })
})
