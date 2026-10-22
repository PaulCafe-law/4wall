import { renderHook } from '@testing-library/react'

import type { OfficialLocale } from './officialContent'
import { useOfficialSiteMeta } from './useOfficialSiteMeta'

describe('official URL metadata', () => {
  let previousHead: string
  let previousLanguage: string

  beforeEach(() => {
    previousHead = document.head.innerHTML
    previousLanguage = document.documentElement.lang
    document.head.innerHTML = `
      <title>Previous page</title>
      <link rel="canonical" href="https://www.4wall.io/" />
      <meta property="og:url" content="https://www.4wall.io/" />
      <script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'Organization', url: 'https://www.4wall.io/' },
          { '@type': 'WebSite', url: 'https://www.4wall.io/', inLanguage: 'zh-Hant-TW' },
        ],
      })}</script>`
    document.documentElement.lang = 'zh-Hant-TW'
  })

  afterEach(() => {
    document.head.innerHTML = previousHead
    document.documentElement.lang = previousLanguage
    vi.unstubAllEnvs()
  })

  function expectLocaleMetadata(locale: OfficialLocale, origin = 'https://www.4wall.io') {
    const url = `${origin}${locale === 'en' ? '/en' : '/'}`
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(url)
    expect(document.head.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe(url)
    expect(document.documentElement.lang).toBe(locale === 'en' ? 'en' : 'zh-Hant-TW')
    expect(document.head.querySelector('link[hreflang="zh-Hant-TW"]')?.getAttribute('href')).toBe(`${origin}/`)
    expect(document.head.querySelector('link[hreflang="en"]')?.getAttribute('href')).toBe(`${origin}/en`)
    expect(document.head.querySelector('link[hreflang="x-default"]')?.getAttribute('href')).toBe(`${origin}/`)
    const data = JSON.parse(document.head.querySelector('script[type="application/ld+json"]')!.textContent!)
    expect(data['@graph'][0].url).toBe(`${origin}/`)
    expect(data['@graph'][1]).toMatchObject({ url, inLanguage: locale === 'en' ? 'en' : 'zh-Hant-TW' })
  }

  it('keeps canonical, social, language and structured metadata aligned when switching locales', () => {
    const { rerender, unmount } = renderHook(({ locale }) => useOfficialSiteMeta(locale), {
      initialProps: { locale: 'zh' as OfficialLocale },
    })
    expectLocaleMetadata('zh')
    rerender({ locale: 'en' })
    expectLocaleMetadata('en')
    rerender({ locale: 'zh' })
    expectLocaleMetadata('zh')
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1)
    expect(document.head.querySelectorAll('link[rel="alternate"]')).toHaveLength(3)
    unmount()
    expect(document.title).toBe('Previous page')
    expect(document.head.querySelectorAll('link[rel="alternate"]')).toHaveLength(0)
  })

  it('normalizes a configured origin with a trailing slash', () => {
    vi.stubEnv('VITE_PUBLIC_SITE_ORIGIN', 'https://public.example.test/')
    const { unmount } = renderHook(() => useOfficialSiteMeta('en'))
    expectLocaleMetadata('en', 'https://public.example.test')
    unmount()
  })
})
