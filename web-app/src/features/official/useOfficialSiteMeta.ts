import { useEffect } from 'react'

import { officialContent, type OfficialLocale } from './officialContent'
import { OFFICIAL_FONT_ORIGINS, officialFontStylesheets } from './officialFonts'

export function useOfficialSiteMeta(locale: OfficialLocale = 'zh') {
  useEffect(() => {
    const meta = officialContent[locale].meta
    const siteOrigin = new URL(import.meta.env.VITE_PUBLIC_SITE_ORIGIN || 'https://www.4wall.io').origin
    const officialUrl = new URL('/', siteOrigin).href
    const englishUrl = new URL('/en', siteOrigin).href
    const canonicalUrl = locale === 'en' ? englishUrl : officialUrl
    const language = locale === 'en' ? 'en' : 'zh-Hant-TW'
    const previousTitle = document.title
    const previousLanguage = document.documentElement.lang
    const restoreHead: Array<() => void> = []

    function updateHead(tag: 'meta' | 'link', selector: string, attributes: Record<string, string>) {
      const existing = document.head.querySelector(selector)
      const element = existing ?? document.createElement(tag)
      const previous = Object.keys(attributes).map((name) => [name, element.getAttribute(name)] as const)
      for (const [name, value] of Object.entries(attributes)) {
        element.setAttribute(name, value)
      }
      if (!existing) document.head.appendChild(element)
      restoreHead.push(() => {
        if (!existing) {
          element.remove()
          return
        }
        for (const [name, value] of previous) {
          if (value === null) element.removeAttribute(name)
          else element.setAttribute(name, value)
        }
      })
    }

    document.title = meta.title
    document.documentElement.lang = language
    updateHead('meta', 'meta[name="description"]', { name: 'description', content: meta.description })
    updateHead('meta', 'meta[property="og:title"]', { property: 'og:title', content: meta.ogTitle })
    updateHead('meta', 'meta[property="og:description"]', { property: 'og:description', content: meta.ogDescription })
    updateHead('meta', 'meta[property="og:url"]', { property: 'og:url', content: canonicalUrl })
    updateHead('meta', 'meta[property="og:image"]', { property: 'og:image', content: new URL(meta.ogImage, siteOrigin).href })
    updateHead('meta', 'meta[property="og:image:alt"]', { property: 'og:image:alt', content: meta.ogImageAlt })
    updateHead('meta', 'meta[property="og:locale"]', { property: 'og:locale', content: meta.ogLocale })
    updateHead('link', 'link[rel="canonical"]', { rel: 'canonical', href: canonicalUrl })
    for (const [hreflang, href] of [['zh-Hant-TW', officialUrl], ['en', englishUrl], ['x-default', officialUrl]]) {
      updateHead('link', `link[rel="alternate"][hreflang="${hreflang}"]`, { rel: 'alternate', hreflang, href })
    }
    for (const origin of OFFICIAL_FONT_ORIGINS) {
      const attributes: Record<string, string> = { rel: 'preconnect', href: origin }
      // Font files are fetched with CORS; the stylesheet itself is not.
      if (origin.includes('gstatic')) attributes.crossorigin = ''
      updateHead('link', `link[rel="preconnect"][href="${origin}"]`, attributes)
    }
    for (const href of officialFontStylesheets(locale)) {
      // Font URLs are percent-encoded and contain no quotes, so they are safe inside the selector.
      updateHead('link', `link[rel="stylesheet"][href="${href}"]`, { rel: 'stylesheet', href })
    }

    for (const script of document.head.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')) {
      const previous = script.textContent
      let data: Record<string, unknown>
      try {
        data = JSON.parse(previous ?? '{}')
      } catch {
        continue
      }
      if (!data || typeof data !== 'object') continue
      const nodes = Array.isArray(data['@graph']) ? data['@graph'] : [data]
      for (const node of nodes) {
        if (!node || typeof node !== 'object') continue
        if (node['@type'] === 'Organization') node.url = officialUrl
        if (node['@type'] === 'WebSite' || node['@type'] === 'WebPage') {
          node.url = canonicalUrl
          node.inLanguage = language
        }
      }
      script.textContent = JSON.stringify(data).replaceAll('<', '\\u003c')
      restoreHead.push(() => { script.textContent = previous })
    }

    return () => {
      document.title = previousTitle
      document.documentElement.lang = previousLanguage
      for (const restore of restoreHead) restore()
    }
  }, [locale])
}
