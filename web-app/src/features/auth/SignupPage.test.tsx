import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

import { SignupPage } from './SignupPage'
import { createAuthValue, renderWithProviders } from '../../test/utils'

describe('SignupPage', () => {
  it('shows validation errors for invalid signup input', async () => {
    const user = userEvent.setup()

    renderWithProviders(<SignupPage />, {
      route: '/signup',
      auth: createAuthValue({ status: 'anonymous', session: null, user: null }),
    })

    await user.type(screen.getByLabelText('電子郵件'), 'invalid-email')
    await user.type(screen.getByLabelText('密碼'), '123')
    await user.type(screen.getByPlaceholderText('acme-builders'), 'Bad Slug')
    await user.click(screen.getByRole('button', { name: '建立組織並登入' }))

    expect(await screen.findByText('請輸入你的姓名')).toBeInTheDocument()
    expect(await screen.findByText('請輸入有效的電子郵件地址')).toBeInTheDocument()
    expect(await screen.findByText('密碼至少需要 8 個字元')).toBeInTheDocument()
    expect(await screen.findByText('組織網址代號只能使用小寫英數與連字號')).toBeInTheDocument()
  })

  it('submits normalized signup payload', async () => {
    const user = userEvent.setup()
    const signup = vi.fn(async () => {})

    renderWithProviders(<SignupPage />, {
      route: '/signup',
      auth: createAuthValue({ status: 'anonymous', session: null, user: null, signup }),
    })

    await user.type(screen.getByLabelText('你的姓名'), 'Builder Founder')
    await user.type(screen.getByLabelText('電子郵件'), 'Founder@Builder.Test')
    await user.type(screen.getByLabelText('組織名稱'), 'Builder Co')
    await user.type(screen.getByPlaceholderText('acme-builders'), 'builder-co')
    await user.type(screen.getByLabelText('密碼'), 'Password123!')
    await user.click(screen.getByRole('button', { name: '建立組織並登入' }))

    expect(signup).toHaveBeenCalledWith({
      displayName: 'Builder Founder',
      email: 'founder@builder.test',
      organizationName: 'Builder Co',
      organizationSlug: 'builder-co',
      password: 'Password123!',
    })
  })
})
