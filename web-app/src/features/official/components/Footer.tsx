import { OFFICIAL_CONFIG } from '../officialConfig'
import { mailtoDemo, type OfficialCopy, type OfficialLocale } from '../officialContent'
import { LayersMark } from '../motion/primitives'
import { EmailLine } from './shared'

export function Footer({ t, locale, basePath }: { t: OfficialCopy; locale: OfficialLocale; basePath: '' | '/official' }) {
  const zhHref = basePath || '/'
  const enHref = `${basePath}/en`
  return (
    <footer className="ow-footer">
      <div className="ow-container ow-footer__grid">
        <div className="ow-footer__brand">
          <a className="ow-brand" href="#top" aria-label={t.nav.homeAria}>
            <LayersMark />
            <span className="ow-brand__word">4WALL AI</span>
          </a>
          <p className="ow-footer__tagline">{t.footer.tagline}</p>
          <p className="ow-footer__company">{t.footer.company}</p>
        </div>
        <nav className="ow-footer__cols" aria-label={t.footer.navLabel}>
          <div>
            <p className="ow-footer__col-title ow-mono">{t.footer.colSite}</p>
            <ul>
              {t.footer.siteLinks.map((link) => (
                <li key={link.href}>
                  <a href={link.href}>{link.label}</a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="ow-footer__col-title ow-mono">{t.footer.colPlatform}</p>
            <ul>
              <li>
                <a href={OFFICIAL_CONFIG.PLATFORM_URL} rel="nofollow" aria-label={t.cta.loginAria}>
                  {t.cta.loginLong}
                </a>
              </li>
              <li>
                <a href={OFFICIAL_CONFIG.PLATFORM_URL} rel="nofollow" aria-label={t.cta.startAria}>
                  {t.cta.start}
                </a>
              </li>
            </ul>
          </div>
          <div>
            <p className="ow-footer__col-title ow-mono">{t.footer.colContact}</p>
            <ul>
              <li>
                <EmailLine t={t} />
              </li>
              <li>
                <a href={mailtoDemo(locale)} aria-label={t.cta.demoAria}>
                  {t.cta.demo}
                </a>
              </li>
            </ul>
          </div>
          <div>
            <p className="ow-footer__col-title ow-mono">{t.footer.colLanguage}</p>
            <ul>
              <li>
                <a href={zhHref} hrefLang="zh-Hant-TW" lang="zh-Hant-TW" aria-current={locale === 'zh' ? 'page' : undefined}>
                  {t.footer.languages.zh}
                </a>
              </li>
              <li>
                <a href={enHref} hrefLang="en" lang="en" aria-current={locale === 'en' ? 'page' : undefined}>
                  {t.footer.languages.en}
                </a>
              </li>
            </ul>
          </div>
        </nav>
      </div>
      <div className="ow-container ow-footer__bottom">
        <p className="ow-footer__disclaimer">{t.footer.disclaimer}</p>
        <p className="ow-footer__copy">{t.footer.copyright}</p>
      </div>
    </footer>
  )
}
