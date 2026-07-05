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

    // War-room hero: real dispatch chat + live gauge readings from the platform.
    expect(screen.getByText('派小明去處理 HC600-01')).toBeInTheDocument()
    expect(screen.getByText(/已指派 小明 → HC600-01 成型機/)).toBeInTheDocument()
    expect(screen.getByText('PRESS AM METER')).toBeInTheDocument()
    expect(screen.getByText('9.7 A')).toBeInTheDocument()
    expect(screen.getByText(/內容取自營運中系統/)).toBeInTheDocument()

    // Service card titles render as visible text (imageOnly regression guard).
    expect(screen.getByRole('heading', { name: '問它，它就回答' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '沒人問，它主動通報' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '儀表、派工單，AI 自動讀' })).toBeInTheDocument()

    // LINE Q&A recreation carries the real conversation text (replaces the
    // off-topic construction card).
    expect(screen.getByText('給我現在機台狀況以及對應的維修人員')).toBeInTheDocument()
    expect(screen.getByText(/志強（維護技師）站點 HC600-06/)).toBeInTheDocument()
    expect(screen.getByText(/HC600-01 成型機・溫度異常/)).toBeInTheDocument()

    // Day-on-duty timeline, stats, case study, pricing, onboarding, security.
    expect(screen.getByRole('heading', { name: '它的一天，替你值的班。' })).toBeInTheDocument()
    expect(screen.getByText('07:30')).toBeInTheDocument()
    expect(screen.getByText('7 台機台')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '靚程企業｜台南・射出成型' })).toBeInTheDocument()
    expect(screen.getByText('成大建築系')).toBeInTheDocument()
    expect(screen.getByText('安格科技')).toBeInTheDocument()
    expect(screen.getByText('月費 NT$8,000 起')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '導入只要三步，以週為單位。' })).toBeInTheDocument()
    expect(screen.getByText('人員偵測全程匿名')).toBeInTheDocument()

    // Every remaining <img> carries explicit dimensions (CLS guard).
    for (const img of Array.from(document.querySelectorAll('img'))) {
      expect(img).toHaveAttribute('width')
      expect(img).toHaveAttribute('height')
    }

    // Contact, footer, language switch, platform login.
    expect(document.querySelector('footer')).toBeInTheDocument()
    expect(screen.getByText('© 2026 第四面牆 4WALL AI. All rights reserved.')).toBeInTheDocument()
    for (const link of screen.getAllByRole('link', { name: 'EN' })) {
      expect(link).toHaveAttribute('href', '/official/en')
    }
    for (const link of screen.getAllByRole('link', { name: '進入管理平台' })) {
      expect(link).toHaveAttribute('href', '/login')
    }
    expect(screen.getByRole('link', { name: '聯絡我們' })).toHaveAttribute('href', '#contact')

    // No stale / off-topic content: construction concrete card, under-construction,
    // engineering jargon.
    expect(document.body).not.toHaveTextContent('建置中')
    expect(document.body).not.toHaveTextContent('預拌混凝土')
    expect(document.body).not.toHaveTextContent('bounding box')
    expect(document.body).not.toHaveTextContent(['場域', '驗證'].join(''))
  })

  it('renders the English version at /official/en', () => {
    renderOfficial('/official/en')

    expect(screen.getByRole('heading', { level: 1, name: 'A factory that answers.' })).toBeInTheDocument()
    expect(screen.getByText('PRESS AM METER')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ask, and it answers' })).toBeInTheDocument()
    expect(screen.getByText(/Give me current machine status/)).toBeInTheDocument()
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
  })
})
