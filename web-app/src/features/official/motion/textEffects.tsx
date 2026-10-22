import { useEffect, useRef, type ReactNode } from 'react'

import { prefersReducedMotion } from './scheduler'

// Bin-code characters: the wordmark resolves left to right like a location label.
const GLYPHS = '0123456789ABLW-/·'

/**
 * Left-to-right "bin code" scramble. The server renders the final text and the
 * accessible copy; only an aria-hidden visual copy changes.
 */
export function ScrambleText({
  text,
  className = '',
  trigger = 'mount',
  speed = 0.45,
}: {
  text: string
  className?: string
  /** 'mount': on mount and whenever text changes; 'fonts': after fonts load and on hover/focus of the parent link. */
  trigger?: 'mount' | 'fonts'
  /** Characters revealed per 40ms tick. */
  speed?: number
}) {
  const visualRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = visualRef.current
    if (!el || prefersReducedMotion()) return undefined
    let timer = 0
    let seed = 7
    let lastRun = 0
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280
      return seed / 233280
    }
    const run = () => {
      const now = performance.now()
      if (now - lastRun < 1500 && lastRun) return
      lastRun = now
      window.clearInterval(timer)
      let revealed = 0
      timer = window.setInterval(() => {
        el.textContent = [...text]
          .map((ch, i) => (ch === ' ' || i < revealed ? ch : GLYPHS[Math.floor(rand() * GLYPHS.length)]))
          .join('')
        revealed += speed
        if (revealed > text.length) {
          window.clearInterval(timer)
          el.textContent = text
        }
      }, 40)
    }
    let cancelled = false
    let fallback = 0
    const host = el.closest('a, button')
    if (trigger === 'mount') {
      run()
    } else {
      const start = () => {
        if (!cancelled) run()
      }
      fallback = window.setTimeout(start, 1200)
      document.fonts?.ready.then(() => {
        window.clearTimeout(fallback)
        start()
      })
      host?.addEventListener('pointerenter', run)
      host?.addEventListener('focus', run)
    }
    return () => {
      cancelled = true
      window.clearTimeout(fallback)
      window.clearInterval(timer)
      host?.removeEventListener('pointerenter', run)
      host?.removeEventListener('focus', run)
      el.textContent = text
    }
  }, [text, trigger, speed])

  return (
    <span className={className}>
      <span className="ow-sr">{text}</span>
      <span ref={visualRef} aria-hidden="true">
        {text}
      </span>
    </span>
  )
}

type RevealTag = 'div' | 'section' | 'article' | 'li' | 'figure' | 'header' | 'span'

/**
 * Adds `is-in` once the element enters the viewport. CSS owns the transition
 * and only hides content under `html.js:not(.ow-failsafe)`, so the page stays
 * readable without JavaScript.
 */
export function Reveal({
  as = 'div',
  className = '',
  children,
  threshold = 0.25,
  id,
}: {
  as?: RevealTag
  className?: string
  children: ReactNode
  threshold?: number
  id?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  // All RevealTag elements share the HTMLElement surface used here.
  const Tag = as as 'div'

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    if (typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) {
      el.classList.add('is-in')
      return undefined
    }
    el.classList.add('ow-armed')
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.classList.add('is-in')
          io.disconnect()
        }
      },
      { threshold },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [threshold])

  return (
    <Tag ref={ref} id={id} className={className}>
      {children}
    </Tag>
  )
}
