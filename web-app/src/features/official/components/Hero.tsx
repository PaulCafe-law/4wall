import { Fragment, useEffect, useRef } from 'react'

import type { OfficialCopy, OfficialLocale } from '../officialContent'
import { CtaPair, EmailLine, Eyebrow } from './shared'

export function Hero({ t, locale }: { t: OfficialCopy; locale: OfficialLocale }) {
  const cueRef = useRef<HTMLParagraphElement>(null)

  // The scroll cue animates until the first scroll (or four cycles, in CSS).
  useEffect(() => {
    const cue = cueRef.current
    if (!cue) return undefined
    const stop = () => {
      cue.classList.add('is-done')
      window.removeEventListener('scroll', stop)
    }
    window.addEventListener('scroll', stop, { passive: true, once: true })
    return () => window.removeEventListener('scroll', stop)
  }, [])

  const zh = locale === 'zh'

  return (
    <section id="top" data-slot="0" className="ow-hero" aria-labelledby="ow-hero-title">
      <div className="ow-container ow-hero__inner">
        <Eyebrow className="ow-eyebrow--mono">{t.hero.eyebrow}</Eyebrow>
        <h1 id="ow-hero-title" className={`ow-h1 ${zh ? 'ow-h1--zh' : 'ow-h1--en'}`}>
          {t.hero.h1.map((line, i) => (
            <span key={i} className={zh ? 'ow-ph' : undefined}>
              {/* Plain runs stay bare text nodes so their spaces survive in the accessible name. */}
              {line.map((run, k) =>
                run.accent ? (
                  <em key={k} className="ow-accent">
                    {run.text}
                  </em>
                ) : (
                  <Fragment key={k}>{run.text}</Fragment>
                ),
              )}
              {zh && i < t.hero.h1.length - 1 ? <br /> : null}
            </span>
          ))}
        </h1>
        <p className="ow-hero__sub">{t.hero.sub}</p>
        <p className="ow-hero__note">{t.hero.note}</p>
        <CtaPair t={t} locale={locale} primaryFirst className="ow-hero__ctas" />
        <p className="ow-hero__micro">
          <span>{t.hero.microStart}</span>
          <span className="ow-hero__micro-sep" aria-hidden="true">
            ·
          </span>
          <span>
            {t.hero.microEmail} <EmailLine t={t} />
          </span>
        </p>
        <p ref={cueRef} className="ow-hero__cue">
          <span className="ow-hero__cue-glyph" aria-hidden="true">
            <i>›</i>
            <i>›</i>
            <i>›</i>
          </span>
          {t.hero.scrollCue}
        </p>
      </div>
    </section>
  )
}
