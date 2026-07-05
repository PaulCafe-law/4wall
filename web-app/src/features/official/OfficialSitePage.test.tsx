import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'

import { renderWithProviders } from '../../test/utils'
import { OfficialSitePage } from './OfficialSitePage'

function renderOfficial(route: string, locale?: 'en') {
  renderWithProviders(
    <Routes>
      <Route path="/official" element={<OfficialSitePage />} />
      <Route path="/official/en" element={<OfficialSitePage locale={locale ?? 'en'} />} />
    </Routes>,
    { route },
  )
}

describe('OfficialSitePage', () => {
  it('renders the agent-first official website content', () => {
    renderOfficial('/official')

    expect(screen.getByRole('heading', { level: 1, name: '會回答你的工廠。' })).toBeInTheDocument()

    // War-room hero mockup: agent Q&A and proactive notifications must render.
    expect(screen.getByText('HC600-01 今天狀況？')).toBeInTheDocument()
    expect(screen.getByText(/OEE 0\.87、模溫 68°C/)).toBeInTheDocument()
    expect(screen.getByText(/介面重現自營運中系統/)).toBeInTheDocument()

    // Service card titles render as visible text (imageOnly regression guard).
    expect(screen.getByRole('heading', { name: '問它，它就回答' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '沒人問，它主動通報' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '儀表、派工單，AI 自動讀' })).toBeInTheDocument()

    // Day-on-duty timeline.
    expect(screen.getByRole('heading', { name: '它的一天，替你值的班。' })).toBeInTheDocument()
    expect(screen.getByText('07:30')).toBeInTheDocument()

    // Operational facts, case study, pricing, onboarding, security.
    expect(screen.getByText('7 台機台')).toBeInTheDocument()
    expect(screen.getByText('3 天 → 3 小時')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '靚程企業｜台南・射出成型' })).toBeInTheDocument()
    expect(screen.getByText('成大建築系')).toBeInTheDocument()
    expect(screen.getByText('安格科技')).toBeInTheDocument()
    expect(screen.getByText('月費 NT$8,000 起')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '導入只要三步，以週為單位。' })).toBeInTheDocument()
    expect(screen.getByText('人員偵測全程匿名')).toBeInTheDocument()

    // Images carry explicit dimensions (CLS guard).
    for (const img of Array.from(document.querySelectorAll('img'))) {
      expect(img).toHaveAttribute('width')
      expect(img).toHaveAttribute('height')
    }

    // Contact, footer, language switch, platform login.
    const mailLinks = screen.getAllByRole('link', { name: '4wallaitech@gmail.com' })
    expect(mailLinks.length).toBeGreaterThanOrEqual(1)
    expect(document.querySelector('footer')).toBeInTheDocument()
    expect(screen.getByText('© 2026 第四面牆 4WALL AI. All rights reserved.')).toBeInTheDocument()
    for (const link of screen.getAllByRole('link', { name: 'EN' })) {
      expect(link).toHaveAttribute('href', '/official/en')
    }
    for (const link of screen.getAllByRole('link', { name: '進入管理平台' })) {
      expect(link).toHaveAttribute('href', '/login')
    }
    expect(screen.getByRole('link', { name: '聯絡我們' })).toHaveAttribute('href', '#contact')

    // Engineering-internal vocabulary must not leak onto the marketing page.
    expect(document.body).not.toHaveTextContent('建置中')
    expect(document.body).not.toHaveTextContent('bounding box')
    expect(document.body).not.toHaveTextContent('新服務線')
    expect(document.body).not.toHaveTextContent('pivot')
    expect(document.body).not.toHaveTextContent(['閉', '環'].join(''))
    expect(document.body).not.toHaveTextContent(['場域', '驗證'].join(''))
  })

  it('renders the English version at /official/en', () => {
    renderOfficial('/official/en')

    expect(screen.getByRole('heading', { level: 1, name: 'A factory that answers.' })).toBeInTheDocument()
    expect(screen.getByText(/OEE 0\.87, mold temp 68°C/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ask, and it answers' })).toBeInTheDocument()
    expect(screen.getByText('From NT$8,000 / month')).toBeInTheDocument()
    for (const link of screen.getAllByRole('link', { name: '中文' })) {
      expect(link).toHaveAttribute('href', '/official')
    }
    expect(document.title).toBe('4WALL AI | A Factory That Answers — 3D Mirror Factory & AI Duty Agent')
  })

  it('sets route-level official site metadata', () => {
    renderOfficial('/official')

    expect(document.title).toBe('第四面牆 AI｜會回答你的工廠——3D 鏡像工廠與 AI 值班代理')
    expect(document.head.querySelector('meta[name="description"]')).toHaveAttribute(
      'content',
      '第四面牆 AI 把機台、儀表、人員與異常事件收進 3D 鏡像工廠：在 LINE 問一句話就有答案，沒人問的時候 AI 替你值班主動通報。已於台南射出成型工廠實裝運作。',
    )
    expect(document.head.querySelector('meta[property="og:title"]')).toHaveAttribute(
      'content',
      '第四面牆 AI｜會回答你的工廠——3D 鏡像工廠與 AI 值班代理',
    )
  })
})
