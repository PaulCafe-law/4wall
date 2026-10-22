import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'

import { OfficialSitePage } from './OfficialSitePage'
import { officialContent } from './officialContent'

const PLATFORM = 'https://platform.4wall.io'

describe('OfficialSitePage', () => {
  it('renders the warehouse website in Chinese', () => {
    render(<OfficialSitePage />)

    expect(screen.getByRole('heading', { level: 1, name: '倉庫的每個決定，先在電腦裡跑一遍。' })).toBeInTheDocument()
    expect(screen.getByText(/把設施清單、平面圖或倉庫簡報交給 AI/)).toBeInTheDocument()

    // The six product steps, in order.
    for (const step of officialContent.zh.steps) {
      expect(screen.getByRole('heading', { level: 3, name: step.h3 })).toBeInTheDocument()
    }
    expect(screen.getByRole('heading', { name: '我們的數字守則。' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '主流程旁邊，還有這幾格。' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '答案，先封在信封裡。' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '先回答你可能會問的。' })).toBeInTheDocument()

    // Honesty: the calibration line and illustrative stamps are visible text.
    expect(screen.getAllByText(/尚未用現場資料校準/).length).toBeGreaterThan(2)
    expect(screen.getByText('這些是產品功能的數字，不是成效。')).toBeInTheDocument()

    // Contact and footer.
    expect(document.querySelector('footer')).toBeInTheDocument()
    expect(screen.getByText('© 2026 4WALL AI')).toBeInTheDocument()
    expect(document.getElementById('contact')).toBeInTheDocument()
    expect(document.getElementById('faq-fit')?.tagName).toBe('DETAILS')
  })

  it('links Get started and Log in to the platform with nofollow', () => {
    render(<OfficialSitePage />)

    const start = screen.getAllByRole('link', { name: '開始使用（前往 platform.4wall.io）' })
    expect(start.length).toBeGreaterThan(1)
    for (const link of start) {
      expect(link).toHaveAttribute('href', PLATFORM)
      expect(link).toHaveAttribute('rel', 'nofollow')
    }
    for (const link of screen.getAllByRole('link', { name: '登入（前往 platform.4wall.io）' })) {
      expect(link).toHaveAttribute('href', PLATFORM)
      expect(link).toHaveAttribute('rel', 'nofollow')
    }
    // Get started is the primary (filled) button in the hero.
    const hero = document.getElementById('top')!
    const heroStart = within(hero).getByRole('link', { name: '開始使用（前往 platform.4wall.io）' })
    expect(heroStart).toHaveClass('ow-btn--primary')
  })

  it('books demos by email with a prefilled subject', () => {
    render(<OfficialSitePage />)

    const demo = screen.getAllByRole('link', { name: '預約示範（寄信給 4wallaitech@gmail.com）' })
    expect(demo.length).toBeGreaterThan(1)
    const url = new URL(demo[0].getAttribute('href')!)
    expect(url.protocol).toBe('mailto:')
    expect(url.pathname).toBe('4wallaitech@gmail.com')
    expect(url.searchParams.get('subject')).toBe('預約示範｜4WALL AI 倉庫模擬')
    expect(url.searchParams.get('body')).toContain('有沒有 AGV（貨到人）')
  })

  it('contains no legacy factory content or customer names', () => {
    render(<OfficialSitePage />)
    const text = document.body.textContent ?? ''

    for (const legacy of ['工廠', '機台', 'HMI', 'OCR', 'LINE', '無人機', '靚程', '產品履歷', '和泰', '安格', 'NT$', '%', '世界模型']) {
      expect(text).not.toContain(legacy)
    }
    // The only images are inline SVG/canvas illustrations with labels.
    expect(document.querySelectorAll('img')).toHaveLength(0)
  })

  it('survives a malformed URL fragment', () => {
    window.history.replaceState({}, '', '/#50%off')
    render(<OfficialSitePage />)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    window.history.replaceState({}, '', '/')
  })

  it('saves undo as a new version in the chat demo, like the product', async () => {
    render(<OfficialSitePage />)
    const chat = screen.getByRole('group', { name: '對話修改示意' })

    await act(async () => fireEvent.click(within(chat).getByRole('button', { name: 'B 排料架往右移一格' })))
    expect(within(chat).getByText('版本 3')).toBeInTheDocument()
    await act(async () => fireEvent.click(within(chat).getByRole('button', { name: '↺ 復原' })))
    expect(within(chat).getByText('版本 4')).toBeInTheDocument()
    expect(within(chat).getByText('↺ 已還原至版本 2 的內容 · 版本 4')).toBeInTheDocument()
  })

  it('asks for simulator verification from five queue slots up', () => {
    render(<OfficialSitePage />)
    const slider = screen.getByRole('slider', { name: '站前可以排幾座' })

    fireEvent.change(slider, { target: { value: '4' } })
    expect(screen.queryByText('站前 5 座以上 · 請用模擬器驗算')).not.toBeInTheDocument()
    fireEvent.change(slider, { target: { value: '6' } })
    expect(screen.getByText('站前 5 座以上 · 請用模擬器驗算')).toBeInTheDocument()
    fireEvent.change(slider, { target: { value: '8' } })
    expect(screen.getByText('超出 AI 學過的範圍 · 請用模擬器驗算')).toBeInTheDocument()
  })

  it('renders the English version', () => {
    render(<OfficialSitePage locale="en" />)

    expect(screen.getByRole('heading', { level: 1, name: 'Run every warehouse decision on screen first.' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'AI goes fast. The simulator checks.' })).toBeInTheDocument()
    for (const link of screen.getAllByRole('link', { name: '中文' })) {
      expect(link).toHaveAttribute('href', '/')
    }
    expect(document.title).toBe('4WALL AI — Run every warehouse decision on screen first')
    expect(document.documentElement.lang).toBe('en')
  })

  it('sets route-level metadata', () => {
    render(<OfficialSitePage />)

    expect(document.title).toBe('4WALL AI｜倉庫的每個決定，先在電腦裡跑一遍')
    expect(document.head.querySelector('meta[name="description"]')).toHaveAttribute('content', officialContent.zh.meta.description)
    const fonts = [...document.head.querySelectorAll('link[rel="stylesheet"]')].map((link) => link.getAttribute('href'))
    expect(fonts.some((href) => href?.includes('Noto+Sans+TC:wght@900'))).toBe(true)
  })

  it.each([
    { locale: 'zh' as const, base: '' as const, label: 'EN', target: '/en' },
    { locale: 'en' as const, base: '' as const, label: '中文', target: '/' },
    { locale: 'zh' as const, base: '/official' as const, label: 'EN', target: '/official/en' },
    { locale: 'en' as const, base: '/official' as const, label: '中文', target: '/official' },
  ])('points the $label switch at $target (basePath "$base")', ({ locale, base, label, target }) => {
    render(<OfficialSitePage locale={locale} basePath={base} />)

    const links = screen.getAllByRole('link', { name: label })
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) expect(link).toHaveAttribute('href', target)
  })
})
