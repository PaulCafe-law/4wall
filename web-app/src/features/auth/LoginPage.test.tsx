import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { LoginPage } from './LoginPage'
import { createAuthValue, renderWithProviders } from '../../test/utils'

describe('LoginPage', () => {
  it('validates email and password before submit', async () => {
    const user = userEvent.setup()

    renderWithProviders(<LoginPage />, {
      route: '/login',
      auth: createAuthValue({ status: 'anonymous', session: null, user: null }),
    })

    await user.type(screen.getByLabelText('Email'), 'invalid-email')
    await user.type(screen.getByLabelText('Password'), '123')
    await user.click(screen.getByRole('button', { name: 'Enter Console' }))

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument()
  })
})
