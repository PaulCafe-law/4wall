import { useEffect, useRef, useState } from 'react'

import { fill, type OfficialCopy } from '../officialContent'
import { prefersReducedMotion } from '../motion/scheduler'
import { useHydrated } from './hooks'
import { Stamp } from './shared'
import { useStage } from './stageController'

const LEARNED = new Set([1, 2, 3, 4, 6, 7])

/** Numberless meter lengths (C4). Cards 0 and 1 follow the slider; 2 and 3 are fixed. */
function meters(n: number) {
  return [
    0.35 + 0.6 * (1 - Math.exp(-0.55 * n)),
    Math.min(1, Math.max(0.1, 0.3 + 0.05 * Math.abs(n - 3) + 0.4 / n)),
    0.58,
    0.46,
  ]
}

type SlotTag = { text: string; tone: 'teal' | 'ochre'; pop?: boolean }

/** Product behaviour: from 5 queue slots QuickJudge offers simulator verification; 8 is an extended setting. */
function slotTags(n: number, t: OfficialCopy): SlotTag[] {
  if (n >= 8) return [{ text: t.stamp.outOfRange, tone: 'teal', pop: true }]
  const tags: SlotTag[] = []
  if (!LEARNED.has(n)) tags.push({ text: t.stamp.interp, tone: 'teal' })
  if (n >= 5) tags.push({ text: t.stamp.verify, tone: 'teal' })
  return tags
}

function KpiCard({ label, ends, aria, value, outOfRange }: { label: string; ends: string[]; aria: string; value: number; outOfRange: boolean }) {
  return (
    <div className="ow-kpi" role="img" aria-label={aria}>
      <div className="ow-kpi__top" aria-hidden="true">
        <span className="ow-kpi__label">{label}</span>
      </div>
      <div className={`ow-meter${outOfRange ? ' is-out' : ''}`} aria-hidden="true">
        <span className="ow-meter__fill" style={{ ['--w' as string]: value }} />
      </div>
      <div className="ow-kpi__ends" aria-hidden="true">
        <span>{ends[0]}</span>
        <span>{ends[1]}</span>
      </div>
    </div>
  )
}

export function KpiPanel({ t }: { t: OfficialCopy }) {
  const hydrated = useHydrated()
  const stage = useStage()
  const [n, setN] = useState(3)
  const [live, setLive] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const liveTimer = useRef(0)

  // Cards enter on the first activation of step 05.
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    if (!stage || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-in')
      return undefined
    }
    return stage.onProgress((s) => {
      if (s >= 6) el.classList.add('is-in')
    })
  }, [stage])

  useEffect(() => () => window.clearTimeout(liveTimer.current), [])

  const values = meters(n)
  const outOfRange = n === 8
  const tags = slotTags(n, t)

  function change(next: number) {
    setN(next)
    stage?.setSlots(next)
    window.clearTimeout(liveTimer.current)
    const nextTags = slotTags(next, t).map((tag) => tag.text)
    liveTimer.current = window.setTimeout(() => setLive([fill(t.slot.valuetext, { n: next }), ...nextTags].join(' · ')), 300)
  }

  return (
    <div ref={ref} className="ow-panel ow-kpis">
      <p className="ow-kpis__scenario ow-mono">{t.kpi.scenario}</p>
      <div className="ow-kpis__grid">
        {t.kpi.cards.map((card, i) => (
          <KpiCard
            key={card.label}
            label={card.label}
            ends={card.ends}
            aria={fill(t.kpi.cardAria, { label: card.label })}
            value={values[i]}
            outOfRange={outOfRange && i < 2}
          />
        ))}
      </div>
      <ul className="ow-kpis__chips" aria-label={t.kpi.chips.join('、')}>
        {t.kpi.chips.map((chip) => (
          <li key={chip}>{chip}</li>
        ))}
      </ul>
      <div className="ow-slot-toy">
        <p className="ow-slot-toy__static" hidden={hydrated}>
          {t.slot.static}
        </p>
        <div className="ow-slot-toy__control" hidden={!hydrated}>
          <label htmlFor="ow-slot-range" className="ow-slot-toy__label">
            {t.slot.label}
          </label>
          {/* The slider's aria-valuetext and the debounced live region already announce the value. */}
          <output htmlFor="ow-slot-range" className="ow-slot-toy__value ow-mono" aria-hidden="true">
            {fill(t.slot.value, { n })}
          </output>
          <input
            id="ow-slot-range"
            type="range"
            min={1}
            max={8}
            step={1}
            value={n}
            aria-valuetext={fill(t.slot.valuetext, { n })}
            onChange={(e) => change(Number(e.target.value))}
          />
          <div className="ow-slot-toy__ticks" aria-hidden="true">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((k) => (
              <span key={k} className={k === n ? 'is-on' : undefined}>
                {k}
              </span>
            ))}
          </div>
          <p className="ow-slot-toy__tags">
            <Stamp>{t.slot.stamp}</Stamp>
            {tags.map((tag) => (
              <Stamp key={tag.text} tone={tag.tone} className={tag.pop ? 'ow-pop' : undefined}>
                {tag.text}
              </Stamp>
            ))}
          </p>
          <span className="ow-sr" aria-live="polite">
            {live}
          </span>
        </div>
        <p className="ow-note">{t.slot.note}</p>
      </div>
    </div>
  )
}
