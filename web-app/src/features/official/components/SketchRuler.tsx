import { useEffect, useRef, useState } from 'react'

import type { OfficialCopy } from '../officialContent'
import { prefersReducedMotion } from '../motion/scheduler'
import { useHydrated } from './hooks'
import { Stamp } from './shared'

// Fixed illustrative curve (12 points); no data, no scale.
const XS = Array.from({ length: 12 }, (_, i) => 24 + i * 32)
const BASE = [120, 104, 112, 86, 92, 70, 78, 60, 72, 54, 62, 48]
const RULER_OFFSETS = [8, -6, 12, -4, 10, -14, 6, 9, -7, 11, -5, 4]
const noise = (i: number) => 6 * (0.6 * Math.sin(i * 1.7 + 0.3) + 0.3 * Math.sin(i * 3.1 + 1.1) + 0.1 * Math.sin(i * 6.3 + 2.2))

const A_PTS = XS.map((x, i) => [x, BASE[i] + noise(i)] as const)
const B_PTS = XS.map((x, i) => [x, BASE[i] + RULER_OFFSETS[i]] as const)
const GAPS = [3, 6, 9]

function catmullRom(points: ReadonlyArray<readonly [number, number]>) {
  let d = `M${points[0][0]} ${points[0][1].toFixed(1)}`
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(points.length - 1, i + 2)]
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0]} ${p2[1].toFixed(1)}`
  }
  return d
}

const PATH_A = catmullRom(A_PTS)
const PATH_B = `M${B_PTS.map(([x, y]) => `${x} ${y}`).join(' L')}`

type Phase = 'armed' | 'a' | 'b' | 'gaps' | 'done'

export function SketchRuler({ t }: { t: OfficialCopy }) {
  const hydrated = useHydrated()
  const [phase, setPhase] = useState<Phase>('done')
  const [replays, setReplays] = useState(0)
  const figureRef = useRef<HTMLElement>(null)
  const rulerRef = useRef<SVGGElement>(null)
  const timers = useRef<number[]>([])
  const raf = useRef(0)

  useEffect(() => {
    const figure = figureRef.current
    if (!figure || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') return undefined
    const pending = timers.current
    const play = () => {
      pending.forEach((id) => window.clearTimeout(id))
      cancelAnimationFrame(raf.current)
      setPhase('a')
      pending.push(
        window.setTimeout(() => {
          setPhase('b')
          const start = performance.now()
          const tick = (now: number) => {
            // rAF timestamps can precede `start`, which was taken inside a timeout.
            const p = Math.max(0, Math.min(1, (now - start) / 1600))
            const f = p * (B_PTS.length - 1)
            const i = Math.min(B_PTS.length - 2, Math.floor(f))
            const local = f - i
            const [x1, y1] = B_PTS[i]
            const [x2, y2] = B_PTS[i + 1]
            const x = x1 + (x2 - x1) * local
            const y = y1 + (y2 - y1) * local
            const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI
            rulerRef.current?.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${angle.toFixed(1)})`)
            if (p < 1) raf.current = requestAnimationFrame(tick)
          }
          raf.current = requestAnimationFrame(tick)
        }, 900),
        window.setTimeout(() => setPhase('gaps'), 2600),
        window.setTimeout(() => setPhase('done'), 3600),
      )
    }
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry) return
        if (entry.intersectionRatio >= 0.5) {
          io.disconnect()
          play()
        } else {
          setPhase((p) => (p === 'done' ? 'armed' : p))
        }
      },
      { threshold: [0, 0.5] },
    )
    io.observe(figure)
    return () => {
      io.disconnect()
      pending.forEach((id) => window.clearTimeout(id))
      cancelAnimationFrame(raf.current)
    }
  }, [replays])

  const [endX, endY] = B_PTS[B_PTS.length - 1]
  const finalAngle = (Math.atan2(endY - B_PTS[B_PTS.length - 2][1], endX - B_PTS[B_PTS.length - 2][0]) * 180) / Math.PI
  const drawing = phase === 'b'

  return (
    <figure ref={figureRef} className="ow-panel ow-ruler" data-phase={phase}>
      <svg viewBox="0 0 400 200" className="ow-ruler__svg" role="img" aria-label={t.ruler.aria}>
        <path className="ow-ruler__b" d={PATH_B} pathLength={1} />
        <path className="ow-ruler__a" d={PATH_A} pathLength={1} />
        {GAPS.map((g, k) => {
          const x = XS[g]
          const ya = A_PTS[g][1]
          const yb = B_PTS[g][1]
          const top = Math.min(ya, yb) - 4
          const bottom = Math.max(ya, yb) + 4
          return (
            <g key={g} className="ow-ruler__gap" style={{ ['--k' as string]: k }}>
              <path d={`M${x + 6} ${top} h6 V${bottom} h-6`} pathLength={1} />
              <text x={x + 16} y={(top + bottom) / 2 + 4}>
                ±
              </text>
            </g>
          )
        })}
        <g ref={rulerRef} className="ow-ruler__tool" transform={`translate(${endX} ${endY}) rotate(${finalAngle.toFixed(1)})`}>
          <rect x={-30} y={4} width={60} height={12} />
          {Array.from({ length: 13 }, (_, i) => (
            <line key={i} x1={-30 + i * 5} x2={-30 + i * 5} y1={4} y2={i % 2 ? 7 : 9} />
          ))}
        </g>
      </svg>
      <figcaption className="ow-ruler__caption">
        <span className="ow-ruler__key ow-ruler__key--a">
          {t.ruler.aiLabel} <Stamp>{t.stamp.illustrative}</Stamp>
        </span>
        <span className="ow-ruler__key ow-ruler__key--b">{t.ruler.simLabel}</span>
        <span className="ow-ruler__tag ow-mono">{t.ruler.rulerTag}</span>
        <span className={`ow-progress${drawing ? ' is-running' : ''}`} aria-hidden="true">
          <span />
        </span>
        <span className="ow-ruler__status ow-mono" aria-hidden="true">
          {drawing ? t.ruler.progress : t.ruler.done}
        </span>
        <span className="ow-ruler__gapnote">{t.ruler.gap}</span>
        {hydrated && !prefersReducedMotion() ? (
          <button type="button" className="ow-chip-btn ow-ruler__replay" onClick={() => setReplays((r) => r + 1)} aria-disabled={phase !== 'done'}>
            {t.ruler.replay}
          </button>
        ) : null}
      </figcaption>
    </figure>
  )
}
