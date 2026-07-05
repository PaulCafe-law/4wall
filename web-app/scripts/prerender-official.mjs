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

const structuredData = {
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

function ensureHeroPreload(html) {
  const preload = '<link rel="preload" as="image" href="/official-assets/hero-field-ai.webp" fetchpriority="high" />'
  if (html.includes(preload)) {
    return html
  }
  return html.replace('</head>', `    ${preload}\n  </head>`)
}

function ensureStructuredData(html) {
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

async function renderOfficialPage() {
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

    return renderToString(React.createElement(OfficialSitePage))
  } finally {
    await vite.close()
  }
}

const template = await readFile(path.join(distDir, 'index.html'), 'utf8')
const rendered = await renderOfficialPage()
let officialHtml = template.replace('<div id="root"></div>', `<div id="root">${rendered}</div>`)
officialHtml = officialHtml.replace('<html lang="en">', '<html lang="zh-Hant-TW">')
officialHtml = ensureCanonical(officialHtml)
officialHtml = ensureStructuredData(officialHtml)
officialHtml = ensureHeroPreload(officialHtml)

await mkdir(officialDir, { recursive: true })
await writeFile(path.join(officialDir, 'index.html'), officialHtml, 'utf8')

console.log(`Prerendered ${officialUrl} to dist/official/index.html`)
