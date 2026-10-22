import { useEffect, useRef, useState } from 'react'

import type { OfficialCopy, OfficialLocale } from '../officialContent'
import { sprayReveal } from '../motion/bayer'
import { clamp01 } from '../motion/ease'
import { addTask, prefersReducedMotion } from '../motion/scheduler'
import { ScrambleText } from '../motion/textEffects'
import { useInViewOnce } from './hooks'
import { CopyEmail, CtaPair, RetroTicket } from './shared'

/** Scroll-driven Bayer band (C2); CSS dot gradient is the no-JS fallback. */
function DitherBand() {
  const bandRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const band = bandRef.current
    const canvas = canvasRef.current
    if (!band || !canvas || typeof IntersectionObserver === 'undefined') return undefined
    let cancelled = false
    let cleanup: () => void = () => {}
    void import('../motion/ditherField').then(({ createScrollDither }) => {
      if (cancelled) return
      const dither = createScrollDither(canvas, { pixel: window.innerWidth < 768 ? 3 : 4 })
      band.setAttribute('data-live', '1')
      const progress = () => {
        const rect = band.getBoundingClientRect()
        return clamp01((window.innerHeight - rect.top) / (window.innerHeight + rect.height))
      }
      if (prefersReducedMotion()) {
        dither.setProgress(0.7)
        cleanup = () => dither.destroy()
        return
      }
      const remove = addTask({ kind: 'scroll', target: band, run: () => dither.setProgress(progress()) })
      cleanup = () => {
        remove()
        dither.destroy()
      }
    })
    return () => {
      cancelled = true
      cleanup()
    }
  }, [])

  return (
    <div ref={bandRef} className="ow-dither" aria-hidden="true">
      <canvas ref={canvasRef} className="ow-dither__canvas" />
    </div>
  )
}

export function Dock({ t, locale }: { t: OfficialCopy; locale: OfficialLocale }) {
  const sectionRef = useRef<HTMLElement>(null)
  const stencilRef = useRef<HTMLSpanElement>(null)
  const [scramble, setScramble] = useState(false)

  useInViewOnce(
    sectionRef,
    () => {
      const section = sectionRef.current
      if (!section) return
      section.classList.add('is-in')
      if (prefersReducedMotion() || !stencilRef.current) return
      window.setTimeout(() => {
        if (stencilRef.current) sprayReveal(stencilRef.current)
      }, 300)
      window.setTimeout(() => setScramble(true), 980)
    },
    0.3,
  )

  return (
    <>
      <DitherBand />
      <section ref={sectionRef} id="contact" className="ow-dock" aria-labelledby="ow-dock-title">
        <span className="ow-dock__door" aria-hidden="true" />
        <div className="ow-container ow-dock__grid">
          <div className="ow-dock__main">
            <p className="ow-dock__plate ow-mono">{t.dock.plate}</p>
            <h2 id="ow-dock-title" className={`ow-dock__h2${locale === 'zh' ? ' ow-dock__h2--zh' : ''}`}>
              {t.dock.h2.map((line) => (
                <span key={line} className="ow-dock__line">
                  <span>{line}</span>
                </span>
              ))}
            </h2>
            <p className="ow-dock__sub">{t.dock.sub}</p>
            <p className="ow-dock__wit">{t.dock.wit}</p>
            <CtaPair t={t} locale={locale} primaryFirst className="ow-dock__ctas ow-on-teal" />
          </div>
          <RetroTicket title={t.dock.slipTitle} className="ow-dock__slip">
            <dl className="ow-slip">
              {t.dock.slipRows.map((row) => (
                <div key={row.k} className="ow-slip__row">
                  <dt>{row.k}</dt>
                  <dd>
                    {row.copy ? (
                      <>
                        <a href="mailto:4wallaitech@gmail.com">{row.v}</a> <CopyEmail t={t} />
                      </>
                    ) : (
                      row.v
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </RetroTicket>
        </div>
        <span ref={stencilRef} className="ow-dock__giant" aria-hidden="true">
          {scramble ? <ScrambleText text="4WALL AI" trigger="mount" /> : '4WALL AI'}
        </span>
      </section>
    </>
  )
}
