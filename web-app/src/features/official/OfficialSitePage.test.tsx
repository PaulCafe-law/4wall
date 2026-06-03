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
        name: '第四面牆 AI｜重塑現場管理：讓真實空間具備感知、追蹤與協作能力',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        '透過無人機、固定攝影機與 AI Agent 的無縫整合，為工廠與工地打造專屬的 Digital Twin，實現即時通報、精準追蹤與歷史回放的智慧大腦。',
      ),
    ).toBeInTheDocument()
    expect(document.querySelector('img[src="/official-assets/construction-plan.png"]')).toBeInTheDocument()
    expect(document.querySelector('img[src="/official-assets/dashboard-bim.png"]')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '合作機構' })).toBeInTheDocument()
    expect(screen.getByText('4wall AI 在建立下一代工廠及工地 AI native 系統。')).toBeInTheDocument()
    expect(screen.getByText('成大建築系')).toBeInTheDocument()
    expect(screen.getByText('靚程企業有限公司')).toBeInTheDocument()
    expect(screen.getAllByText('合作機構')).toHaveLength(4)
    expect(screen.getByText('歡迎寄信洽詢。')).toBeInTheDocument()
    expect(
      screen.getByRole('img', {
        name: '第四面牆 AI 將無人機巡檢、現場影像與 AI 辨識疊合在工廠場域上',
      }),
    ).toHaveAttribute('src', '/official-assets/hero-field-ai.jpg')
    expect(screen.getByRole('img', { name: '工地分期規劃與動線管理示意圖' })).toHaveAttribute(
      'src',
      '/official-assets/construction-plan.png',
    )
    expect(screen.getByRole('link', { name: '4wallaitech@gmail.com' })).toHaveAttribute(
      'href',
      'mailto:4wallaitech@gmail.com',
    )
    expect(screen.getByRole('link', { name: '進入管理平台' })).toHaveAttribute('href', '/login')
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

    expect(document.title).toBe('第四面牆 AI｜工地巡檢與虛擬工廠 Digital Twin')
    expect(document.head.querySelector('meta[name="description"]')).toHaveAttribute(
      'content',
      '第四面牆 AI 提供智慧工地巡檢、現場影像監測、異常事件通報與虛擬工廠 Digital Twin 服務，協助管理者遠端掌握真實場域狀態。',
    )
    expect(document.head.querySelector('meta[property="og:title"]')).toHaveAttribute(
      'content',
      '第四面牆 AI｜工地巡檢與虛擬工廠 Digital Twin',
    )
  })
})
