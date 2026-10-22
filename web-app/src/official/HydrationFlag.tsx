import { useEffect } from 'react'

/** Marks the page as hydrated so the head failsafe never un-arms animations afterwards. */
export function HydrationFlag() {
  useEffect(() => {
    window.__owHydrated = true
    document.documentElement.classList.remove('ow-failsafe')
  }, [])
  return null
}
