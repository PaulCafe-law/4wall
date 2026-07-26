import llms from '../../../public/llms.txt?raw'
import markdown from '../../../public/official.md?raw'
import robots from '../../../public/robots.txt?raw'
import sitemap from '../../../public/sitemap.xml?raw'

describe('official crawler files', () => {
  it('allows AI crawlers to read only public official surfaces', () => {
    expect(robots).toContain('User-agent: GPTBot')
    expect(robots).toContain('User-agent: OAI-SearchBot')
    expect(robots).toContain('User-agent: ChatGPT-User')
    expect(robots).toContain('Allow: /official')
    expect(robots).toContain('Allow: /llms.txt')
    expect(robots).toContain('Allow: /official.md')
    expect(robots).toContain('Disallow: /')
    expect(robots).toContain('Sitemap: https://4wall.io/sitemap.xml')
  })

  it('does not list management routes in the public sitemap', () => {
    expect(sitemap).toContain('https://4wall.io/official')
    expect(sitemap).toContain('https://4wall.io/official.md')
    expect(sitemap).toContain('https://4wall.io/llms.txt')
    expect(sitemap).not.toContain('/login')
    expect(sitemap).not.toContain('/missions')
    expect(sitemap).not.toContain('/incidents')
    expect(sitemap).not.toContain('/site-map')
    expect(sitemap).not.toContain('/control-plane')
  })

  it('publishes AI-readable public context without credentials', () => {
    const combined = `${llms}\n${markdown}`

    expect(combined).toContain('4WALL AI（第四面牆）')
    expect(combined).toContain('工廠地端 AI')
    expect(combined).toContain('機台資料匯出與整合')
    expect(combined).toContain('產品履歷')
    expect(combined).toContain('4wallaitech@gmail.com')
    expect(combined).not.toContain('platform@')
    expect(combined).not.toContain('internal.test')
    expect(combined).not.toContain('password')
    expect(combined).not.toContain('secret')
  })
})
