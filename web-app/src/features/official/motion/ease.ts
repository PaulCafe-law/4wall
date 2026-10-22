// Easing helpers shared by the canvas engines (A.6 motion tokens).

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3)

export function easeOutBack(t: number, cap = 1.06) {
  const c1 = 1.70158
  const c3 = c1 + 1
  const x = clamp01(t)
  return Math.min(cap, 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2))
}

/** cubic-bezier(.65,0,.35,1), solved with Newton iterations. */
export function easeInOut(t: number) {
  const x = clamp01(t)
  const p1x = 0.65
  const p1y = 0
  const p2x = 0.35
  const p2y = 1
  const bez = (u: number, a: number, b: number) => 3 * a * u * (1 - u) * (1 - u) + 3 * b * u * u * (1 - u) + u * u * u
  const dBez = (u: number, a: number, b: number) => 3 * a * (1 - u) * (1 - u) + 6 * (b - a) * u * (1 - u) + 3 * (1 - b) * u * u
  let u = x
  for (let i = 0; i < 6; i += 1) {
    const d = dBez(u, p1x, p2x)
    if (Math.abs(d) < 1e-6) break
    u -= (bez(u, p1x, p2x) - x) / d
    u = clamp01(u)
  }
  return bez(u, p1y, p2y)
}

/** Local progress of `s` inside [a, b]. */
export const span = (s: number, a: number, b: number) => clamp01((s - a) / (b - a))
