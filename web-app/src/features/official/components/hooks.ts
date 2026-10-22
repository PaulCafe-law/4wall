import { useEffect, useSyncExternalStore } from 'react'

import { prefersReducedMotion } from '../motion/scheduler'

const noopSubscribe = () => () => undefined

/** false during SSR and the hydration render, true afterwards (no mismatch). */
export function useHydrated() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  )
}

/** Plain text of a RichText string (`{text}` / `{text|email}` links unwrapped). */
export function richTextPlain(text: string) {
  return text.replace(/\{([^}|]+)(?:\|email)?\}/g, '$1')
}

/**
 * Calls `onEnter` once the element's top edge has risen `offset` (0..1) of the
 * viewport height above the bottom — reachable however tall the element is.
 * Fires immediately without IntersectionObserver or with reduced motion.
 */
export function useInViewOnce<T extends Element>(ref: { current: T | null }, onEnter: () => void, offset = 0.2) {
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    if (typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) {
      onEnter()
      return undefined
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect()
          onEnter()
        }
      },
      { threshold: 0, rootMargin: `0px 0px -${Math.round(offset * 100)}% 0px` },
    )
    io.observe(el)
    return () => io.disconnect()
    // onEnter is intentionally read once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, offset])
}

/** Language switch target: zh page → /en, en page → /, prefixed on SPA hosts. */
export function languageHref(locale: 'zh' | 'en', basePath: '' | '/official') {
  return locale === 'zh' ? `${basePath}/en` : basePath || '/'
}
