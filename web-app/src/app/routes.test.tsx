import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'

import { RequireAuthenticated, RequireInternal } from './routes'
import { createAuthValue, renderWithProviders } from '../test/utils'

describe('route guards', () => {
  it('工作階段過期時會導回登入頁', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<div>登入頁</div>} />
        <Route element={<RequireAuthenticated />}>
          <Route path="/" element={<div>受保護內容</div>} />
        </Route>
      </Routes>,
      {
        auth: createAuthValue({ status: 'expired', session: null, user: null }),
      },
    )

    expect(await screen.findByText('登入頁')).toBeInTheDocument()
  })

  it('非內部角色會看到權限受限提示', async () => {
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

    expect(await screen.findByText('需要內部權限')).toBeInTheDocument()
  })
})
