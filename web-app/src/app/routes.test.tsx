import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'

import { RequireAuthenticated, RequireInternal } from './routes'
import { createAuthValue, renderWithProviders } from '../test/utils'

describe('route guards', () => {
  it('redirects expired sessions back to login', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<div>Login screen</div>} />
        <Route element={<RequireAuthenticated />}>
          <Route path="/" element={<div>Protected content</div>} />
        </Route>
      </Routes>,
      {
        auth: createAuthValue({ status: 'expired', session: null, user: null }),
      },
    )

    expect(await screen.findByText('Login screen')).toBeInTheDocument()
  })

  it('blocks non-internal roles from internal routes', async () => {
    renderWithProviders(
      <Routes>
        <Route
          path="/"
          element={
            <RequireInternal>
              <div>Internal destination</div>
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

    expect(await screen.findByText('Internal access required')).toBeInTheDocument()
  })
})
