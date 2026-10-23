import { useEffect, useRef, type RefObject } from 'react'

import { mailtoDemo, type OfficialCopy, type OfficialLocale } from '../officialContent'
import { clamp01, easeOut } from '../motion/ease'
import { addTask, prefersReducedMotion } from '../motion/scheduler'
import { useInViewOnce } from './hooks'
import { CopyEmail, Eyebrow } from './shared'

function Envelope({ t, scrollRef }: { t: OfficialCopy; scrollRef: RefObject<HTMLElement | null> }) {
  const svgRef = useRef<SVGSVGElement>(null)
  useInViewOnce(svgRef, () => svgRef.current?.classList.add('is-in'), 0.4)

  // Flap opens and the results card slides out as the section scrolls from 60% to 30% of the viewport.
  useEffect(() => {
    const svg = svgRef.current
    const section = scrollRef.current
    if (!svg || !section || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') return undefined
    svg.setAttribute('data-scroll', '1')
    return addTask({
      kind: 'scroll',
      target: section,
      run: () => {
        const top = section.getBoundingClientRect().top / window.innerHeight
        const p = easeOut(clamp01((0.6 - top) / 0.3))
        svg.style.setProperty('--flap', (1 - 2 * p).toFixed(3))
        svg.style.setProperty('--card', p.toFixed(3))
      },
    })
  }, [scrollRef])

  return (
    <svg ref={svgRef} className="ow-envelope" viewBox="0 0 480 360" role="img" aria-label={t.how.envelopeAria}>
      <g className="ow-envelope__card" aria-hidden="true">
        <rect x="120" y="70" width="240" height="150" rx="6" />
        <text x="140" y="104">
          {t.how.card}
        </text>
        <rect className="ow-envelope__redact" x="140" y="124" width="72" height="12" />
        <rect className="ow-envelope__redact" x="220" y="124" width="48" height="12" />
        <rect className="ow-envelope__redact" x="140" y="146" width="120" height="12" />
        <rect className="ow-envelope__redact" x="140" y="168" width="88" height="12" />
      </g>
      <path className="ow-envelope__line" style={{ ['--i' as string]: 0 }} pathLength={1} d="M80 140 H400 V320 H80 Z" />
      <path className="ow-envelope__line" style={{ ['--i' as string]: 1 }} pathLength={1} d="M80 320 L240 220 L400 320" />
      <g className="ow-envelope__flap">
        <path className="ow-envelope__line" style={{ ['--i' as string]: 2 }} pathLength={1} d="M80 140 L240 250 L400 140" />
      </g>
      <g className="ow-envelope__seal" transform="translate(240 250)">
        <circle r="26" />
        <g className="ow-envelope__mark" transform="translate(-12 -12)">
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 12 12 17 22 12" />
          <polyline points="2 17 12 22 22 17" />
        </g>
      </g>
    </svg>
  )
}

export function HowWeWork({ t, locale }: { t: OfficialCopy; locale: OfficialLocale }) {
  const sectionRef = useRef<HTMLElement>(null)
  const tapeRef = useRef<HTMLDivElement>(null)
  useInViewOnce(tapeRef, () => tapeRef.current?.classList.add('is-in'), 0.4)

  return (
    <section ref={sectionRef} id="how" className="ow-how ow-floorgrid" aria-labelledby="ow-how-title">
      <div className="ow-container">
        <div className="ow-how__top">
          <div>
            <Eyebrow className="ow-eyebrow--mono">{t.how.eyebrow}</Eyebrow>
            <h2 id="ow-how-title" className="ow-h2">
              {t.how.h2}
            </h2>
            <p className="ow-lead">{t.how.body}</p>
            <p className="ow-how__cta">
              <a className="ow-inline-link ow-inline-link--strong" href={mailtoDemo(locale)}>
                {t.how.cta}
              </a>
              <CopyEmail t={t} />
            </p>
          </div>
          <Envelope t={t} scrollRef={sectionRef} />
        </div>
        <div ref={tapeRef} className="ow-how__tape">
          <span className="ow-how__line" aria-hidden="true" />
          <span className="ow-how__agv" aria-hidden="true" />
          <ol className="ow-how__stops">
            {t.how.stops.map((stop, i) => (
              <li key={stop.num} className="ow-stop" style={{ ['--i' as string]: i }}>
                <span className="ow-stop__num ow-mono">{stop.num}</span>
                <h3 className="ow-stop__title">{stop.title}</h3>
                <p className="ow-stop__body">{stop.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
