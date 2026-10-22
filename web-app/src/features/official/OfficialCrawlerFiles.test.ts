import llms from '../../../public/llms.txt?raw'
import markdown from '../../../public/official.md?raw'
import robots from '../../../public/robots.txt?raw'
import sitemap from '../../../public/sitemap.xml?raw'
import { buildLlmsTxt, buildOfficialMarkdown } from './officialText'

describe('official crawler files', () => {
  it('allows AI crawlers to read only public official surfaces', () => {
    expect(robots).toContain('User-agent: GPTBot')
    expect(robots).toContain('User-agent: OAI-SearchBot')
    expect(robots).toContain('User-agent: ChatGPT-User')
    expect(robots).toContain('Allow: /$')
    expect(robots).toContain('Allow: /en$')
    expect(robots.split(/\r?\n/)).not.toContain('Allow: /')
    expect(robots).toContain('Allow: /llms.txt')
    expect(robots).toContain('Allow: /official.md')
    expect(robots).toContain('Disallow: /')
    expect(robots).toContain('Sitemap: https://www.4wall.io/sitemap.xml')
  })

  it('does not list management routes in the public sitemap', () => {
    const locations = Array.from(sitemap.matchAll(/<loc>(.*?)<\/loc>/g), (match) => match[1])
    expect(locations).toEqual([
      'https://www.4wall.io/',
      'https://www.4wall.io/en',
      'https://www.4wall.io/official.md',
      'https://www.4wall.io/llms.txt',
    ])
    expect(sitemap).not.toContain('/login')
    expect(sitemap).not.toContain('/missions')
    expect(sitemap).not.toContain('/incidents')
    expect(sitemap).not.toContain('/site-map')
    expect(sitemap).not.toContain('/control-plane')
  })

  it('keeps the committed crawler text identical to the generated text', () => {
    // Regenerate with: node scripts/build-official-text.mjs
    expect(markdown.replace(/\r\n/g, '\n')).toBe(buildOfficialMarkdown())
    expect(llms.replace(/\r\n/g, '\n')).toBe(buildLlmsTxt())
  })

  it('publishes AI-readable warehouse context without credentials', () => {
    const combined = `${llms}\n${markdown}`

    expect(combined).toContain('4WALL AI（第四面牆）')
    expect(combined).toContain('3D 倉庫')
    expect(combined).toContain('模擬比較')
    expect(combined).toContain('尚未用現場資料校準')
    expect(combined).toContain('4wallaitech@gmail.com')
    for (const content of [llms, markdown]) {
      expect(content).toContain('https://www.4wall.io/')
      expect(content).toContain('https://www.4wall.io/en')
      expect(content).not.toContain('https://4wall.io')
      expect(content).not.toMatch(/https:\/\/www\.4wall\.io\/official(?:\s|$)/)
    }
    expect(combined).not.toContain('platform@')
    expect(combined).not.toContain('internal.test')
    expect(combined).not.toContain('password')
    expect(combined).not.toContain('secret')
  })
})
