import { useEffect, useRef } from 'react'

import type { OfficialCopy, OfficialLocale } from '../officialContent'
import { CopyEmail, Eyebrow, RichText } from './shared'

export function Faq({ t, locale }: { t: OfficialCopy; locale: OfficialLocale }) {
  const listRef = useRef<HTMLDivElement>(null)

  // Deep links such as #faq-fit open the matching item.
  useEffect(() => {
    const openFromHash = () => {
      const id = window.location.hash.slice(1)
      if (!id) return
      let target = id
      try {
        target = decodeURIComponent(id)
      } catch {
        // Malformed fragment (e.g. "#50%off"): use it as typed.
      }
      const item = document.getElementById(target)
      if (item instanceof HTMLDetailsElement && listRef.current?.contains(item)) item.open = true
    }
    openFromHash()
    window.addEventListener('hashchange', openFromHash)
    return () => window.removeEventListener('hashchange', openFromHash)
  }, [])

  return (
    <section id="faq" className="ow-faq" aria-labelledby="ow-faq-title">
      <div className="ow-container ow-faq__grid">
        <header className="ow-faq__head">
          <Eyebrow className="ow-eyebrow--mono">{t.faq.eyebrow}</Eyebrow>
          <h2 id="ow-faq-title" className="ow-h2">
            {t.faq.h2}
          </h2>
        </header>
        <div ref={listRef} className="ow-faq__list">
          {t.faq.items.map((item) => (
            <details key={item.q} id={item.id} className="ow-faq__item">
              <summary>
                <span>{item.q}</span>
                <span className="ow-faq__plus" aria-hidden="true" />
              </summary>
              <div className="ow-faq__answer">
                <p>
                  <RichText text={item.a} locale={locale} />
                  {item.copy ? (
                    <>
                      {' '}
                      <CopyEmail t={t} />
                    </>
                  ) : null}
                </p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
