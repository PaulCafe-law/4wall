import { useRef } from 'react'

import type { OfficialCopy } from '../officialContent'
import { sprayReveal } from '../motion/bayer'
import { prefersReducedMotion } from '../motion/scheduler'
import { useInViewOnce } from './hooks'
import { Eyebrow } from './shared'

/** Digits roll like an odometer; other characters (×, –) stay static. Final value is in the markup. */
function Odometer({ value }: { value: string }) {
  let digitIndex = 0
  return (
    <>
      <span className="ow-sr">{value}</span>
      <span className="ow-odo" aria-hidden="true">
        {[...value].map((ch, i) => {
          if (!/[0-9]/.test(ch)) {
            return (
              <span key={i} className="ow-odo__static">
                {ch}
              </span>
            )
          }
          const d = Number(ch)
          const index = digitIndex
          digitIndex += 1
          return (
            <span key={i} className="ow-odo__win">
              <span className="ow-odo__col" style={{ ['--d' as string]: d, ['--i' as string]: index }}>
                {Array.from({ length: 10 }, (_, k) => (
                  <span key={k}>{k}</span>
                ))}
              </span>
            </span>
          )
        })}
      </span>
    </>
  )
}

function SpecCell({ num, text, index }: { num: string; text: string; index: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const numRef = useRef<HTMLSpanElement>(null)
  useInViewOnce(
    ref,
    () => {
      ref.current?.classList.add('is-in')
      if (num === '0' && numRef.current && !prefersReducedMotion()) sprayReveal(numRef.current, { stepMs: 40 })
    },
    0.4,
  )
  return (
    <div ref={ref} className={`ow-spec__cell ow-spec__cell--${index}`}>
      <span ref={numRef} className={`ow-spec__num${num === '24' ? ' ow-spec__num--xl' : ''}`}>
        {num === '0' ? num : <Odometer value={num} />}
      </span>
      <p className="ow-spec__text">{text}</p>
      <span className="ow-spec__tag ow-mono" aria-hidden="true">
        SPEC {String(index + 1).padStart(2, '0')}
      </span>
    </div>
  )
}

export function SpecBand({ t }: { t: OfficialCopy }) {
  return (
    <section id="spec" className="ow-spec ow-floorgrid" aria-labelledby="ow-spec-title">
      <div className="ow-container">
        <header className="ow-spec__head">
          <Eyebrow className="ow-eyebrow--mono">{t.spec.eyebrow}</Eyebrow>
          <h2 id="ow-spec-title" className="ow-spec__line">
            {t.spec.line}
          </h2>
        </header>
        <div className="ow-spec__grid">
          {t.spec.items.map((item, i) => (
            <SpecCell key={item.num} num={item.num} text={item.text} index={i} />
          ))}
        </div>
      </div>
    </section>
  )
}
