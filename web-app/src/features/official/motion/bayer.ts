// 4×4 ordered-dither helpers (A.7). Pure string functions: safe during SSR.

export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const

/** Threshold for cell (x, y) in 0..1. */
export const bayerThreshold = (x: number, y: number) => (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16

/** SVG data-URL of a 4×4 tile with the cells whose Bayer value is < k filled (k = 0..16). */
export function bayerMaskFrame(k: number) {
  let rects = ''
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      if (BAYER4[y * 4 + x] < k) rects += `<rect x='${x}' y='${y}' width='1' height='1'/>`
    }
  }
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='4' height='4' shape-rendering='crispEdges'>${rects}</svg>`)}")`
}

/** The 17 mask frames, from empty (0) to solid (16). */
export const BAYER_MASK_FRAMES = Array.from({ length: 17 }, (_, k) => bayerMaskFrame(k))

/**
 * Spray reveal: steps an element's mask through the Bayer frames, then clears
 * it. Returns a cancel function. Call from an effect only.
 */
export function sprayReveal(el: HTMLElement, { stepMs = 40, frames }: { stepMs?: number; frames?: number[] } = {}) {
  const sequence = frames ?? Array.from({ length: 17 }, (_, k) => k)
  let i = 0
  const apply = (k: number) => {
    const frame = BAYER_MASK_FRAMES[k]
    el.style.setProperty('mask-image', frame)
    el.style.setProperty('-webkit-mask-image', frame)
    el.style.setProperty('mask-size', '4px 4px')
    el.style.setProperty('-webkit-mask-size', '4px 4px')
  }
  const clear = () => {
    for (const prop of ['mask-image', '-webkit-mask-image', 'mask-size', '-webkit-mask-size']) el.style.removeProperty(prop)
  }
  apply(sequence[0])
  const timer = window.setInterval(() => {
    i += 1
    if (i >= sequence.length) {
      window.clearInterval(timer)
      clear()
      return
    }
    apply(sequence[i])
  }, stepMs)
  return () => {
    window.clearInterval(timer)
    clear()
  }
}
