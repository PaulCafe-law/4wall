import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { LoginPage } from './LoginPage'
import { createAuthValue, renderWithProviders } from '../../test/utils'

describe('LoginPage', () => {
  it('shows validation errors for invalid credentials input', async () => {
    const user = userEvent.setup()

    renderWithProviders(<LoginPage />, {
      route: '/login',
      auth: createAuthValue({ status: 'anonymous', session: null, user: null }),
    })

    await user.type(screen.getByLabelText('電子郵件'), 'invalid-email')
    await user.type(screen.getByLabelText('密碼'), '123')
    await user.click(screen.getByRole('button', { name: '登入工作區' }))

    expect(await screen.findByText('請輸入有效的電子郵件地址')).toBeInTheDocument()
    expect(await screen.findByText('密碼至少需要 8 個字元')).toBeInTheDocument()
  })

  it('shows self-serve and invite entry points', () => {
    renderWithProviders(<LoginPage />, {
      route: '/login',
      auth: createAuthValue({ status: 'anonymous', session: null, user: null }),
    })

    expect(screen.getByRole('link', { name: '建立新組織' })).toHaveAttribute('href', '/signup')
    expect(screen.getByRole('link', { name: '使用邀請連結開通' })).toHaveAttribute('href', '/invite')
  })
})
