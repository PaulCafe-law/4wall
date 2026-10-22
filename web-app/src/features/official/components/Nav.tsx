import { useEffect, useRef, useState } from 'react'

import { OFFICIAL_CONFIG } from '../officialConfig'
import type { OfficialCopy, OfficialLocale } from '../officialContent'
import { LayersMark } from '../motion/primitives'
import { ScrambleText } from '../motion/textEffects'
import { CtaButton, CtaPair, EmailLine } from './shared'
import { languageHref, useHydrated } from './hooks'

function LanguageLink({ t, href, className = '' }: { t: OfficialCopy; href: string; className?: string }) {
  return (
    <a className={`ow-lang ${className}`} href={href} hrefLang={t.nav.langCode} lang={t.nav.langCode} rel="alternate" title={t.nav.langAria}>
      {t.nav.lang}
    </a>
  )
}

export function Nav({ t, locale, basePath }: { t: OfficialCopy; locale: OfficialLocale; basePath: '' | '/official' }) {
  const hydrated = useHydrated()
  const [open, setOpen] = useState(false)
  const headerRef = useRef<HTMLElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const sheetRef = useRef<HTMLElement>(null)
  const langHref = languageHref(locale, basePath)

  // Background after 24px of scroll and the active-section dot: DOM attributes only.
  useEffect(() => {
    const header = headerRef.current
    if (!header) return undefined
    const onScroll = () => header.toggleAttribute('data-scrolled', window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    let io: IntersectionObserver | null = null
    if (typeof IntersectionObserver !== 'undefined') {
      const links = [...header.querySelectorAll<HTMLAnchorElement>('.ow-nav__links a')]
      io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue
            const id = `#${entry.target.id}`
            const index = links.findIndex((link) => link.getAttribute('href') === id)
            header.style.setProperty('--ow-dot-x', `${index < 0 ? -999 : links[index].offsetLeft + links[index].offsetWidth / 2}px`)
            for (const link of links) {
              if (link.getAttribute('href') === id) link.setAttribute('aria-current', 'location')
              else link.removeAttribute('aria-current')
            }
          }
        },
        { rootMargin: '-45% 0px -50% 0px' },
      )
      for (const link of links) {
        const target = document.querySelector(link.getAttribute('href') ?? '')
        if (target) io.observe(target)
      }
    }
    return () => {
      window.removeEventListener('scroll', onScroll)
      io?.disconnect()
    }
  }, [])

  // A #site-menu fragment (the no-JS link, or a shared URL) opens the dialog once hydrated.
  useEffect(() => {
    if (window.location.hash === '#site-menu') queueMicrotask(() => setOpen(true))
  }, [])

  // Dialog behaviour: Esc closes, focus is trapped, focus returns to the menu button.
  useEffect(() => {
    if (!open) return undefined
    // The sheet only exists below 1024px; crossing the breakpoint (rotation) closes it.
    const desktop = window.matchMedia?.('(min-width: 1024px)')
    const onDesktop = () => {
      if (desktop?.matches) setOpen(false)
    }
    desktop?.addEventListener('change', onDesktop)
    const sheet = sheetRef.current
    const focusables = () => [...(sheet?.querySelectorAll<HTMLElement>('a[href], button:not([hidden])') ?? [])]
    focusables()[0]?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    document.documentElement.classList.add('ow-noscroll')
    const button = menuButtonRef.current
    return () => {
      desktop?.removeEventListener('change', onDesktop)
      document.removeEventListener('keydown', onKey)
      document.documentElement.classList.remove('ow-noscroll')
      button?.focus()
    }
  }, [open])

  const close = () => {
    setOpen(false)
    if (window.location.hash === '#site-menu') {
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
    }
  }

  return (
    <header ref={headerRef} className="ow-nav">
      <div className="ow-nav__inner">
        <a className="ow-brand" href="#top" aria-label={t.nav.homeAria}>
          <LayersMark />
          <ScrambleText className="ow-brand__word" text="4WALL AI" trigger="fonts" />
        </a>
        <nav className="ow-nav__links" aria-label={t.nav.label}>
          {t.nav.items.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
          <span className="ow-nav__dot" aria-hidden="true" />
        </nav>
        <div className="ow-nav__actions">
          <LanguageLink t={t} href={langHref} />
          <a className="ow-nav__login" href={OFFICIAL_CONFIG.PLATFORM_URL} rel="nofollow" aria-label={t.cta.loginAria}>
            {t.cta.login}
          </a>
          <CtaPair t={t} locale={locale} primaryFirst={false} className="ow-nav__ctas" />
          <CtaButton kind={OFFICIAL_CONFIG.PRIMARY_CTA} t={t} locale={locale} compact className="ow-nav__compact" />
          {hydrated ? (
            <button
              ref={menuButtonRef}
              type="button"
              className="ow-nav__menu"
              aria-expanded={open}
              aria-controls="site-menu"
              onClick={() => setOpen(true)}
            >
              {t.nav.menu}
            </button>
          ) : (
            <a className="ow-nav__menu" href="#site-menu">
              {t.nav.menu}
            </a>
          )}
        </div>
      </div>
      <nav
        ref={sheetRef}
        id="site-menu"
        className="ow-sheet"
        data-open={open ? 'true' : undefined}
        aria-label={t.nav.menuLabel}
        role={hydrated ? 'dialog' : undefined}
        aria-modal={hydrated ? true : undefined}
      >
        <div className="ow-sheet__top">
          <span className="ow-brand">
            <LayersMark />
            <span className="ow-brand__word">4WALL AI</span>
          </span>
          {hydrated ? (
            <button type="button" className="ow-sheet__close" onClick={close} aria-label={t.nav.close}>
              ✕
            </button>
          ) : (
            <a className="ow-sheet__close" href="#top" aria-label={t.nav.close}>
              ✕
            </a>
          )}
        </div>
        <ol className="ow-sheet__items">
          {t.nav.items.map((item, i) => (
            <li key={item.href}>
              <a href={item.href} onClick={close}>
                <span className="ow-sheet__num" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                {item.label}
              </a>
            </li>
          ))}
        </ol>
        <div className="ow-sheet__actions">
          <CtaPair t={t} locale={locale} primaryFirst className="ow-sheet__ctas" />
          <a className="ow-sheet__login" href={OFFICIAL_CONFIG.PLATFORM_URL} rel="nofollow" aria-label={t.cta.loginAria}>
            {t.cta.loginLong}
          </a>
          <LanguageLink t={t} href={langHref} />
          <EmailLine t={t} />
        </div>
      </nav>
    </header>
  )
}
