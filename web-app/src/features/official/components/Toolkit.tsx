import { useRef, useState } from 'react'

import type { OfficialCopy } from '../officialContent'
import { useInViewOnce } from './hooks'
import { Eyebrow } from './shared'

const BINS = [
  { x: 8, y: 8 },
  { x: 72, y: 8 },
  { x: 136, y: 8 },
  { x: 8, y: 84 },
  { x: 72, y: 84 },
  { x: 136, y: 84 },
]

export function Toolkit({ t }: { t: OfficialCopy }) {
  const [active, setActive] = useState<number | null>(null)
  const ref = useRef<HTMLElement>(null)
  useInViewOnce(ref, () => ref.current?.classList.add('is-in'), 0.3)

  return (
    <section ref={ref} id="toolkit" className="ow-toolkit" aria-labelledby="ow-toolkit-title">
      <div className="ow-container ow-toolkit__grid">
        <div className="ow-toolkit__main">
          <Eyebrow className="ow-eyebrow--mono">{t.toolkit.eyebrow}</Eyebrow>
          <h2 id="ow-toolkit-title" className="ow-h2">
            {t.toolkit.h2}
          </h2>
          <div className="ow-toolkit__table-wrap">
            <span className="ow-toolkit__scan" aria-hidden="true" />
            <table className="ow-toolkit__table">
              <caption className="ow-sr">{t.toolkit.caption}</caption>
              <thead>
                <tr>
                  {t.toolkit.head.map((h) => (
                    <th key={h} scope="col">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.toolkit.rows.map((row, i) => (
                  <tr
                    key={row.bin}
                    className={active === i ? 'is-active' : undefined}
                    onMouseEnter={() => setActive(i)}
                    onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                    tabIndex={0}
                  >
                    <td>
                      <span className="ow-bin ow-mono">{row.bin}</span>
                    </td>
                    <th scope="row">{row.name}</th>
                    <td>{row.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <svg className="ow-toolkit__plan" viewBox="0 0 200 160" role="img" aria-label={t.toolkit.planAria}>
          <rect x="1" y="1" width="198" height="158" className="ow-toolkit__floor" />
          {BINS.map((bin, i) => (
            <g key={t.toolkit.rows[i].bin} className={active === i ? 'is-active' : undefined}>
              <rect x={bin.x} y={bin.y} width="56" height="68" />
              <text x={bin.x + 6} y={bin.y + 62}>
                {t.toolkit.rows[i].bin}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </section>
  )
}
