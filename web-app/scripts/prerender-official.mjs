import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import React from 'react'
import { renderToString } from 'react-dom/server'
import { createServer as createViteServer } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const distDir = path.join(rootDir, 'dist')
const officialDir = path.join(distDir, 'official')
const siteOrigin = process.env.VITE_PUBLIC_SITE_ORIGIN || 'https://4wall.io'
const officialUrl = `${siteOrigin}/official`

const zhStructuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      name: '4WALL AI（第四面牆）',
      url: officialUrl,
      email: '4wallaitech@gmail.com',
      description:
        '4WALL AI 協助工廠匯出並整合機台資料，透過地端 AI 分析設備與生產狀態，提升稼動率、協助最佳化排程，並建立可追溯的產品履歷。',
      address: {
        '@type': 'PostalAddress',
        addressLocality: '台南市',
        addressCountry: 'TW',
      },
    },
    {
      '@type': 'WebSite',
      name: '4WALL AI（第四面牆）',
      url: officialUrl,
      inLanguage: 'zh-Hant-TW',
    },
    {
      '@type': 'Service',
      name: '4WALL AI 工廠地端 AI 與機台資料整合',
      provider: { '@type': 'Organization', name: '4WALL AI（第四面牆）' },
      serviceType: '機台資料整合、工廠地端 AI、生產狀態分析、異常事件追蹤與產品履歷',
      areaServed: 'Taiwan',
    },
  ],
}

const enStructuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      name: '第四面牆 4WALL AI',
      url: officialUrl,
      email: '4wallaitech@gmail.com',
      description:
        '第四面牆 AI 是工廠與工地的空間智慧平台：3D 鏡像工廠（Digital Twin）、AI 儀表與派工單判讀、異常事件追蹤與 LINE 通報。',
      address: {
        '@type': 'PostalAddress',
        addressLocality: '台南市',
        addressCountry: 'TW',
      },
    },
    {
      '@type': 'WebSite',
      name: '第四面牆 AI',
      url: officialUrl,
      inLanguage: 'zh-Hant-TW',
    },
    {
      '@type': 'Service',
      name: '第四面牆 AI 空間智慧平台',
      provider: { '@type': 'Organization', name: '第四面牆 4WALL AI' },
      serviceType: '工廠 3D 鏡像（Digital Twin）現場管理、AI 儀表與派工單判讀、異常事件追蹤、LINE 通報',
      areaServed: 'Taiwan',
    },
  ],
}

function escapeScriptJson(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c')
}

function ensureCanonical(html) {
  const canonical = `<link rel="canonical" href="${officialUrl}" />`
  if (html.includes('rel="canonical"')) {
    return html.replace(/<link rel="canonical" href="[^"]*" \/>/, canonical)
  }
  return html.replace('</head>', `    ${canonical}\n  </head>`)
}

function ensureHeroPreload(html, imagePath) {
  const preload = `<link rel="preload" as="image" href="${imagePath}" fetchpriority="high" />`
  if (html.includes(preload)) {
    return html
  }
  return html.replace('</head>', `    ${preload}\n  </head>`)
}

function ensureStructuredData(html, structuredData) {
  const marker = '<script type="application/ld+json">'
  const script = `    <script type="application/ld+json">${escapeScriptJson(structuredData)}</script>`
  if (html.includes(marker)) {
    return html.replace(
      /    <script type="application\/ld\+json">[\s\S]*?<\/script>/,
      script,
    )
  }
  return html.replace('</head>', `${script}\n  </head>`)
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

    return {
      zh: renderToString(React.createElement(OfficialSitePage, { locale: 'zh' })),
      en: renderToString(React.createElement(OfficialSitePage, { locale: 'en' })),
      content: officialContent,
    }
  } finally {
    await vite.close()
  }
}

function ensureHreflang(html, canonicalUrl) {
  const links = [
    `<link rel="alternate" hreflang="zh-Hant-TW" href="${officialUrl}" />`,
    `<link rel="alternate" hreflang="en" href="${officialUrl}/en" />`,
    `<link rel="alternate" hreflang="x-default" href="${officialUrl}" />`,
  ].join('\n    ')
  let out = html.replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${canonicalUrl}" />`)
  if (!out.includes('hreflang')) {
    out = out.replace('</head>', `    ${links}\n  </head>`)
  }
  return out
}

function applyLocaleMeta(html, meta) {
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${meta.title}</title>`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${meta.description}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${meta.title}$2`)
    .replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/s, `$1${meta.description}$2`)
}

function applySocialImage(html, imageUrl) {
  return html.replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${imageUrl}$2`)
}

const template = await readFile(path.join(distDir, 'index.html'), 'utf8')
const { zh, en, content } = await renderOfficialPages()

let zhHtml = template.replace('<div id="root"></div>', `<div id="root">${zh}</div>`)
zhHtml = zhHtml.replace('<html lang="en">', '<html lang="zh-Hant-TW">')
zhHtml = applyLocaleMeta(zhHtml, content.zh.meta)
zhHtml = ensureCanonical(zhHtml)
zhHtml = applySocialImage(zhHtml, `${siteOrigin}/official-assets/factory-floor-live.webp`)
zhHtml = ensureStructuredData(zhHtml, zhStructuredData)
zhHtml = ensureHeroPreload(zhHtml, '/official-assets/factory-floor-live.webp')
zhHtml = ensureHreflang(zhHtml, officialUrl)

let enHtml = template.replace('<div id="root"></div>', `<div id="root">${en}</div>`)
enHtml = enHtml.replace('<html lang="zh-Hant-TW">', '<html lang="en">')
enHtml = applyLocaleMeta(enHtml, content.en.meta)
enHtml = enHtml.replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${officialUrl}/en$2`)
enHtml = applySocialImage(enHtml, `${siteOrigin}/official-assets/hero-field-ai.jpg`)
enHtml = ensureStructuredData(enHtml, enStructuredData)
enHtml = ensureHeroPreload(enHtml, '/official-assets/warroom-live.webp')
enHtml = ensureHreflang(enHtml, `${officialUrl}/en`)

await mkdir(path.join(officialDir, 'en'), { recursive: true })
await writeFile(path.join(officialDir, 'index.html'), zhHtml, 'utf8')
await writeFile(path.join(officialDir, 'en', 'index.html'), enHtml, 'utf8')

console.log(`Prerendered ${officialUrl} and ${officialUrl}/en`)
