// Ordered (Bayer 4x4) dither field rendered at low resolution and scaled up with
// pixelated sampling. Call from an effect only.

import { BAYER4 as BAYER } from './bayer'
import { prefersReducedMotion } from './scheduler'

export type DitherOptions = {
  /** Size of one dither pixel in CSS px. */
  pixel?: number
  /** RGB of the "on" pixels. */
  color?: [number, number, number]
  /** 'rise' fades from solid (bottom) to empty (top); 'wave' is a drifting cloud. */
  mode?: 'rise' | 'wave'
}

export function createDitherField(canvas: HTMLCanvasElement, options: DitherOptions = {}) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return () => undefined
  const pixel = options.pixel ?? 4
  const [cr, cg, cb] = options.color ?? [8, 118, 108]
  const mode = options.mode ?? 'rise'
  const reduced = prefersReducedMotion() || typeof IntersectionObserver === 'undefined'
  let raf = 0
  let visible = true
  let destroyed = false
  let w = 0
  let h = 0
  let image: ImageData | null = null
  const started = performance.now()

  function resize() {
    w = Math.max(1, Math.ceil(canvas.clientWidth / pixel))
    h = Math.max(1, Math.ceil(canvas.clientHeight / pixel))
    canvas.width = w
    canvas.height = h
    image = ctx!.createImageData(w, h)
    if (reduced) draw(0)
  }

  function field(u: number, v: number, t: number) {
    const drift = Math.sin(u * 5.2 + t / 1500) * Math.cos(v * 2.6 - t / 2100) * 0.22 + Math.sin((u + v) * 11 + t / 1100) * 0.08
    if (mode === 'wave') return 0.5 + Math.sin(u * 6 + t / 1400) * Math.cos(v * 3 - t / 1900) * 0.45 - v * 0.2 + drift * 0.5
    return v * 1.15 - 0.12 + drift
  }

  function draw(t: number) {
    if (!image) return
    const data = image.data
    for (let y = 0; y < h; y += 1) {
      const v = y / h
      for (let x = 0; x < w; x += 1) {
        const i = (y * w + x) * 4
        const on = field(x / w, v, t) > (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16
        data[i] = cr
        data[i + 1] = cg
        data[i + 2] = cb
        data[i + 3] = on ? 255 : 0
      }
    }
    ctx!.putImageData(image, 0, 0)
  }

  function loop() {
    raf = 0
    if (destroyed || !visible || document.hidden) return
    draw(performance.now() - started)
    raf = requestAnimationFrame(loop)
  }

  function kick() {
    if (reduced) return
    if (!raf) raf = requestAnimationFrame(loop)
  }

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
  ro?.observe(canvas)
  const io =
    typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver((entries) => {
          visible = entries.some((e) => e.isIntersecting)
          if (visible) kick()
        })
      : null
  io?.observe(canvas)
  const onVisibility = () => {
    if (!document.hidden) kick()
  }
  document.addEventListener('visibilitychange', onVisibility)
  resize()
  draw(0)
  kick()

  return () => {
    destroyed = true
    if (raf) cancelAnimationFrame(raf)
    ro?.disconnect()
    io?.disconnect()
    document.removeEventListener('visibilitychange', onVisibility)
  }
}

/**
 * Scroll-driven dither band (C2). The caller computes `p` (0 = band top at the
 * viewport bottom, 1 = band bottom at the viewport top) and calls setProgress;
 * nothing animates on its own. Drawn at 1/pixel resolution with ImageData.
 */
export function createScrollDither(canvas: HTMLCanvasElement, opts: { pixel?: number; color?: [number, number, number] } = {}) {
  const ctx = canvas.getContext('2d')
  const pixel = opts.pixel ?? 4
  const [cr, cg, cb] = opts.color ?? [8, 118, 108]
  let w = 0
  let h = 0
  let image: ImageData | null = null
  // field(u, v) − threshold, with the drift frozen at t = 0; only the p offset moves.
  let base = new Float32Array(0)
  let drawnP = Number.NaN
  let p = 0.7
  let destroyed = false

  function build() {
    if (!ctx) return
    const nw = Math.max(1, Math.ceil(canvas.clientWidth / pixel))
    const nh = Math.max(1, Math.ceil(canvas.clientHeight / pixel))
    if (nw === w && nh === h && image) return
    w = nw
    h = nh
    canvas.width = w
    canvas.height = h
    image = ctx.createImageData(w, h)
    base = new Float32Array(w * h)
    for (let y = 0; y < h; y += 1) {
      const v = y / h
      for (let x = 0; x < w; x += 1) {
        const u = x / w
        const drift = Math.sin(u * 5.2) * Math.cos(v * 2.6) * 0.22 + Math.sin((u + v) * 11) * 0.08
        base[y * w + x] = v * 1.15 - 0.12 + drift - (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16
      }
    }
    const data = image.data
    for (let i = 0; i < w * h; i += 1) {
      data[i * 4] = cr
      data[i * 4 + 1] = cg
      data[i * 4 + 2] = cb
    }
    drawnP = Number.NaN
  }

  function draw() {
    if (!ctx || !image || destroyed) return
    const offset = (1 - p) * 0.35
    const data = image.data
    for (let i = 0; i < base.length; i += 1) data[i * 4 + 3] = base[i] > offset ? 255 : 0
    ctx.putImageData(image, 0, 0)
    drawnP = p
  }

  const ro =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          build()
          draw()
        })
      : null
  ro?.observe(canvas)
  build()

  return {
    setProgress(next: number) {
      if (destroyed || !Number.isFinite(next)) return
      p = Math.max(0, Math.min(1, next))
      if (Number.isNaN(drawnP) || Math.abs(p - drawnP) > 0.002) draw()
    },
    destroy() {
      destroyed = true
      ro?.disconnect()
    },
  }
}
