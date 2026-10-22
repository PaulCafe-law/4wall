import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'

import { OFFICIAL_CONFIG } from '../officialConfig'
import { MAILTO_EMAIL, mailtoDemo, type OfficialCopy, type OfficialLocale } from '../officialContent'
import { LayersMark } from '../motion/primitives'
import { useHydrated } from './hooks'

export function Brand({ t, className = '' }: { t: OfficialCopy; className?: string }) {
  return (
    <a className={`ow-brand ${className}`} href="#top" aria-label={t.nav.homeAria}>
      <LayersMark />
      <span className="ow-brand__word">4WALL AI</span>
    </a>
  )
}

type CtaKind = 'demo' | 'start'

export function CtaButton({
  kind,
  t,
  locale,
  emphasis,
  className = '',
  compact = false,
}: {
  kind: CtaKind
  t: OfficialCopy
  locale: OfficialLocale
  emphasis?: 'primary' | 'secondary'
  className?: string
  compact?: boolean
}) {
  const style = emphasis ?? (OFFICIAL_CONFIG.PRIMARY_CTA === kind ? 'primary' : 'secondary')
  const classes = `ow-btn ow-btn--${style}${compact ? ' ow-btn--compact' : ''} ${className}`
  if (kind === 'start') {
    return (
      <a className={classes} href={OFFICIAL_CONFIG.PLATFORM_URL} rel="nofollow" aria-label={t.cta.startAria}>
        {t.cta.start}
      </a>
    )
  }
  return (
    <a className={classes} href={mailtoDemo(locale)} aria-label={t.cta.demoAria}>
      {t.cta.demo}
    </a>
  )
}

/** Both CTAs in the order the flag asks for: primary first (hero/dock) or last (nav). */
export function CtaPair({
  t,
  locale,
  primaryFirst,
  className = '',
}: {
  t: OfficialCopy
  locale: OfficialLocale
  primaryFirst: boolean
  className?: string
}) {
  const primary = OFFICIAL_CONFIG.PRIMARY_CTA
  const secondary: CtaKind = primary === 'demo' ? 'start' : 'demo'
  const order: CtaKind[] = primaryFirst ? [primary, secondary] : [secondary, primary]
  return (
    <div className={`ow-cta-pair ${className}`}>
      {order.map((kind) => (
        <CtaButton key={kind} kind={kind} t={t} locale={locale} />
      ))}
    </div>
  )
}

/** Copy-to-clipboard button; hidden until hydrated so the no-JS page never shows a dead control. */
export function CopyEmail({ t, className = '' }: { t: OfficialCopy; className?: string }) {
  const hydrated = useHydrated()
  const [done, setDone] = useState(false)
  const [live, setLive] = useState('')
  const timer = useRef(0)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function copy(event: MouseEvent<HTMLButtonElement>) {
    // React clears currentTarget once the handler returns, so keep it across the await.
    const button = event.currentTarget
    let ok = false
    try {
      await navigator.clipboard.writeText(OFFICIAL_CONFIG.CONTACT_EMAIL)
      ok = true
    } catch {
      const node = button.previousElementSibling
      const selection = window.getSelection()
      if (node && selection) {
        const range = document.createRange()
        range.selectNodeContents(node)
        selection.removeAllRanges()
        selection.addRange(range)
      }
    }
    if (ok) {
      setDone(true)
      setLive(t.copyEmail.live)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        setDone(false)
        setLive('')
      }, 2000)
    }
  }

  return (
    <>
      <button type="button" className={`ow-copy ${className}`} hidden={!hydrated} aria-label={t.copyEmail.aria} onClick={copy}>
        {done ? t.copyEmail.done : t.copyEmail.label}
      </button>
      <span className="ow-sr" aria-live="polite">
        {live}
      </span>
    </>
  )
}

/** Email address as a mailto link, followed by the copy button. */
export function EmailLine({ t, className = '' }: { t: OfficialCopy; className?: string }) {
  return (
    <span className={`ow-email ${className}`}>
      <a href={MAILTO_EMAIL}>{OFFICIAL_CONFIG.CONTACT_EMAIL}</a>
      <CopyEmail t={t} />
    </span>
  )
}

/** Renders `{text}` as a demo mailto link and `{text|email}` as a contact mailto link. */
export function RichText({ text, locale }: { text: string; locale: OfficialLocale }) {
  const parts: ReactNode[] = []
  const pattern = /\{([^}|]+)(?:\|(email))?\}/g
  let last = 0
  let match: RegExpExecArray | null
  let i = 0
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    const href = match[2] === 'email' ? MAILTO_EMAIL : mailtoDemo(locale)
    parts.push(
      <a key={i} className="ow-inline-link" href={href}>
        {match[1]}
      </a>,
    )
    i += 1
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

export function Stamp({ children, tone = 'ochre', className = '' }: { children: ReactNode; tone?: 'ochre' | 'teal'; className?: string }) {
  return <span className={`ow-stamp ow-stamp--${tone} ${className}`}>{children}</span>
}

/** Warehouse paperwork: black title bar, ink border, hard shadow. */
export function RetroTicket({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={`ow-ticket ${className}`}>
      <div className="ow-ticket__bar">{title}</div>
      <div className="ow-ticket__body">{children}</div>
    </div>
  )
}

export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`ow-eyebrow ${className}`}>{children}</p>
}
