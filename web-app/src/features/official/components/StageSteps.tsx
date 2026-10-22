import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { fill, mailtoDemo, type OfficialCopy, type OfficialLocale } from '../officialContent'
import { buildFloorModel, posterIsoSVG } from '../motion/floorModel'
import { prefersReducedMotion } from '../motion/scheduler'
import { ChatEditDemo } from './ChatEditDemo'
import { KpiPanel } from './KpiPanel'
import { SketchRuler } from './SketchRuler'
import { Eyebrow, RetroTicket, RichText, Stamp } from './shared'
import { useStage } from './stageController'

const AISLE = ['01', '02', '03', '04', '05', '06']

function SkipLink({ t }: { t: OfficialCopy }) {
  return (
    <a className="ow-stage__skip" href="#spec">
      {t.stage.skip}
    </a>
  )
}

/** Fires `onFirst` the first time stage progress reaches `at` (and again after dropping below `resetBelow`). */
function useStageCross(at: number, onFirst: () => void, resetBelow?: number) {
  const stage = useStage()
  const fired = useRef(false)
  const callback = useRef(onFirst)
  useEffect(() => {
    callback.current = onFirst
  })
  useEffect(() => {
    if (!stage) return undefined
    return stage.onProgress((s) => {
      if (!fired.current && s >= at) {
        fired.current = true
        callback.current()
      } else if (fired.current && resetBelow !== undefined && s < resetBelow) {
        fired.current = false
      }
    })
  }, [stage, at, resetBelow])
}

function StepShell({
  slot,
  id,
  index,
  children,
}: {
  slot: number
  id: string
  index: number
  children: ReactNode
}) {
  return (
    <section id={id} data-slot={slot} className="ow-slot" aria-labelledby={`${id}-title`}>
      <div className="ow-container ow-slot__inner">
        <span className="ow-slot__aisle" aria-hidden="true">
          {AISLE[index]}
        </span>
        <article className="ow-card">
          <span className="ow-corner ow-corner--tl" aria-hidden="true" />
          <span className="ow-corner ow-corner--br" aria-hidden="true" />
          {children}
        </article>
      </div>
    </section>
  )
}

function ReceivingTicket({ t }: { t: OfficialCopy }) {
  const stage = useStage()
  const listRef = useRef<HTMLUListElement>(null)

  // Rows flip from "reading" to "read" as the scroll passes step 01 (visual copy only).
  useEffect(() => {
    const list = listRef.current
    if (!stage || !list || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') return undefined
    const marks = [0.42, 0.52, 0.62, 0.74]
    const statuses = [...list.querySelectorAll<HTMLElement>('[data-status]')]
    let last = ''
    return stage.onProgress((s) => {
      const local = s - 2
      const key = marks.map((m) => (local >= m || s >= 3 ? '1' : '0')).join('')
      if (key === last) return
      last = key
      statuses.forEach((el, i) => {
        const done = key[i] === '1'
        el.textContent = done ? t.ticket.done : t.ticket.pending
        el.toggleAttribute('data-pending', !done)
      })
    })
  }, [stage, t])

  return (
    <RetroTicket title={t.ticket.title} className="ow-step__ticket">
      <ul ref={listRef} className="ow-ticket__rows">
        {t.ticket.rows.map((row) => (
          <li key={row}>
            <span className="ow-ticket__file">{row}</span>
            <span className="ow-sr">{t.ticket.done}</span>
            <span className="ow-ticket__status" data-status aria-hidden="true">
              {t.ticket.done}
            </span>
          </li>
        ))}
      </ul>
      <p className="ow-ticket__found">{t.ticket.found}</p>
      <p className="ow-ticket__footer">
        <Stamp>{t.stamp.illustrative}</Stamp> {t.ticket.footer}
      </p>
    </RetroTicket>
  )
}

function IsoFallback({ t }: { t: OfficialCopy }) {
  const iso = useMemo(() => posterIsoSVG(buildFloorModel('mobile')), [])
  return (
    <figure className="ow-iso-fallback">
      <svg
        viewBox={iso.viewBox}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={t.steps[1].isoFallbackAlt}
        dangerouslySetInnerHTML={{ __html: iso.markup }}
      />
    </figure>
  )
}

const SCORE_BARS: Array<[number, number]> = [
  [0.62, 0.74],
  [0.7, 0.58],
  [0.55, 0.56],
  [0.2, 0.31],
]

function Scoreboard({ t }: { t: OfficialCopy }) {
  const [run, setRun] = useState(3)
  const ref = useRef<HTMLElement>(null)
  const timers = useRef<number[]>([])

  useStageCross(5, () => {
    const el = ref.current
    if (!el) return
    el.classList.add('is-in')
    if (prefersReducedMotion()) return
    setRun(1)
    timers.current.push(window.setTimeout(() => setRun(2), 1200), window.setTimeout(() => setRun(3), 2400))
  })
  useEffect(() => {
    const el = ref.current
    if (el && (prefersReducedMotion() || typeof IntersectionObserver === 'undefined')) el.classList.add('is-in')
    const pending = timers.current
    return () => pending.forEach((id) => window.clearTimeout(id))
  }, [])

  return (
    <figure ref={ref} className="ow-panel ow-score">
      <div className="ow-panel__head">
        <span className="ow-panel__title">{t.score.title}</span>
        <span className="ow-score__run ow-mono">{fill(t.score.run, { n: run })}</span>
      </div>
      <div className="ow-score__legend" aria-hidden="true">
        <span className="ow-score__key ow-score__key--base">{t.score.cols[0]}</span>
        <span className="ow-score__key ow-score__key--alt">{t.score.cols[1]}</span>
      </div>
      <ul className="ow-score__rows">
        {t.score.rows.map((row, i) => (
          <li key={row} className="ow-score__row" aria-label={fill(t.score.rowAria, { row, chip: t.score.chips[i] })} style={{ ['--i' as string]: i }}>
            <span className="ow-score__label" aria-hidden="true">
              {row}
            </span>
            <span className="ow-score__bars" aria-hidden="true">
              <span className="ow-bar ow-bar--base" style={{ ['--w' as string]: SCORE_BARS[i][0] }} />
              <span className="ow-bar ow-bar--alt" style={{ ['--w' as string]: SCORE_BARS[i][1] }} />
            </span>
            <span className={`ow-chip ow-chip--${['better', 'better', 'tie', 'worse'][i]}`} aria-hidden="true">
              {t.score.chips[i]}
            </span>
          </li>
        ))}
      </ul>
      <figcaption className="ow-panel__foot">
        <Stamp>{t.stamp.illustrative}</Stamp> {t.score.footer}
      </figcaption>
    </figure>
  )
}

function Zebra({ t, locale }: { t: OfficialCopy; locale: OfficialLocale }) {
  return (
    <div className="ow-zebra" role="note" aria-labelledby="ow-zebra-title">
      <span className="ow-zebra__tape" aria-hidden="true" />
      <div className="ow-container">
        <div className="ow-zebra__sign">
          <svg className="ow-zebra__icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
            <path d="M16 3 30 28H2Z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
            <path d="M16 12v8M16 23.5v1.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          <div>
            <p id="ow-zebra-title" className="ow-zebra__title">
              {t.zebra.title}
            </p>
            <p className="ow-zebra__body">
              <RichText text={t.zebra.body} locale={locale} />
            </p>
          </div>
        </div>
      </div>
      <span className="ow-zebra__tape" aria-hidden="true" />
    </div>
  )
}

export function StageSteps({ t, locale }: { t: OfficialCopy; locale: OfficialLocale }) {
  const [s1, s2, s3, s4, s5, s6] = t.steps
  return (
    <>
      <section id="flow" data-slot="1" className="ow-slot ow-slot--intro" aria-labelledby="flow-title">
        <div className="ow-container ow-slot__inner">
          <article className="ow-card ow-card--intro">
            <span className="ow-corner ow-corner--tl" aria-hidden="true" />
            <span className="ow-corner ow-corner--br" aria-hidden="true" />
            <p className="ow-sr">{t.stage.srIntro}</p>
            <Eyebrow className="ow-eyebrow--mono">{t.intro.eyebrow}</Eyebrow>
            <h2 id="flow-title" className="ow-bridge">
              <span>{t.intro.h2[0]}</span>
              <span className="ow-bridge__teal">{t.intro.h2[1]}</span>
            </h2>
            <p className="ow-body">{t.intro.fit}</p>
            <p className="ow-card__links">
              <a className="ow-inline-link" href="#faq-fit">
                {t.intro.fitLink}
              </a>
              <SkipLink t={t} />
            </p>
          </article>
        </div>
      </section>

      <StepShell slot={2} id={s1.id} index={0}>
        <Eyebrow className="ow-eyebrow--mono">{s1.eyebrow}</Eyebrow>
        <h3 id={`${s1.id}-title`} className="ow-h3">
          {s1.h3}
        </h3>
        <p className="ow-body">{s1.body}</p>
        <p className="ow-spec-line ow-mono">{s1.spec}</p>
        <ReceivingTicket t={t} />
      </StepShell>

      <StepShell slot={3} id={s2.id} index={1}>
        <Eyebrow className="ow-eyebrow--mono">{s2.eyebrow}</Eyebrow>
        <h3 id={`${s2.id}-title`} className="ow-h3">
          {s2.h3}
        </h3>
        <p className="ow-body">{s2.body}</p>
        <p className="ow-note">{s2.note}</p>
        <IsoFallback t={t} />
      </StepShell>

      <StepShell slot={4} id={s3.id} index={2}>
        <Eyebrow className="ow-eyebrow--mono">{s3.eyebrow}</Eyebrow>
        <h3 id={`${s3.id}-title`} className="ow-h3">
          {s3.h3}
        </h3>
        <p className="ow-body">{s3.body}</p>
        <ChatEditDemo t={t} locale={locale} />
      </StepShell>

      <Zebra t={t} locale={locale} />

      <StepShell slot={5} id={s4.id} index={3}>
        <Eyebrow className="ow-eyebrow--mono">{s4.eyebrow}</Eyebrow>
        <h3 id={`${s4.id}-title`} className="ow-h3">
          {s4.h3}
        </h3>
        <p className="ow-body">{s4.body}</p>
        <p className="ow-note">{s4.note}</p>
        <Scoreboard t={t} />
      </StepShell>

      <StepShell slot={6} id={s5.id} index={4}>
        <Eyebrow className="ow-eyebrow--mono">{s5.eyebrow}</Eyebrow>
        <h3 id={`${s5.id}-title`} className="ow-h3">
          {s5.h3}
        </h3>
        <p className="ow-body">{s5.body}</p>
        <p className="ow-badge-note">
          <Stamp tone="teal">{t.stamp.forecast}</Stamp> {s5.badgeNote}
        </p>
        <KpiPanel t={t} />
        <p className="ow-note">{s5.caveat}</p>
      </StepShell>

      <StepShell slot={7} id={s6.id} index={5}>
        <Eyebrow className="ow-eyebrow--mono">{s6.eyebrow}</Eyebrow>
        <h3 id={`${s6.id}-title`} className="ow-h3">
          {s6.h3}
        </h3>
        <p className="ow-body">{s6.body}</p>
        <SketchRuler t={t} />
        <aside className="ow-boss" aria-label={t.boss.q}>
          <p className="ow-boss__q">{t.boss.q}</p>
          <p className="ow-boss__a">{t.boss.a}</p>
        </aside>
        <p className="ow-card__links">
          <a className="ow-inline-link" href={mailtoDemo(locale)}>
            {s6.end}
          </a>
          <SkipLink t={t} />
        </p>
      </StepShell>
    </>
  )
}
