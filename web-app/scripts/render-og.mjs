// Renders the Open Graph cards public/official-assets/og-4wall-warehouse-{zh,en}.png
// (1200×630) from the same content and floor model as the website.
// Run manually after changing the headline: `node scripts/render-og.mjs`.

import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from '@playwright/test'
import { createServer as createViteServer } from 'vite'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const vite = await createViteServer({
  root: rootDir,
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true },
  appType: 'custom',
})

let content
let iso
let fonts
try {
  ;({ officialContent: content } = await vite.ssrLoadModule('/src/features/official/officialContent.ts'))
  const model = await vite.ssrLoadModule('/src/features/official/motion/floorModel.ts')
  iso = model.posterIsoSVG(model.buildFloorModel('mobile'))
  fonts = await vite.ssrLoadModule('/src/features/official/officialFonts.ts')
} finally {
  await vite.close()
}

const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')

function card(locale) {
  const t = content[locale]
  const lines = t.hero.h1
    .map((line) =>
      line.map((run) => (run.accent ? `<em>${escape(run.text)}</em>` : escape(run.text))).join(''),
    )
    .map((line) => `<span>${line}</span>`)
    .join(locale === 'zh' ? '<br>' : '')
  const links = fonts.officialFontStylesheets(locale).map((href) => `<link rel="stylesheet" href="${escape(href)}">`).join('')
  return `<!doctype html><html lang="${locale === 'en' ? 'en' : 'zh-Hant-TW'}"><head><meta charset="utf-8">${links}
<style>
  *{box-sizing:border-box;margin:0}
  body{width:1200px;height:630px;overflow:hidden;font-family:Inter,'Noto Sans TC',sans-serif;color:#111;
    background:linear-gradient(#e3e6e6 1px,transparent 1px) 0 0/24px 24px,linear-gradient(90deg,#e3e6e6 1px,transparent 1px) 0 0/24px 24px,#f3f4f4}
  .brand{position:absolute;left:64px;top:56px;display:flex;align-items:center;gap:10px;font-weight:700;font-size:28px;letter-spacing:-.04em}
  .brand svg{width:30px;height:30px}
  .eyebrow{position:absolute;left:64px;top:132px;font-family:'JetBrains Mono',monospace;font-size:20px;color:#08766c;letter-spacing:.06em}
  h1{position:absolute;left:64px;top:176px;width:${locale === 'zh' ? 640 : 600}px;font-weight:${locale === 'zh' ? 900 : 800};
    font-family:${locale === 'zh' ? "'Noto Sans TC'" : 'Inter'},sans-serif;font-size:${locale === 'zh' ? 64 : 72}px;line-height:${locale === 'zh' ? 1.12 : 0.98};letter-spacing:${locale === 'zh' ? '-0.02em' : '-0.045em'}}
  h1 span{white-space:${locale === 'zh' ? 'nowrap' : 'normal'}}
  em{font-style:normal;color:#08766c;${locale === 'zh' ? "font-family:'Noto Serif TC',serif;" : ''}box-shadow:inset 0 -0.12em #08766c}
  .plan{position:absolute;right:8px;top:56px;width:520px;height:500px}
  .stamp{position:absolute;right:48px;bottom:40px;font-family:'JetBrains Mono',monospace;font-weight:700;font-size:18px;color:#08766c;background:#ecf6f4;border:1px solid #b9ddd7;border-radius:4px;padding:4px 10px}
  .url{position:absolute;left:64px;bottom:48px;font-family:'JetBrains Mono',monospace;font-size:20px;color:#5b616b}
</style></head><body>
<div class="brand"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 12 12 17 22 12"/><polyline points="2 17 12 22 22 17"/></svg>4WALL AI</div>
<p class="eyebrow">${escape(t.meta.ogImageText.eyebrow)}</p>
<h1>${lines}</h1>
<svg class="plan" viewBox="${iso.viewBox}" preserveAspectRatio="xMidYMid meet">${iso.markup}</svg>
<span class="stamp">${escape(t.meta.ogImageText.stamp)}</span>
<p class="url">www.4wall.io</p>
</body></html>`
}

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
  for (const locale of ['zh', 'en']) {
    await page.setContent(card(locale), { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)
    const out = path.join(rootDir, 'public', 'official-assets', `og-4wall-warehouse-${locale}.png`)
    await page.screenshot({ path: out, type: 'png' })
    console.log(`Wrote ${path.relative(rootDir, out)}`)
  }
} finally {
  await browser.close()
}
