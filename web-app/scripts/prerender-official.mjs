import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import React from 'react'
import { renderToString } from 'react-dom/server'
import { createServer as createViteServer } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const distDir = path.join(rootDir, 'dist')
const officialDir = path.join(distDir, 'official')
const siteOrigin = new URL(process.env.VITE_PUBLIC_SITE_ORIGIN || 'https://www.4wall.io').origin
const officialUrl = new URL('/', siteOrigin).href
const englishUrl = new URL('/en', siteOrigin).href

// Structured data is built from officialContent so the copy lives in one place.
function buildStructuredData(meta, locale) {
  const pageUrl = locale === 'en' ? englishUrl : officialUrl
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: locale === 'en' ? '4WALL AI' : '4WALL AI（第四面牆）',
        alternateName: locale === 'en' ? ['第四面牆'] : ['4WALL AI', '第四面牆'],
        url: officialUrl,
        email: 'admin@4wall.io',
        description: meta.organizationDescription,
        address: {
          '@type': 'PostalAddress',
          addressLocality: locale === 'en' ? 'Tainan' : '台南市',
          addressCountry: 'TW',
        },
      },
      {
        '@type': 'WebSite',
        name: '4WALL AI',
        url: pageUrl,
        inLanguage: locale === 'en' ? 'en' : 'zh-Hant-TW',
      },
      {
        '@type': 'Service',
        name: meta.serviceName,
        provider: { '@type': 'Organization', name: '4WALL AI', url: officialUrl },
        serviceType: meta.serviceType,
        description: meta.serviceDescription,
        areaServed: 'TW',
      },
    ],
  }
}

function escapeScriptJson(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c')
}

function escapeAttribute(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
}

function escapeText(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
}

function ensureCanonical(html, canonicalUrl) {
  const canonical = `<link rel="canonical" href="${canonicalUrl}" />`
  if (html.includes('rel="canonical"')) {
    return html.replace(/<link rel="canonical" href="[^"]*" \/>/, () => canonical)
  }
  return html.replace('</head>', () => `    ${canonical}\n  </head>`)
}

function ensureFonts(html, stylesheets, origins) {
  const links = [
    ...origins.map((origin) =>
      origin.includes('gstatic')
        ? `<link rel="preconnect" href="${origin}" crossorigin />`
        : `<link rel="preconnect" href="${origin}" />`,
    ),
    ...stylesheets.map((href) => `<link rel="stylesheet" href="${escapeAttribute(href)}" />`),
  ]
  const missing = links.filter((link) => !html.includes(link))
  if (!missing.length) return html
  return html.replace('</head>', () => `    ${missing.join('\n    ')}\n  </head>`)
}

function ensureStructuredData(html, structuredData) {
  const marker = '<script type="application/ld+json">'
  const script = `    <script type="application/ld+json">${escapeScriptJson(structuredData)}</script>`
  if (html.includes(marker)) {
    return html.replace(/    <script type="application\/ld\+json">[\s\S]*?<\/script>/, () => script)
  }
  return html.replace('</head>', () => `${script}\n  </head>`)
}

async function renderOfficialPages() {
  const vite = await createViteServer({
    root: rootDir,
    logLevel: 'error',
    resolve: {
      alias: {
        'react-router-dom': path.join(__dirname, 'ssr-react-router-dom-stub.mjs'),
      },
    },
    optimizeDeps: {
      noDiscovery: true,
    },
    server: { middlewareMode: true },
    appType: 'custom',
  })

  try {
    const { OfficialSitePage } = await vite.ssrLoadModule('/src/features/official/OfficialSitePage.tsx')
    const { officialContent } = await vite.ssrLoadModule('/src/features/official/officialContent.ts')
    const fonts = await vite.ssrLoadModule('/src/features/official/officialFonts.ts')
    const text = await vite.ssrLoadModule('/src/features/official/officialText.ts')

    return {
      zh: renderToString(React.createElement(OfficialSitePage, { locale: 'zh' })),
      en: renderToString(React.createElement(OfficialSitePage, { locale: 'en' })),
      content: officialContent,
      fonts: {
        zh: fonts.officialFontStylesheets('zh'),
        en: fonts.officialFontStylesheets('en'),
        origins: [...fonts.OFFICIAL_FONT_ORIGINS],
      },
      crawlerText: { markdown: text.buildOfficialMarkdown(), llms: text.buildLlmsTxt() },
    }
  } finally {
    await vite.close()
  }
}

function ensureHreflang(html) {
  const links = [
    `<link rel="alternate" hreflang="zh-Hant-TW" href="${officialUrl}" />`,
    `<link rel="alternate" hreflang="en" href="${englishUrl}" />`,
    `<link rel="alternate" hreflang="x-default" href="${officialUrl}" />`,
  ].join('\n    ')
  const out = html.replace(/<link\b[^>]*\bhreflang="[^"]*"[^>]*>/g, '')
  return out.replace('</head>', () => `    ${links}\n  </head>`)
}

// Function replacers keep `$` sequences in copy from being treated as patterns.
function applyLocaleMeta(html, meta) {
  const title = escapeText(meta.title)
  const description = escapeAttribute(meta.description)
  const ogTitle = escapeAttribute(meta.ogTitle)
  const ogDescription = escapeAttribute(meta.ogDescription)
  const attr = (pattern, value) => (input) => input.replace(pattern, (_, a, b) => `${a}${value}${b}`)
  return [
    (input) => input.replace(/<title>[^<]*<\/title>/, () => `<title>${title}</title>`),
    attr(/(<meta\s+name="description"\s+content=")[^"]*(")/, description),
    attr(/(<meta property="og:title" content=")[^"]*(")/, ogTitle),
    attr(/(<meta\s+property="og:description"\s+content=")[^"]*(")/s, ogDescription),
    attr(/(<meta property="og:image:alt" content=")[^"]*(")/, escapeAttribute(meta.ogImageAlt)),
    attr(/(<meta property="og:locale" content=")[^"]*(")/, meta.ogLocale),
    attr(/(<meta property="og:locale:alternate" content=")[^"]*(")/, meta.ogLocaleAlternate),
  ].reduce((out, step) => step(out), html)
}

function applySocialImage(html, imageUrl) {
  return html.replace(/(<meta property="og:image" content=")[^"]*(")/, (_, a, b) => `${a}${imageUrl}${b}`)
}

function applySocialUrl(html, canonicalUrl) {
  return html.replace(/(<meta property="og:url" content=")[^"]*(")/, (_, a, b) => `${a}${canonicalUrl}${b}`)
}

// official.html is the standalone www entry built by Vite (see vite.config.ts).
const templatePath = path.join(distDir, 'official.html')
const template = await readFile(templatePath, 'utf8')
const { zh, en, content, fonts, crawlerText } = await renderOfficialPages()

function buildPage(markup, locale) {
  const meta = content[locale].meta
  const canonicalUrl = locale === 'en' ? englishUrl : officialUrl
  let html = template.replace('<div id="root"></div>', () => `<div id="root">${markup}</div>`)
  html =
    locale === 'en'
      ? html.replace('<html lang="zh-Hant-TW">', '<html lang="en">')
      : html.replace('<html lang="en">', '<html lang="zh-Hant-TW">')
  html = applyLocaleMeta(html, meta)
  html = ensureCanonical(html, canonicalUrl)
  html = applySocialUrl(html, canonicalUrl)
  html = applySocialImage(html, `${siteOrigin}${meta.ogImage}`)
  html = ensureStructuredData(html, buildStructuredData(meta, locale))
  html = ensureFonts(html, fonts[locale], fonts.origins)
  html = ensureHreflang(html)
  return html
}

await mkdir(path.join(officialDir, 'en'), { recursive: true })
await writeFile(path.join(officialDir, 'index.html'), buildPage(zh, 'zh'), 'utf8')
await writeFile(path.join(officialDir, 'en', 'index.html'), buildPage(en, 'en'), 'utf8')
// Crawler text is generated from the same content module as the pages.
await writeFile(path.join(distDir, 'official.md'), crawlerText.markdown, 'utf8')
await writeFile(path.join(distDir, 'llms.txt'), crawlerText.llms, 'utf8')
// The unfilled template must not be reachable as /official.html.
await rm(templatePath)

console.log(`Prerendered ${officialUrl} and ${englishUrl}`)
