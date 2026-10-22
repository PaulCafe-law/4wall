import { useEffect, useRef, useState } from 'react'

import { mailtoDemo, type OfficialCopy, type OfficialLocale } from '../officialContent'
import { prefersReducedMotion } from '../motion/scheduler'
import { ScrambleText } from '../motion/textEffects'
import { useHydrated } from './hooks'

const DISMISS_KEY = 'ow-toast-dismissed'

type Context = 'default' | 'flowEarly' | 'chat' | 'sim' | 'board' | 'faq'

const SECTION_CONTEXT: Array<[string, Context]> = [
  ['#step-01', 'flowEarly'],
  ['#step-02', 'flowEarly'],
  ['#step-03', 'chat'],
  ['#step-04', 'sim'],
  ['#step-05', 'sim'],
  ['#step-06', 'sim'],
  ['#numbers', 'board'],
  ['#faq', 'faq'],
]

function readDismissed() {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

/** Client-only notice pill; returns null until hydrated so SSR and hydration match. */
export function Toast({ t, locale }: { t: OfficialCopy; locale: OfficialLocale }) {
  const hydrated = useHydrated()
  const [dismissed, setDismissed] = useState(false)
  const [visible, setVisible] = useState(false)
  const [hiddenByFooter, setHiddenByFooter] = useState(false)
  const [context, setContext] = useState<Context>('default')
  const [narrow, setNarrow] = useState(false)
  const shown = useRef(false)

  useEffect(() => {
    if (!hydrated) return undefined
    const timers: number[] = []
    const show = () => {
      if (shown.current || readDismissed()) return
      shown.current = true
      setVisible(true)
    }
    timers.push(window.setTimeout(show, 2500))
    const onScroll = () => {
      const hero = document.getElementById('top')
      if (hero && window.scrollY > hero.offsetHeight / 2) show()
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    const media = window.matchMedia?.('(max-width: 399px)')
    const onMedia = () => setNarrow(media?.matches === true)
    timers.push(window.setTimeout(onMedia, 0))
    media?.addEventListener('change', onMedia)

    let io: IntersectionObserver | null = null
    let footerIo: IntersectionObserver | null = null
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue
            const match = SECTION_CONTEXT.find(([selector]) => selector === `#${entry.target.id}`)
            if (match) setContext(match[1])
          }
        },
        { rootMargin: '-45% 0px -50% 0px' },
      )
      for (const [selector] of SECTION_CONTEXT) {
        const el = document.querySelector(selector)
        if (el) io.observe(el)
      }
      const hiders = [document.getElementById('contact'), document.querySelector('.ow-footer')].filter(Boolean) as Element[]
      const intersecting = new Set<Element>()
      footerIo = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) intersecting.add(entry.target)
          else intersecting.delete(entry.target)
        }
        setHiddenByFooter(intersecting.size > 0)
      })
      for (const el of hiders) footerIo.observe(el)
    }
    return () => {
      timers.forEach((id) => window.clearTimeout(id))
      window.removeEventListener('scroll', onScroll)
      media?.removeEventListener('change', onMedia)
      io?.disconnect()
      footerIo?.disconnect()
    }
  }, [hydrated])

  if (!hydrated || dismissed || !visible) return null

  const line = narrow ? t.toast.short : t.toast[context]

  function dismiss() {
    setDismissed(true)
    try {
      window.sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // storage blocked; the toast stays dismissed for this page view
    }
  }

  return (
    <aside
      className={`ow-toast${hiddenByFooter ? ' is-hidden' : ''}${prefersReducedMotion() ? '' : ' is-animated'}`}
      aria-label={t.toast.label}
      aria-live="off"
      inert={hiddenByFooter}
    >
      <span className="ow-toast__dot" aria-hidden="true" />
      <ScrambleText key={line} className="ow-toast__line" text={line} speed={1.2} />
      <a className="ow-toast__cta" href={mailtoDemo(locale)}>
        {t.toast.cta}
      </a>
      <button type="button" className="ow-toast__close" onClick={dismiss} aria-label={t.toast.close}>
        ✕
      </button>
    </aside>
  )
}
