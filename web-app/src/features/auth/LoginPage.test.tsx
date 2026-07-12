import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes, useLocation } from 'react-router-dom'

import { LoginPage } from './LoginPage'
import { createAuthValue, renderWithProviders } from '../../test/utils'

describe('LoginPage', () => {
  it('顯示繁中驗證錯誤訊息', async () => {
    const user = userEvent.setup()

    renderWithProviders(<LoginPage />, {
      route: '/login',
      auth: createAuthValue({ status: 'anonymous', session: null, user: null }),
    })

    await user.type(screen.getByLabelText('帳號或電子郵件'), 'ab')
    await user.type(screen.getByLabelText('密碼'), '123')
    await user.click(screen.getByRole('button', { name: '進入主控台' }))

    expect(await screen.findByText('請輸入帳號或電子郵件')).toBeInTheDocument()
    expect(await screen.findByText('密碼至少需要 8 個字元')).toBeInTheDocument()
  })

  it('LINE 連結登入成功後只回到固定連結頁', async () => {
    const user = userEvent.setup()
    const auth = createAuthValue({ status: 'anonymous', session: null, user: null })

    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/line/link" element={<CurrentLocation />} />
      </Routes>,
      {
        route: '/login?lineLink=1&returnTo=https://evil.example',
        auth,
      },
    )

    await user.type(screen.getByLabelText('帳號或電子郵件'), 'operator@example.com')
    await user.type(screen.getByLabelText('密碼'), 'Password123!')
    await user.click(screen.getByRole('button', { name: '進入主控台' }))

    expect(auth.login).toHaveBeenCalledWith({
      email: 'operator@example.com',
      password: 'Password123!',
    })
    expect(await screen.findByTestId('current-location')).toHaveTextContent('/line/link')
  })

  it('不接受其他 query 參數作為登入後導向', async () => {
    const user = userEvent.setup()
    const auth = createAuthValue({ status: 'anonymous', session: null, user: null })

    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/overview" element={<CurrentLocation />} />
      </Routes>,
      {
        route: '/login?returnTo=https://evil.example&lineLink=0',
        auth,
      },
    )

    await user.type(screen.getByLabelText('帳號或電子郵件'), 'operator@example.com')
    await user.type(screen.getByLabelText('密碼'), 'Password123!')
    await user.click(screen.getByRole('button', { name: '進入主控台' }))

    expect(await screen.findByTestId('current-location')).toHaveTextContent('/overview')
  })
})

function CurrentLocation() {
  const location = useLocation()
  return <div data-testid="current-location">{location.pathname + location.search}</div>
}
