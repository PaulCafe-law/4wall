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
  it('renders the machine-data-first Chinese official website content', () => {
    renderOfficial('/official')

    expect(screen.getByRole('heading', { level: 1, name: '讓機台資料真正用來改善生產。' })).toBeInTheDocument()

    // Hero: actual injection-molding factory, not construction footage.
    const hero = screen.getByRole('img', { name: /射出成型工廠整合機台/ })
    expect(hero).toHaveAttribute('src', '/official-assets/factory-floor-live.webp')
    expect(hero).toHaveAttribute('width', '2304')
    expect(hero).toHaveAttribute('height', '1296')
    expect(screen.getByText(/畫面由廠內攝影機取得/)).toBeInTheDocument()

    // Five core abilities render as visible text.
    expect(screen.getByRole('heading', { name: '讓既有機台資料可以被使用' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '生產資料留在工廠，由地端 AI 持續分析' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '找出機台為什麼沒有持續生產' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '讓排程跟著真實現場調整' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '每批產品的製造過程都能回查' })).toBeInTheDocument()

    // Real LINE Q&A screenshot in the "ask it" card (replaces the off-topic
    // construction card); proactive-alert recreation in the "it reports" card.
    expect(screen.getByRole('img', { name: /主管透過 LINE 查詢機台狀態/ })).toHaveAttribute(
      'src',
      '/official-assets/line-qa-live.webp',
    )
    expect(screen.getByText(/HC600-01 成型機溫度異常/)).toBeInTheDocument()
    expect(screen.getByText(/已指派負責人前往處理/)).toBeInTheDocument()

    // Day-on-duty timeline, stats, case study, pricing, onboarding, security.
    expect(screen.getByRole('heading', { name: '從資料取得到異常結案，現場狀態持續累積。' })).toBeInTheDocument()
    expect(screen.getByText('07:30')).toBeInTheDocument()
    expect(screen.getByText('7 台機台')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '靚程企業｜台南射出成型工廠' })).toBeInTheDocument()
    expect(screen.getByText('成大建築系')).toBeInTheDocument()
    expect(screen.getByText('安格科技')).toBeInTheDocument()
    expect(screen.getByText('月費 NT$8,000 起')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '從資料盤點到上線，以週為單位完成導入。' })).toBeInTheDocument()
    expect(screen.getByText('只同步管理所需的結果')).toBeInTheDocument()

    // Every remaining <img> carries explicit dimensions (CLS guard).
    for (const img of Array.from(document.querySelectorAll('img'))) {
      expect(img).toHaveAttribute('width')
      expect(img).toHaveAttribute('height')
    }

    // Contact, footer, language switch, platform login.
    expect(document.querySelector('footer')).toBeInTheDocument()
    expect(screen.getByText('© 2026 4WALL AI（第四面牆）. All rights reserved.')).toBeInTheDocument()
    for (const link of screen.getAllByRole('link', { name: 'EN' })) {
      expect(link).toHaveAttribute('href', '/official/en')
    }
    for (const link of screen.getAllByRole('link', { name: '進入管理平台' })) {
      expect(link).toHaveAttribute('href', '/login')
    }
    expect(screen.getByRole('link', { name: '聯絡我們' })).toHaveAttribute('href', '#contact')

    // No stale positioning or off-topic construction content.
    expect(document.body).not.toHaveTextContent('建置中')
    expect(document.body).not.toHaveTextContent('預拌混凝土')
    expect(document.body).not.toHaveTextContent(['戰', '情室'].join(''))
    expect(document.body).not.toHaveTextContent(['實', '裝'].join(''))
    expect(document.body).not.toHaveTextContent(['替你值', '的班'].join(''))
    expect(document.body).not.toHaveTextContent(['會回答', '你的工廠'].join(''))
    expect(document.body).not.toHaveTextContent(['不是第七個 ', 'dashboard'].join(''))
  })

  it('renders the English version at /official/en', () => {
    renderOfficial('/official/en')

    expect(screen.getByRole('heading', { level: 1, name: 'A factory that answers.' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /3D mirror-factory war room/ })).toHaveAttribute(
      'src',
      '/official-assets/warroom-live.webp',
    )
    expect(screen.getByRole('heading', { name: 'Ask, and it answers' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Real LINE chat/ })).toHaveAttribute('src', '/official-assets/line-qa-live.webp')
    expect(screen.getByText('From NT$8,000 / month')).toBeInTheDocument()
    for (const link of screen.getAllByRole('link', { name: '中文' })) {
      expect(link).toHaveAttribute('href', '/official')
    }
    expect(document.title).toBe('4WALL AI | A Factory That Answers — 3D Mirror Factory & AI Duty Agent')
  })

  it('sets route-level official site metadata', () => {
    renderOfficial('/official')

    expect(document.title).toBe('4WALL AI｜工廠地端 AI、機台資料整合與生產最佳化')
    expect(document.head.querySelector('meta[name="description"]')).toHaveAttribute(
      'content',
      '4WALL AI 協助工廠匯出並整合機台資料，透過地端 AI 分析設備與生產狀態，提升稼動率、協助最佳化排程，並建立可追溯的產品履歷。',
    )
  })
})
