import { screen, waitFor } from '@testing-library/react'
import { QueryClient } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { Route, Routes, useLocation } from 'react-router-dom'
import { vi } from 'vitest'

import { LineAccountLinkPage } from './LineAccountLinkPage'
import { ApiError, isAllowedLineAccountLinkRedirectUrl } from '../../lib/api'
import type { LineAccountLinkSite } from '../../lib/types'
import { createAuthValue, renderWithProviders } from '../../test/utils'

const FLOW_STORAGE_KEY = 'fw.line-account-link.flow'
const API_ORIGIN = 'https://api.example.test'
const VALID_REDIRECT_URL = `${API_ORIGIN}/v1/line/account-links/redirect/redirect-handle-123`

const apiMock = vi.hoisted(() => ({
  listLineAccountLinkSites: vi.fn(),
  completeLineAccountLink: vi.fn(),
}))

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  return {
    ...actual,
    api: {
      ...actual.api,
      listLineAccountLinkSites: apiMock.listLineAccountLinkSites,
      completeLineAccountLink: apiMock.completeLineAccountLink,
    },
  }
})

describe('LineAccountLinkPage', () => {
  beforeEach(() => {
    apiMock.listLineAccountLinkSites.mockReset()
    apiMock.completeLineAccountLink.mockReset()
    apiMock.listLineAccountLinkSites.mockResolvedValue([])
    window.sessionStorage.clear()
    window.history.replaceState({}, '', '/line/link')
  })

  it('從 fragment 保存 flow、清除網址，匿名使用者只導向固定登入頁', async () => {
    window.history.replaceState({}, '', '/line/link#flow=flow-from-line')

    renderWithProviders(
      <Routes>
        <Route path="/line/link" element={<LineAccountLinkPage />} />
        <Route path="/login" element={<CurrentLocation />} />
      </Routes>,
      {
        route: '/line/link',
        auth: createAuthValue({ status: 'anonymous', session: null, user: null }),
      },
    )

    expect(await screen.findByTestId('current-location')).toHaveTextContent('/login?lineLink=1')
    expect(window.sessionStorage.getItem(FLOW_STORAGE_KEY)).toBe('flow-from-line')
    expect(window.location.hash).toBe('')
    expect(apiMock.listLineAccountLinkSites).not.toHaveBeenCalled()
  })

  it('缺少 flow 時 fail closed 且不載入場域', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: '找不到 LINE 連結資訊' })).toBeInTheDocument()
    expect(screen.getByText(/重新對官方帳號傳送「連結帳號」/)).toBeInTheDocument()
    expect(apiMock.listLineAccountLinkSites).not.toHaveBeenCalled()
  })

  it('唯一場域只預選，仍需使用者明確確認才送出', async () => {
    const user = userEvent.setup()
    const navigateToAccountLink = vi.fn()
    window.sessionStorage.setItem(FLOW_STORAGE_KEY, 'stored-flow')
    apiMock.listLineAccountLinkSites.mockResolvedValue([siteFixture('site-1', '靚程一廠')])
    apiMock.completeLineAccountLink.mockResolvedValue({ accountLinkUrl: VALID_REDIRECT_URL })

    renderPage({ navigateToAccountLink })

    const radio = await screen.findByRole('radio', { name: /靚程一廠/ })
    await waitFor(() => expect(radio).toBeChecked())
    expect(apiMock.completeLineAccountLink).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '繼續前往 LINE' }))

    await waitFor(() => {
      expect(apiMock.completeLineAccountLink).toHaveBeenCalledWith('test-token', {
        flowToken: 'stored-flow',
        siteId: 'site-1',
      })
    })
    expect(navigateToAccountLink).toHaveBeenCalledWith(VALID_REDIRECT_URL)
    expect(window.sessionStorage.getItem(FLOW_STORAGE_KEY)).toBeNull()
  })

  it('多場域不預選，使用者選擇後才可繼續', async () => {
    const user = userEvent.setup()
    window.sessionStorage.setItem(FLOW_STORAGE_KEY, 'multi-site-flow')
    apiMock.listLineAccountLinkSites.mockResolvedValue([
      siteFixture('site-1', '靚程一廠'),
      siteFixture('site-2', '靚程二廠'),
    ])
    apiMock.completeLineAccountLink.mockResolvedValue({ accountLinkUrl: VALID_REDIRECT_URL })

    renderPage({ navigateToAccountLink: vi.fn() })

    const firstSite = await screen.findByRole('radio', { name: /靚程一廠/ })
    const secondSite = screen.getByRole('radio', { name: /靚程二廠/ })
    const submit = screen.getByRole('button', { name: '繼續前往 LINE' })

    expect(firstSite).not.toBeChecked()
    expect(secondSite).not.toBeChecked()
    expect(submit).toBeDisabled()

    await user.click(secondSite)
    expect(submit).toBeEnabled()
    await user.click(submit)

    await waitFor(() => {
      expect(apiMock.completeLineAccountLink).toHaveBeenCalledWith('test-token', {
        flowToken: 'multi-site-flow',
        siteId: 'site-2',
      })
    })
  })

  it('API 失敗時顯示錯誤且保留 flow 供重試', async () => {
    const user = userEvent.setup()
    window.sessionStorage.setItem(FLOW_STORAGE_KEY, 'retryable-flow')
    apiMock.listLineAccountLinkSites.mockResolvedValue([siteFixture('site-1', '靚程一廠')])
    apiMock.completeLineAccountLink.mockRejectedValue(new ApiError(410, 'line_account_link_flow_expired'))

    renderPage({ navigateToAccountLink: vi.fn() })

    await user.click(await screen.findByRole('button', { name: '繼續前往 LINE' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('無法完成 LINE 帳號連結，請稍後重試。')
    expect(window.sessionStorage.getItem(FLOW_STORAGE_KEY)).toBe('retryable-flow')
  })

  it('場域清單載入失敗時保留 flow 並禁止送出', async () => {
    window.sessionStorage.setItem(FLOW_STORAGE_KEY, 'site-list-retry-flow')
    apiMock.listLineAccountLinkSites.mockRejectedValue(new ApiError(503, 'service_unavailable'))

    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('無法載入可使用的場域，請稍後重試。')
    expect(screen.getByRole('button', { name: '繼續前往 LINE' })).toBeDisabled()
    expect(window.sessionStorage.getItem(FLOW_STORAGE_KEY)).toBe('site-list-retry-flow')
  })

  it('拒絕 API 外站的 redirect handle，且不清除 flow 或跳轉', async () => {
    const user = userEvent.setup()
    const navigateToAccountLink = vi.fn()
    window.sessionStorage.setItem(FLOW_STORAGE_KEY, 'guarded-flow')
    apiMock.listLineAccountLinkSites.mockResolvedValue([siteFixture('site-1', '靚程一廠')])
    apiMock.completeLineAccountLink.mockResolvedValue({
      accountLinkUrl: 'https://evil.example/v1/line/account-links/redirect/stolen-handle',
    })

    renderPage({ navigateToAccountLink })

    await user.click(await screen.findByRole('button', { name: '繼續前往 LINE' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('帳號連結網址無法驗證')
    expect(navigateToAccountLink).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem(FLOW_STORAGE_KEY)).toBe('guarded-flow')
  })

  it('沒有授權場域時提供下一步，且不允許送出', async () => {
    window.sessionStorage.setItem(FLOW_STORAGE_KEY, 'no-site-flow')

    renderPage()

    expect(await screen.findByRole('heading', { name: '目前沒有可連結的場域' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '繼續前往 LINE' })).toBeDisabled()
    expect(screen.getByText(/傳送「解除連結」/)).toBeInTheDocument()
  })

  it('共享瀏覽器切換帳號與 flow 時不回放前一人的場域快取', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const firstAuth = createAuthValue()
    const secondSession = {
      ...firstAuth.session!,
      accessToken: 'second-token',
      user: {
        ...firstAuth.session!.user,
        userId: 'user-2',
        email: 'second-user@example.test',
      },
    }
    const secondAuth = createAuthValue({ session: secondSession, user: secondSession.user })

    window.sessionStorage.setItem(FLOW_STORAGE_KEY, 'first-flow')
    apiMock.listLineAccountLinkSites.mockResolvedValueOnce([
      siteFixture('site-private-a', '前一位使用者的場域'),
    ])
    const firstRender = renderWithProviders(<LineAccountLinkPage />, {
      auth: firstAuth,
      queryClient,
    })
    expect(await screen.findByText('前一位使用者的場域')).toBeInTheDocument()
    firstRender.unmount()

    window.sessionStorage.setItem(FLOW_STORAGE_KEY, 'second-flow')
    apiMock.listLineAccountLinkSites.mockResolvedValueOnce([
      siteFixture('site-private-b', '第二位使用者的場域'),
    ])
    renderWithProviders(<LineAccountLinkPage />, {
      auth: secondAuth,
      queryClient,
    })

    expect(screen.queryByText('前一位使用者的場域')).not.toBeInTheDocument()
    expect(await screen.findByText('第二位使用者的場域')).toBeInTheDocument()
    expect(apiMock.listLineAccountLinkSites).toHaveBeenCalledTimes(2)
  })
})

describe('isAllowedLineAccountLinkRedirectUrl', () => {
  it.each([
    ['API 同源的單一 redirect handle', VALID_REDIRECT_URL, true],
    [
      'API 外站',
      'https://evil.example/v1/line/account-links/redirect/stolen-handle',
      false,
    ],
    ['相似但不相同的 path', `${API_ORIGIN}/v1/line/account-links/redirect.evil/handle`, false],
    ['多一層 path segment', `${VALID_REDIRECT_URL}/extra`, false],
    ['空 handle', `${API_ORIGIN}/v1/line/account-links/redirect/`, false],
    ['query', `${VALID_REDIRECT_URL}?next=https://evil.example`, false],
    ['空 query', `${VALID_REDIRECT_URL}?`, false],
    ['fragment', `${VALID_REDIRECT_URL}#secret`, false],
    [
      'userinfo',
      'https://attacker@api.example.test/v1/line/account-links/redirect/handle',
      false,
    ],
    ['編碼斜線', `${API_ORIGIN}/v1/line/account-links/redirect/one%2Ftwo`, false],
  ])('%s', (_label, value, expected) => {
    expect(isAllowedLineAccountLinkRedirectUrl(value, API_ORIGIN)).toBe(expected)
  })
})

function renderPage({
  apiOrigin = API_ORIGIN,
  navigateToAccountLink = vi.fn(),
}: {
  apiOrigin?: string
  navigateToAccountLink?: (url: string) => void
} = {}) {
  return renderWithProviders(
    <LineAccountLinkPage apiOrigin={apiOrigin} navigateToAccountLink={navigateToAccountLink} />,
  )
}

function CurrentLocation() {
  const location = useLocation()
  return <div data-testid="current-location">{location.pathname + location.search}</div>
}

function siteFixture(siteId: string, name: string): LineAccountLinkSite {
  return {
    siteId,
    organizationId: 'org-1',
    name,
    address: '台南市永康區工業路 1 號',
  }
}
