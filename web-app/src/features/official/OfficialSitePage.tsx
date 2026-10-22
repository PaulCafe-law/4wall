import './official.css'

import { Dock } from './components/Dock'
import { Faq } from './components/Faq'
import { FlowStage } from './components/FlowStage'
import { Footer } from './components/Footer'
import { HowWeWork } from './components/HowWeWork'
import { Nav } from './components/Nav'
import { SafetyBoard } from './components/SafetyBoard'
import { SpecBand } from './components/SpecBand'
import { Toast } from './components/Toast'
import { Toolkit } from './components/Toolkit'
import { officialContent, type OfficialLocale } from './officialContent'
import { useOfficialSiteMeta } from './useOfficialSiteMeta'

/**
 * www.4wall.io (zh at `/`, en at `/en`). Rendered to static HTML at build time
 * and hydrated by src/official/main.tsx; on SPA hosts it is mounted at
 * `/official` by the platform router. It must not use react-router or touch
 * `window` during render.
 */
export function OfficialSitePage({ locale = 'zh', basePath = '' }: { locale?: OfficialLocale; basePath?: '' | '/official' }) {
  const t = officialContent[locale]
  useOfficialSiteMeta(locale)

  return (
    <div className={`ow-root ow-root--${locale}`} lang={locale === 'en' ? 'en' : 'zh-Hant-TW'}>
      <a className="ow-skip" href="#main">
        {t.skip}
      </a>
      <Nav t={t} locale={locale} basePath={basePath} />
      <main id="main">
        <FlowStage t={t} locale={locale} />
        <SpecBand t={t} />
        <SafetyBoard t={t} />
        <Toolkit t={t} />
        <HowWeWork t={t} locale={locale} />
        <Faq t={t} locale={locale} />
        <Dock t={t} locale={locale} />
      </main>
      <Footer t={t} locale={locale} basePath={basePath} />
      <Toast t={t} locale={locale} />
    </div>
  )
}
