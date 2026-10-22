import { useEffect, useRef } from 'react'

import type { OfficialCopy } from '../officialContent'
import { sprayReveal } from '../motion/bayer'
import { easeOut, clamp01 } from '../motion/ease'
import { addTask, markScrollDirty, prefersReducedMotion } from '../motion/scheduler'
import { useInViewOnce } from './hooks'
import { Eyebrow } from './shared'

function ShapeIcon({ shape }: { shape: 'circle' | 'square' | 'triangle' }) {
  return (
    <svg className={`ow-rule__icon ow-rule__icon--${shape}`} viewBox="0 0 28 28" aria-hidden="true" focusable="false">
      {shape === 'circle' ? <circle cx="14" cy="14" r="11" pathLength={1} /> : null}
      {shape === 'square' ? <rect x="3" y="3" width="22" height="22" pathLength={1} /> : null}
      {shape === 'triangle' ? <path d="M14 3 26 25H2Z" pathLength={1} /> : null}
    </svg>
  )
}

/** The product's small print, rendered at full size; on desktop it grows out of a 12px line as you scroll. */
function FinePrint({ t }: { t: OfficialCopy }) {
  const fineRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [before, after] = t.board.bigLine.split(' · ')

  useEffect(() => {
    const fine = fineRef.current
    const wrapper = wrapperRef.current
    if (!fine || !wrapper || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') return undefined
    const media = window.matchMedia('(min-width: 1024px)')
    let geometry: { top: number; travel: number; dx: number; dy: number; s0: number } | null = null
    let pulsed = false

    const measure = () => {
      wrapper.style.transform = ''
      // The 200vh sticky layout itself is pure CSS (html.js, ≥1024px), so it already
      // exists in the prerendered page and hydration never shifts what follows.
      if (!media.matches) {
        geometry = null
        return
      }
      const inner = wrapper.parentElement as HTMLElement
      const fineRect = fine.getBoundingClientRect()
      const innerRect = inner.getBoundingClientRect()
      const lineRect = wrapper.getBoundingClientRect()
      const fontPx = parseFloat(getComputedStyle(wrapper.firstElementChild as Element).fontSize) || 48
      const s0 = 12 / fontPx
      const x0 = lineRect.left - innerRect.left
      const y0 = lineRect.top - innerRect.top
      geometry = {
        top: fineRect.top + window.scrollY,
        travel: Math.max(1, fine.offsetHeight - window.innerHeight),
        s0,
        dx: innerRect.width - 48 - lineRect.width * s0 - x0,
        dy: innerRect.height - 48 - lineRect.height * s0 - y0,
      }
      markScrollDirty()
    }
    measure()
    const ro = new ResizeObserver(() => measure())
    ro.observe(fine)
    document.fonts?.ready.then(measure)

    const remove = addTask({
      kind: 'scroll',
      target: fine,
      run: () => {
        if (!geometry) return
        const p = clamp01((window.scrollY - geometry.top + 64) / geometry.travel)
        const e = easeOut(clamp01(p / 0.8))
        const scale = geometry.s0 + (1 - geometry.s0) * e
        wrapper.style.transform = e >= 1 ? '' : `translate(${(geometry.dx * (1 - e)).toFixed(1)}px, ${(geometry.dy * (1 - e)).toFixed(1)}px) scale(${scale.toFixed(4)})`
        wrapper.style.willChange = e >= 1 ? '' : 'transform'
        if (!pulsed && p >= 0.85) {
          pulsed = true
          fine.classList.add('is-pulse')
        }
      },
    })
    return () => {
      remove()
      ro.disconnect()
      wrapper.style.transform = ''
    }
  }, [])

  return (
    <div ref={fineRef} className="ow-fine">
      <div className="ow-fine__inner">
        <p className="ow-fine__pre ow-mono">{t.board.finePre}</p>
        <div ref={wrapperRef} className="ow-fine__line-wrap">
          <p className="ow-fine__line">
            {before}
            <span className="ow-fine__dot">
              <span aria-hidden="true"> · </span>
              <i aria-hidden="true" />
            </span>
            {after}
          </p>
        </div>
      </div>
    </div>
  )
}

export function SafetyBoard({ t }: { t: OfficialCopy }) {
  const gridRef = useRef<HTMLOListElement>(null)
  useInViewOnce(
    gridRef,
    () => {
      const grid = gridRef.current
      if (!grid) return
      grid.classList.add('is-in')
      if (prefersReducedMotion()) return
      ;[...grid.children].forEach((tile, i) => {
        window.setTimeout(() => sprayReveal(tile as HTMLElement), i * 90)
      })
    },
    0.25,
  )

  return (
    <section id="numbers" className="ow-board" aria-labelledby="ow-board-title">
      <div className="ow-container">
        <Eyebrow className="ow-eyebrow--mono ow-eyebrow--dark">{t.board.eyebrow}</Eyebrow>
      </div>
      <FinePrint t={t} />
      <div className="ow-container ow-board__rules">
        <h2 id="ow-board-title" className="ow-h2 ow-h2--dark">
          {t.board.h2}
        </h2>
        <p className="ow-board__intro">{t.board.intro}</p>
        <ol ref={gridRef} className="ow-board__grid">
          {t.board.rules.map((rule, i) => (
            <li key={rule.title} className="ow-rule">
              <ShapeIcon shape={rule.shape} />
              <span className="ow-rule__num ow-mono" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="ow-rule__title">{rule.title}</h3>
              <p className="ow-rule__body">{rule.body}</p>
            </li>
          ))}
        </ol>
        <p className="ow-board__footer">{t.board.footer}</p>
      </div>
    </section>
  )
}
