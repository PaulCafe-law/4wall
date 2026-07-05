import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'

import { renderWithProviders } from '../../test/utils'
import { OfficialSitePage } from './OfficialSitePage'

describe('OfficialSitePage', () => {
  it('renders the public official website content', () => {
    renderWithProviders(
      <Routes>
        <Route path="/official" element={<OfficialSitePage />} />
      </Routes>,
      { route: '/official' },
    )

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: '整座工廠，看得見、問得到。',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /第四面牆把機台狀態、儀表讀值、人員位置與異常事件，即時收進同一座 3D 鏡像工廠/,
      ),
    ).toBeInTheDocument()

    // Service card titles must render as visible text (regression guard: the old
    // imageOnly mode silently dropped title/body for the flagship service cards).
    expect(screen.getByRole('heading', { name: '鏡像工廠：整座廠，一個畫面' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '儀表、派工單，AI 自動讀' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '事件有頭有尾，不再淹沒在群組裡' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'LINE 主動通知，把消息送到人' })).toBeInTheDocument()

    // Operational facts strip replaces the old "under construction" banner.
    expect(screen.getByText('7 台機台')).toBeInTheDocument()
    expect(screen.getByText('3 天 → 3 小時')).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent('建置中')

    // Case study and partners.
    expect(screen.getByRole('heading', { name: '靚程企業｜台南・射出成型' })).toBeInTheDocument()
    expect(screen.getByText('成大建築系')).toBeInTheDocument()
    expect(screen.getByText('安格科技')).toBeInTheDocument()

    // Pricing anchors.
    expect(screen.getByRole('heading', { name: '方案與費用' })).toBeInTheDocument()
    expect(screen.getByText('月費 NT$8,000 起')).toBeInTheDocument()

    // Onboarding and security sections.
    expect(screen.getByRole('heading', { name: '導入只要三步，以週為單位。' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '你的工廠資料，只屬於你。' })).toBeInTheDocument()
    expect(screen.getByText('人員偵測全程匿名')).toBeInTheDocument()

    // Compressed image assets with explicit dimensions.
    const hero = screen.getByRole('img', {
      name: '第四面牆 AI 把現場影像、AI 辨識與 3D 鏡像工廠疊合在真實工廠場域上',
    })
    expect(hero).toHaveAttribute('src', '/official-assets/hero-field-ai.webp')
    expect(hero).toHaveAttribute('width', '1800')
    expect(hero).toHaveAttribute('height', '1350')
    expect(document.querySelector('img[src="/official-assets/dashboard-bim.webp"]')).toBeInTheDocument()
    for (const img of Array.from(document.querySelectorAll('img'))) {
      expect(img).toHaveAttribute('width')
      expect(img).toHaveAttribute('height')
    }

    // Contact and footer.
    const mailLinks = screen.getAllByRole('link', { name: '4wallaitech@gmail.com' })
    expect(mailLinks.length).toBeGreaterThanOrEqual(1)
    for (const link of mailLinks) {
      expect(link.getAttribute('href')).toMatch(/^mailto:4wallaitech@gmail\.com/)
    }
    expect(document.querySelector('footer')).toBeInTheDocument()
    expect(screen.getByText('© 2026 第四面牆 4WALL AI. All rights reserved.')).toBeInTheDocument()
    const loginLinks = screen.getAllByRole('link', { name: '進入管理平台' })
    expect(loginLinks.length).toBeGreaterThanOrEqual(1)
    for (const link of loginLinks) {
      expect(link).toHaveAttribute('href', '/login')
    }

    // The header must expose a contact CTA that works on mobile widths too.
    expect(screen.getByRole('link', { name: '聯絡我們' })).toHaveAttribute('href', '#contact')

    // Engineering-internal vocabulary must not leak onto the marketing page.
    expect(document.body).not.toHaveTextContent('bounding box')
    expect(document.body).not.toHaveTextContent('mask')
    expect(document.body).not.toHaveTextContent('metadata')
    expect(document.body).not.toHaveTextContent('新服務線')
    expect(document.body).not.toHaveTextContent('pivot')
    expect(document.body).not.toHaveTextContent(['閉', '環'].join(''))
    expect(document.body).not.toHaveTextContent(['場域', '驗證'].join(''))
  })

  it('sets route-level official site metadata', () => {
    renderWithProviders(
      <Routes>
        <Route path="/official" element={<OfficialSitePage />} />
      </Routes>,
      { route: '/official' },
    )

    expect(document.title).toBe('第四面牆 AI｜3D 鏡像工廠與 AI 現場管理平台')
    expect(document.head.querySelector('meta[name="description"]')).toHaveAttribute(
      'content',
      '第四面牆 AI 把機台狀態、儀表讀值與異常事件收進 3D 鏡像工廠（Digital Twin）：AI 自動判讀儀表、HMI 與派工單，異常主動推進 LINE 群組，一句話查詢現場。已於台南射出成型工廠實裝運作。',
    )
    expect(document.head.querySelector('meta[property="og:title"]')).toHaveAttribute(
      'content',
      '第四面牆 AI｜3D 鏡像工廠與 AI 現場管理平台',
    )
    expect(document.head.querySelector('meta[property="og:description"]')).toHaveAttribute(
      'content',
      '第四面牆 AI 把機台狀態、儀表讀值與異常事件收進 3D 鏡像工廠（Digital Twin）：AI 自動判讀儀表、HMI 與派工單，異常主動推進 LINE 群組，一句話查詢現場。已於台南射出成型工廠實裝運作。',
    )
  })
})
