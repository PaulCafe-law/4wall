// The sticky Canvas2D stage (C1): a floor plan that stands up into an
// isometric warehouse. Client-only; loaded with a dynamic import.
//
// Scroll-driven beats are pure functions of `s` (so scrolling back reverses
// them). Time-based motion (AGVs, heat, ghosts, dash flow) runs in one
// scheduler 'loop' task; short one-shot animations (intro, edits, slots,
// fades) run in a transient task that also works while loops are paused.

import { BAYER4 } from './bayer'
import { clamp01, easeInOut, easeOut, easeOutBack, lerp, span } from './ease'
import { ISO_REGION, PLAN_REGION, STAGE_LABELS, buildFloorModel, timesSignAt, type FloorModel, type FloorVariant, type Locale, type Rack, type Rect, type Vec2 } from './floorModel'
import { addTask, isPaused, motionSupported } from './scheduler'

export type EditState = { a01Tall: boolean; bShift: 0 | 1 }

export interface FloorStageHandle {
  setProgress(s: number): void
  setEdits(next: EditState): Promise<void>
  setSlots(n: number): void
  flashBatchFail(): void
  setPaused(p: boolean): void
  resize(): void
  destroy(): void
  onFirstFrame(cb: () => void): void
}

// A.1 tokens only.
const C = {
  ink: '#111111',
  dark: '#141414',
  floor: '#eceeee',
  grid: '#e3e6e6',
  gridStrong: '#d9dede',
  paper: '#ffffff',
  line: '#e5e7eb',
  lineStrong: '#d6dadf',
  t900: '#04443e',
  t600: '#08766c',
  t500: '#0f9183',
  t400: '#13a090',
  t300: '#a9d4cb',
  t200: '#c9e4de',
  t100: '#eaf6f3',
  t50: '#e6f2f0',
  tHair: '#cfe5e1',
  o600: '#b45309',
  o50: '#fff7ed',
  oLine: '#ecd3bd',
}
const MONO = '"JetBrains Mono", ui-monospace, "Cascadia Mono", Consolas, monospace'
const ZH = '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif'
const LABEL = '"JetBrains Mono", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", monospace'

const DEG = Math.PI / 180
const ISO_T = 45 * DEG
const ISO_P = 35.264 * DEG
const TOP_P = 90 * DEG
const SPEED = 0.0014 // m per ms (1.4 m/s)
const DWELL = 400
const IDLE_LAP = 12000
const DASHES: number[][] = [[], [6, 4], [2, 3], [1, 3], [8, 3, 2, 3], [4, 2]]

// ---------------------------------------------------------------------------
// Small helpers

type Tween = { from: number; to: number; t0: number; dur: number; ease: (t: number) => number }
const linear = (t: number) => clamp01(t)
const fixed = (v: number): Tween => ({ from: v, to: v, t0: 0, dur: 0, ease: linear })
const twValue = (tw: Tween, now: number) => (tw.dur <= 0 || now >= tw.t0 + tw.dur ? tw.to : now <= tw.t0 ? tw.from : lerp(tw.from, tw.to, tw.ease((now - tw.t0) / tw.dur)))
const twBusy = (tw: Tween, now: number) => tw.dur > 0 && now < tw.t0 + tw.dur

/** Polyline with cumulative lengths, for sampling by distance. */
type RPath = { xs: number[]; ys: number[]; cum: number[]; len: number; closed: boolean }

function toPath(points: Vec2[], closed: boolean): RPath {
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  if (closed) {
    xs.push(xs[0])
    ys.push(ys[0])
  }
  const cum = [0]
  for (let k = 1; k < xs.length; k += 1) cum.push(cum[k - 1] + Math.hypot(xs[k] - xs[k - 1], ys[k] - ys[k - 1]))
  return { xs, ys, cum, len: cum[cum.length - 1], closed }
}

type Sample = { x: number; y: number; hx: number; hy: number }

function sampleAt(p: RPath, dist: number, out: Sample) {
  let d = dist
  if (p.closed) d = ((d % p.len) + p.len) % p.len
  else d = Math.max(0, Math.min(p.len, d))
  const n = p.xs.length
  let k = 1
  while (k < n - 1 && p.cum[k] < d) k += 1
  const seg = p.cum[k] - p.cum[k - 1]
  const f = seg > 0 ? (d - p.cum[k - 1]) / seg : 0
  const dx = p.xs[k] - p.xs[k - 1]
  const dy = p.ys[k] - p.ys[k - 1]
  out.x = p.xs[k - 1] + dx * f
  out.y = p.ys[k - 1] + dy * f
  if (seg > 0) {
    out.hx = dx / seg
    out.hy = dy / seg
  }
  return out
}

function nearestDist(p: RPath, x: number, y: number) {
  let best = Infinity
  let bestD = 0
  for (let k = 1; k < p.xs.length; k += 1) {
    const ax = p.xs[k - 1]
    const ay = p.ys[k - 1]
    const dx = p.xs[k] - ax
    const dy = p.ys[k] - ay
    const seg = dx * dx + dy * dy
    const f = seg > 0 ? clamp01(((x - ax) * dx + (y - ay) * dy) / seg) : 0
    const qx = ax + dx * f - x
    const qy = ay + dy * f - y
    const dd = qx * qx + qy * qy
    if (dd < best) {
      best = dd
      bestD = p.cum[k - 1] + Math.sqrt(seg) * f
    }
  }
  return bestD
}

type Agv = {
  path: number
  entry: RPath | null
  phase: 0 | 1 | 2 // 0 parked at charge, 1 entry path, 2 on loop
  d: number
  delay: number
  dwell: number
  dwelt: boolean
  wait: number
  cool: number
  s: Sample
}

type BoxItem = { key: number; kind: 0 | 1 | 2 | 3 | 4; i: number }

const inertHandle = (): FloorStageHandle => ({
  setProgress() {},
  setEdits: () => Promise.resolve(),
  setSlots() {},
  flashBatchFail() {},
  setPaused() {},
  resize() {},
  destroy() {},
  onFirstFrame() {},
})

// ---------------------------------------------------------------------------

export function createFloorStage(canvas: HTMLCanvasElement, opts: { model: FloorModel; locale: Locale; reduced: boolean; variant: FloorVariant }): FloorStageHandle {
  const maybe = canvas.getContext('2d')
  if (!maybe) return inertHandle()
  const ctx: CanvasRenderingContext2D = maybe
  const { locale, variant } = opts
  const still = opts.reduced || !motionSupported()
  const labels = STAGE_LABELS[locale]
  const a01Target = { fx: opts.model.a01Screen[0], fy: opts.model.a01Screen[1], zoom: opts.model.a01Zoom }

  const nav = navigator as Navigator & { deviceMemory?: number }
  const lowEnd = (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4 || variant === 'mobile'
  const dprCap = lowEnd ? 1.5 : 2

  let destroyed = false
  let W = 0
  let H = 0
  let dpr = 1
  let s = 0
  let paused = isPaused()
  let level = 0 // auto-degrade level (C1.6)

  // ---- model runtime -------------------------------------------------------
  let model = opts.model
  let MX = model.cx
  let MY = model.cy
  let loopPaths: { base: RPath[]; bShifted: RPath[] } = { base: [], bShifted: [] }
  let entryPaths: { base: RPath[]; bShifted: RPath[] } = { base: [], bShifted: [] }
  let idlePath = toPath(model.idleLoop.points, true)
  let introOrder: number[] = []
  let introCount = 0
  let rackIdx = { a01: 0, a07: 0, est: [] as number[] }
  let heat = new Float64Array(0)
  let heatLv = new Uint8Array(0)
  let agvs: Agv[] = []

  function loadModel(next: FloorModel) {
    model = next
    MX = model.cx
    MY = model.cy
    const mk = (key: 'base' | 'bShifted') => model.layouts[key].loops.map((l) => toPath(l.points, true))
    const me = (key: 'base' | 'bShifted') => model.layouts[key].entries.map((e) => toPath(e.points, false))
    loopPaths = { base: mk('base'), bShifted: mk('bShifted') }
    entryPaths = { base: me('base'), bShifted: me('bShifted') }
    idlePath = toPath(model.idleLoop.points, true)
    const order = model.racks.map((r, i) => ({ i, k: r.x + r.y, e: r.estimated })).filter((o) => !o.e)
    order.sort((a, b) => a.k - b.k || a.i - b.i)
    introOrder = new Array<number>(model.racks.length).fill(-1)
    order.forEach((o, n) => {
      introOrder[o.i] = n
    })
    introCount = order.length + model.stations.length
    rackIdx = {
      a01: model.racks.findIndex((r) => r.id === model.ids.a01),
      a07: model.racks.findIndex((r) => r.id === model.ids.a07),
      est: model.racks.map((r, i) => (r.estimated ? i : -1)).filter((i) => i >= 0),
    }
    heat = new Float64Array(model.grid.cols * model.grid.rows)
    heatLv = new Uint8Array(heat.length)
    agvs = model.layouts.base.loops.map((_, i) => ({ path: i, entry: null, phase: 0, d: 0, delay: 0, dwell: 0, dwelt: false, wait: 0, cool: 0, s: { x: 0, y: 0, hx: 1, hy: 0 } }))
    sortedFor = NaN
  }

  // ---- edits, slots, flashes ----------------------------------------------
  let edits: EditState = { a01Tall: false, bShift: 0 }
  let layoutKey: 'base' | 'bShifted' = 'base'
  let a01Tw = fixed(0)
  let beaconTw = fixed(0)
  let bTw = fixed(0)
  let routeTw = fixed(1)
  let routeFlashT0 = -Infinity
  let slotTw = fixed(3)
  let slotN = 3
  let flashT0 = -Infinity
  const timers = new Set<number>()
  const pendingResolves = new Set<() => void>()

  // ---- time state ---------------------------------------------------------
  let clock = 0 // pausable engine clock (ms)
  let introT0 = -1
  let fontsReady = false
  let fontsAt = 0
  let fleetOn = false
  let fleetClock = 0
  let fleetTw = fixed(0)
  let ghostOn = false
  let ghostClock = 0
  let ghostTw = fixed(0)
  let panX = 0
  let panY = 0
  let panTX = 0
  let panTY = 0

  // ---- frame bookkeeping --------------------------------------------------
  let lastDrawNow = -1
  let lastLoopAt = -Infinity
  let firstFramed = false
  const firstFrameCbs: Array<() => void> = []
  let frameSamples = 0
  let frameTotal = 0
  let degradeWindows = 0
  let removeLoop: (() => void) | null = null
  let removeAnim: (() => void) | null = null

  // ---- patterns -----------------------------------------------------------
  let heatTiles: Array<CanvasPattern | null> = []
  let inkTiles: Array<CanvasPattern | null> = []
  let stripes: CanvasPattern | null = null
  let patternDpr = 0

  function bayerTiles(cell: number, color: string) {
    const px = Math.max(1, Math.round(cell * dpr))
    const tiles: Array<CanvasPattern | null> = []
    for (let k = 0; k <= 16; k += 1) {
      const c = document.createElement('canvas')
      c.width = px * 4
      c.height = px * 4
      const g = c.getContext('2d')
      if (g) {
        g.fillStyle = color
        for (let y = 0; y < 4; y += 1) for (let x = 0; x < 4; x += 1) if (BAYER4[y * 4 + x] < k) g.fillRect(x * px, y * px, px, px)
      }
      tiles.push(ctx.createPattern(c, 'repeat'))
    }
    return tiles
  }

  function buildPatterns() {
    patternDpr = dpr
    heatTiles = bayerTiles(model.heatPixel, 'rgba(8,118,108,.85)')
    inkTiles = bayerTiles(1, C.ink)
    // 45° ochre stripes, ~4 CSS px wide, 70%.
    const size = Math.max(4, Math.round(11 * dpr))
    const c = document.createElement('canvas')
    c.width = size
    c.height = size
    const g = c.getContext('2d')
    if (g) {
      const img = g.createImageData(size, size)
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          if ((x + y) % size < size / 2) {
            const o = (y * size + x) * 4
            img.data[o] = 180
            img.data[o + 1] = 83
            img.data[o + 2] = 9
            img.data[o + 3] = 179
          }
        }
      }
      g.putImageData(img, 0, 0)
    }
    stripes = ctx.createPattern(c, 'repeat')
  }

  /** Use a device-pixel-aligned pattern regardless of the current transform. */
  function screenPattern(p: CanvasPattern | null) {
    if (!p) return C.ink
    p.setTransform(ctx.getTransform().invertSelf())
    return p
  }

  // ---- camera -------------------------------------------------------------
  let cT = 1
  let sT = 0
  let sP = 1
  let cP = 0
  let U = 1
  let OX = 0
  let OY = 0
  let planRect: Rect = { x: 0, y: 0, w: 1, h: 1 }
  let isoRect: Rect = { x: 0, y: 0, w: 1, h: 1 }
  let uPlan = 1
  let uIso = 1
  let isoBC: Vec2 = [0, 0]

  const sx = (x: number, y: number) => ((x - MX) * cT - (y - MY) * sT) * U + OX
  const sy = (x: number, y: number, z: number) => ((x - MX) * sT + (y - MY) * cT) * sP * U - z * cP * U + OY

  function unitBounds(t: number, p: number) {
    const ct = Math.cos(t)
    const st = Math.sin(t)
    const sp = Math.sin(p)
    const cp = Math.cos(p)
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    const add = (x: number, y: number, z: number) => {
      const X = x - MX
      const Y = y - MY
      const a = X * ct - Y * st
      const b = (X * st + Y * ct) * sp - z * cp
      minX = Math.min(minX, a)
      maxX = Math.max(maxX, a)
      minY = Math.min(minY, b)
      maxY = Math.max(maxY, b)
    }
    const fw = model.width
    const fh = model.height
    add(-1, -1, 0)
    add(fw + 1, -1, 0)
    add(fw + 1, fh + 1, 0)
    add(-1, fh + 1, 0)
    const b = model.rackBlock
    add(b.x, b.y, model.maxZ)
    add(b.x + b.w, b.y, model.maxZ)
    add(b.x, b.y + b.h, model.maxZ)
    return { minX, maxX, minY, maxY }
  }

  function layoutCamera() {
    planRect = PLAN_REGION(variant, W, H)
    isoRect = ISO_REGION(variant, W, H)
    uPlan = Math.min(planRect.w / (model.width + 2), planRect.h / (model.height + 2))
    const b = unitBounds(ISO_T, ISO_P)
    uIso = Math.min(isoRect.w / (b.maxX - b.minX), isoRect.h / (b.maxY - b.minY))
    isoBC = [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2]
  }

  function setAngles(t: number, p: number) {
    cT = Math.cos(t)
    sT = Math.sin(t)
    sP = Math.sin(p)
    cP = Math.cos(p)
  }

  function camera(se: number) {
    const pcx = planRect.x + planRect.w / 2
    const pcy = planRect.y + planRect.h / 2
    const icx = isoRect.x + isoRect.w / 2
    const icy = isoRect.y + isoRect.h / 2
    if (se < 3) {
      setAngles(0, TOP_P)
      U = uPlan
      OX = pcx
      OY = pcy
    } else if (se < 3.55) {
      const e = easeInOut(span(se, 3, 3.55))
      const t = ISO_T * e
      const p = TOP_P - (TOP_P - ISO_P) * e
      setAngles(t, p)
      const b = unitBounds(t, p)
      U = lerp(uPlan, uIso, e) * lerp(1, 0.92, e)
      OX = lerp(pcx, icx, e) - ((b.minX + b.maxX) / 2) * U
      OY = lerp(pcy, icy, e) - ((b.minY + b.maxY) / 2) * U
    } else {
      setAngles(ISO_T, ISO_P)
      const r = model.racks[rackIdx.a01]
      const ax = (r.x - MX) * cT - (r.y - MY) * sT
      const ay = ((r.x - MX) * sT + (r.y - MY) * cT) * sP - 1.5 * cP
      const uA = uIso * 0.92
      const uZ = uIso * a01Target.zoom
      const zx = W * a01Target.fx - ax * uZ
      const zy = H * a01Target.fy - ay * uZ
      if (se < 4) {
        U = uA
        OX = icx - isoBC[0] * uA
        OY = icy - isoBC[1] * uA
      } else if (se < 5) {
        const e = easeInOut(span(se, 4, 4.3))
        U = lerp(uA, uZ, e)
        OX = lerp(icx - isoBC[0] * uA, zx, e)
        OY = lerp(icy - isoBC[1] * uA, zy, e)
      } else {
        const e = easeInOut(span(se, 5, 5.25))
        U = lerp(uZ, uIso, e)
        OX = lerp(zx, icx - isoBC[0] * uIso, e)
        OY = lerp(zy, icy - isoBC[1] * uIso, e)
      }
    }
    OX += panX
    OY += panY
  }

  /** Canvas transform that maps floor metres ×100 onto the floor plane (stencils). */
  function floorTransform() {
    const k = 0.01
    const e = OX - (MX * cT - MY * sT) * U
    const f = OY - (MX * sT + MY * cT) * sP * U
    ctx.setTransform(dpr * U * cT * k, dpr * U * sT * sP * k, -dpr * U * sT * k, dpr * U * cT * sP * k, dpr * e, dpr * f)
  }
  const baseTransform = () => ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  // ---- path helpers -------------------------------------------------------
  function quad(x0: number, y0: number, x1: number, y1: number, z: number) {
    ctx.moveTo(sx(x0, y0), sy(x0, y0, z))
    ctx.lineTo(sx(x1, y0), sy(x1, y0, z))
    ctx.lineTo(sx(x1, y1), sy(x1, y1, z))
    ctx.lineTo(sx(x0, y1), sy(x0, y1, z))
    ctx.closePath()
  }

  const PX = [0, 0, 0, 0, 0]
  const PY = [0, 0, 0, 0, 0]
  /** Add the first `p` fraction of a closed screen polygon (PX/PY, n points) to the path. */
  function partialPoly(n: number, p: number) {
    if (p <= 0) return
    if (p >= 1) {
      ctx.moveTo(PX[0], PY[0])
      for (let k = 1; k < n; k += 1) ctx.lineTo(PX[k], PY[k])
      ctx.closePath()
      return
    }
    let total = 0
    for (let k = 0; k < n; k += 1) total += Math.hypot(PX[(k + 1) % n] - PX[k], PY[(k + 1) % n] - PY[k])
    let left = total * p
    ctx.moveTo(PX[0], PY[0])
    for (let k = 0; k < n; k += 1) {
      const nx = PX[(k + 1) % n]
      const ny = PY[(k + 1) % n]
      const seg = Math.hypot(nx - PX[k], ny - PY[k])
      if (seg >= left) {
        const f = seg > 0 ? left / seg : 0
        ctx.lineTo(PX[k] + (nx - PX[k]) * f, PY[k] + (ny - PY[k]) * f)
        return
      }
      ctx.lineTo(nx, ny)
      left -= seg
    }
  }

  function footprint(x0: number, y0: number, x1: number, y1: number, z: number) {
    PX[0] = sx(x0, y0)
    PY[0] = sy(x0, y0, z)
    PX[1] = sx(x1, y0)
    PY[1] = sy(x1, y0, z)
    PX[2] = sx(x1, y1)
    PY[2] = sy(x1, y1, z)
    PX[3] = sx(x0, y1)
    PY[3] = sy(x0, y1, z)
  }

  /** Add a distance range of a path (on the floor) to the current canvas path. */
  function tracePath(p: RPath, d0: number, d1: number) {
    const tmp: Sample = { x: 0, y: 0, hx: 1, hy: 0 }
    if (d1 - d0 >= p.len - 1e-6 && p.closed) {
      ctx.moveTo(sx(p.xs[0], p.ys[0]), sy(p.xs[0], p.ys[0], 0))
      for (let k = 1; k < p.xs.length; k += 1) ctx.lineTo(sx(p.xs[k], p.ys[k]), sy(p.xs[k], p.ys[k], 0))
      return
    }
    sampleAt(p, d0, tmp)
    ctx.moveTo(sx(tmp.x, tmp.y), sy(tmp.x, tmp.y, 0))
    let d = d0
    const len = p.len
    while (d < d1 - 1e-6) {
      const local = p.closed ? ((d % len) + len) % len : Math.min(d, len)
      let k = 1
      while (k < p.cum.length - 1 && p.cum[k] <= local + 1e-9) k += 1
      const step = Math.min(p.cum[k] - local, d1 - d)
      if (step <= 1e-9) break
      d += step
      sampleAt(p, d, tmp)
      ctx.lineTo(sx(tmp.x, tmp.y), sy(tmp.x, tmp.y, 0))
      if (!p.closed && d >= len) break
    }
  }

  // ---- boxes --------------------------------------------------------------
  type BoxStyle = { left: string; right: string; top: string; stroke: string | null; faceA: number; edgeP: number; dashed: boolean; shelves: boolean; lineWidth: number }
  const boxStyle: BoxStyle = { left: '', right: '', top: '', stroke: null, faceA: 1, edgeP: 1, dashed: false, shelves: false, lineWidth: 1 }

  function drawBox(x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, st: BoxStyle, alpha: number) {
    const hz = (z1 - z0) * cP * U
    const bxA = sx(x0, y0)
    const byA = sy(x0, y0, z0)
    const bxB = sx(x1, y0)
    const byB = sy(x1, y0, z0)
    const bxC = sx(x1, y1)
    const byC = sy(x1, y1, z0)
    const bxD = sx(x0, y1)
    const byD = sy(x0, y1, z0)
    if (st.faceA > 0) {
      ctx.globalAlpha = alpha * st.faceA
      ctx.beginPath()
      ctx.moveTo(bxD, byD)
      ctx.lineTo(bxC, byC)
      ctx.lineTo(bxC, byC - hz)
      ctx.lineTo(bxD, byD - hz)
      ctx.closePath()
      ctx.fillStyle = st.left
      ctx.fill()
      if (sT > 1e-3) {
        ctx.beginPath()
        ctx.moveTo(bxB, byB)
        ctx.lineTo(bxC, byC)
        ctx.lineTo(bxC, byC - hz)
        ctx.lineTo(bxB, byB - hz)
        ctx.closePath()
        ctx.fillStyle = st.right
        ctx.fill()
      }
      ctx.beginPath()
      ctx.moveTo(bxA, byA - hz)
      ctx.lineTo(bxB, byB - hz)
      ctx.lineTo(bxC, byC - hz)
      ctx.lineTo(bxD, byD - hz)
      ctx.closePath()
      ctx.fillStyle = st.top
      ctx.fill()
    }
    if (!st.stroke) return
    ctx.strokeStyle = st.stroke
    ctx.lineWidth = st.lineWidth
    if (st.shelves && st.faceA > 0) {
      ctx.globalAlpha = alpha * st.faceA * 0.4
      ctx.beginPath()
      for (let z = 0.6; z < z1 - z0 - 0.05; z += 0.6) {
        const o = z * cP * U
        ctx.moveTo(bxD, byD - o)
        ctx.lineTo(bxC, byC - o)
        ctx.lineTo(bxB, byB - o)
      }
      ctx.stroke()
    }
    ctx.globalAlpha = alpha
    if (st.dashed) ctx.setLineDash([4, 3])
    ctx.beginPath()
    PX[0] = bxA
    PY[0] = byA - hz
    PX[1] = bxB
    PY[1] = byB - hz
    PX[2] = bxC
    PY[2] = byC - hz
    PX[3] = bxD
    PY[3] = byD - hz
    partialPoly(4, st.edgeP)
    ctx.moveTo(bxD, byD - hz)
    ctx.lineTo(bxD, byD)
    ctx.lineTo(bxC, byC)
    ctx.lineTo(bxB, byB)
    ctx.lineTo(bxB, byB - hz)
    ctx.moveTo(bxC, byC)
    ctx.lineTo(bxC, byC - hz)
    ctx.stroke()
    if (st.dashed) ctx.setLineDash([])
  }

  // ---- intro (H3/H4) ------------------------------------------------------
  const introOutline = (order: number, now: number) => (still || introT0 < 0 ? (still ? 1 : 0) : easeOut((now - introT0 - order * 8) / 240))
  const h3End = () => (introCount - 1) * 8 + 240
  const sprayStart = () => Math.max(introT0 + 500, fontsAt)
  function stencilLevel(k: number, now: number) {
    if (still) return 16
    if (introT0 < 0 || !fontsReady) return 0
    return Math.max(0, Math.min(16, Math.ceil((now - sprayStart() - k * 60) / 40)))
  }
  function introBusy(now: number) {
    if (still) return false
    if (introT0 < 0) return true
    if (!fontsReady) return true
    return now < Math.max(introT0 + h3End(), sprayStart() + (model.stencils.length + 1) * 60 + 640) + 40
  }

  // ---- effective progress -------------------------------------------------
  /** Reduced motion: every step shows its final state (hard cuts). */
  const effS = (v: number) => (still && v >= 2 ? Math.min(8, Math.floor(v) + 0.999) : v)

  // ---- fleet ---------------------------------------------------------------
  const curLoops = () => loopPaths[layoutKey]
  const curEntries = () => entryPaths[layoutKey]

  function placeFleetAtStarts() {
    const loops = curLoops()
    agvs.forEach((a, i) => {
      a.phase = 2
      a.d = 0
      a.delay = 0
      a.dwell = 0
      a.dwelt = false
      a.wait = 0
      a.cool = 0
      a.entry = null
      sampleAt(loops[i], 0, a.s)
    })
  }

  function startFleet(now: number) {
    fleetClock = 0
    heat.fill(0)
    if (still) {
      placeFleetAtStarts()
      fleetTw = fixed(1)
      return
    }
    const entries = curEntries()
    agvs.forEach((a, i) => {
      a.phase = 0
      a.d = 0
      a.delay = i * 300
      a.dwell = 0
      a.dwelt = false
      a.wait = 0
      a.cool = 0
      a.entry = entries[i]
      sampleAt(entries[i], 0, a.s)
    })
    fleetTw = { from: twValue(fleetTw, now), to: 1, t0: now, dur: 400, ease: easeOut }
  }

  function moving(a: Agv) {
    return a.phase !== 0 && a.dwell <= 0 && a.wait <= 0
  }

  function shouldWait(i: number) {
    const a = agvs[i]
    if (a.cool > 0) return false
    for (let j = 0; j < agvs.length; j += 1) {
      if (j === i) continue
      const b = agvs[j]
      if (b.phase === 0) continue
      const dx = b.s.x - a.s.x
      const dy = b.s.y - a.s.y
      if (dx * dx + dy * dy > 0.81) continue
      const ahead = dx * a.s.hx + dy * a.s.hy > 0.05
      if (!ahead) continue
      const vbx = moving(b) ? b.s.hx : 0
      const vby = moving(b) ? b.s.hy : 0
      const converging = dx * (a.s.hx - vbx) + dy * (a.s.hy - vby) > 1e-3
      if (!converging) continue
      const headOn = -dx * b.s.hx + -dy * b.s.hy > 0.05 && moving(b)
      if (headOn && i < j) continue
      return true
    }
    return false
  }

  function tickFleet(dt: number) {
    const loops = curLoops()
    const { cols, rows } = model.grid
    for (let i = 0; i < agvs.length; i += 1) {
      const a = agvs[i]
      if (a.cool > 0) a.cool -= dt
      if (a.phase === 0) {
        a.delay -= dt
        if (a.delay <= 0) a.phase = 1
        continue
      }
      if (a.dwell > 0) {
        a.dwell -= dt
      } else if (shouldWait(i)) {
        a.wait += dt
        if (a.wait >= 600) {
          a.wait = 0
          a.cool = 1200
        }
      } else {
        a.wait = 0
        const step = SPEED * dt
        if (a.phase === 1 && a.entry) {
          // Dispatch from CHARGE is quick (3x) so the fleet reaches its loops fast.
          const e = a.entry
          a.d += step * 3
          sampleAt(e, a.d, a.s)
          if (a.d >= e.len) {
            a.phase = 2
            a.entry = null
            a.d = nearestDist(loops[a.path], a.s.x, a.s.y)
            a.dwelt = false
          }
        } else {
          a.phase = 2
          const loop = loops[a.path]
          const dwellAt = model.layouts[layoutKey].loops[a.path].dwellAt
          const prev = a.d
          a.d += step
          if (!a.dwelt && prev < dwellAt && a.d >= dwellAt) {
            a.d = dwellAt
            a.dwell = DWELL
            a.dwelt = true
          }
          if (a.d >= loop.len) {
            a.d -= loop.len
            a.dwelt = false
          }
          sampleAt(loop, a.d, a.s)
        }
      }
      if (a.phase !== 2) continue
      const ci = Math.round(a.s.x)
      const cj = Math.floor(a.s.y + 0.5 - 1e-6)
      if (ci >= 0 && cj >= 0 && ci < cols && cj < rows) heat[cj * cols + ci] += dt / 1000
    }
  }

  function updateHysteresis(now: number) {
    // Reduced motion hard-cuts per step, so decide on whole steps there; effS would
    // map every s in [4, 5) to 4.999 and never drop below the 4.8 / 6.8 bands.
    const se = still ? Math.floor(s) : s
    if (!fleetOn && se >= 5) {
      fleetOn = true
      startFleet(now)
    } else if (fleetOn && (still ? se < 5 : se < 4.8)) {
      fleetOn = false
      fleetTw = still ? fixed(0) : { from: twValue(fleetTw, now), to: 0, t0: now, dur: 300, ease: linear }
    }
    if (!ghostOn && se >= 7) {
      ghostOn = true
      ghostClock = 0
      ghostTw = still ? fixed(1) : { from: twValue(ghostTw, now), to: 1, t0: now, dur: 300, ease: linear }
    } else if (ghostOn && (still ? se < 7 : se < 6.8)) {
      ghostOn = false
      ghostTw = still ? fixed(0) : { from: twValue(ghostTw, now), to: 0, t0: now, dur: 300, ease: linear }
    }
  }

  // ---- drawing ------------------------------------------------------------
  const tmpS: Sample = { x: 0, y: 0, hx: 1, hy: 0 }
  let sortedRacks: number[] = []
  let sortedFor = NaN

  function rackX(r: Rack, bv: number) {
    return r.pair === model.bPair.pair ? r.x + model.bPair.dx * bv : r.x
  }

  function sortRacks(theta: number, bv: number) {
    const key = Math.round(theta / (0.5 * DEG)) * 10 + bv
    if (key === sortedFor) return
    sortedFor = key
    const keys = model.racks.map((r) => (rackX(r, bv) - MX) * sT + (r.y - MY) * cT)
    sortedRacks = model.racks.map((_, i) => i).sort((a, b) => keys[a] - keys[b])
  }

  function pill(text: string, x: number, y: number, kind: 'est' | 'prov' | 'jam' | 'scan', alpha: number) {
    if (alpha <= 0.01) return
    ctx.font = `600 11px ${LABEL}`
    const w = Math.ceil(ctx.measureText(text).width) + 16
    const h = 20
    const x0 = Math.round(x - w / 2) + 0.5
    const y0 = Math.round(y - h / 2) + 0.5
    ctx.globalAlpha = alpha
    ctx.beginPath()
    const r = h / 2
    ctx.moveTo(x0 + r, y0)
    ctx.lineTo(x0 + w - r, y0)
    ctx.arc(x0 + w - r, y0 + r, r, -Math.PI / 2, Math.PI / 2)
    ctx.lineTo(x0 + r, y0 + h)
    ctx.arc(x0 + r, y0 + r, r, Math.PI / 2, (Math.PI * 3) / 2)
    ctx.closePath()
    const fill = kind === 'est' ? C.t50 : kind === 'jam' ? C.o50 : kind === 'scan' ? C.t600 : C.paper
    const stroke = kind === 'est' ? C.t600 : kind === 'jam' ? C.oLine : kind === 'scan' ? C.t600 : C.tHair
    ctx.fillStyle = fill
    ctx.fill()
    ctx.lineWidth = 1
    ctx.strokeStyle = stroke
    if (kind === 'est') ctx.setLineDash([3, 2])
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = kind === 'est' ? C.t900 : kind === 'jam' ? C.o600 : kind === 'scan' ? C.paper : C.ink
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x0 + w / 2, y0 + h / 2 + 0.5)
    return { x0, y0, w, h }
  }

  function draw(now: number) {
    if (!W || !H) return
    const se = effS(s)
    baseTransform()
    ctx.clearRect(0, 0, W, H)
    ctx.globalAlpha = 1
    camera(se)
    const theta = Math.atan2(sT, cT)
    const focus = span(se, 4, 4.3) * (1 - span(se, 5, 5.25))
    const dim = 1 - 0.55 * focus
    const bv = twValue(bTw, now)
    const a01v = twValue(a01Tw, now)
    const fleetA = twValue(fleetTw, now)
    const ghostA = twValue(ghostTw, now)
    const liveMul = lerp(1, 0.6, span(se, 6, 6.15)) * lerp(1, 0.25 / 0.6, span(se, 7, 7.15))
    const scanX = lerp(-0.5, model.width + 0.5, span(se, 2.4, 2.8))
    const estA = span(se, 2.6, 2.75)
    const palletA = 1 - span(se, 4, 4.15)
    const flash = now - flashT0 < 300
    const mw = model.width
    const mh = model.height

    // 1. Floor (always: the poster is hidden once the canvas is live).
    ctx.beginPath()
    quad(0, 0, mw, mh, 0)
    ctx.fillStyle = C.floor
    ctx.fill()
    ctx.strokeStyle = C.gridStrong
    ctx.lineWidth = 1
    ctx.stroke()

    // 2. 1 m grid on cell boundaries.
    ctx.beginPath()
    for (let i = 0; i < mw; i += 1) {
      ctx.moveTo(sx(i + 0.5, 0), sy(i + 0.5, 0, 0))
      ctx.lineTo(sx(i + 0.5, mh), sy(i + 0.5, mh, 0))
    }
    for (let j = 0; j < mh; j += 1) {
      ctx.moveTo(sx(0, j + 0.5), sy(0, j + 0.5, 0))
      ctx.lineTo(sx(mw, j + 0.5), sy(mw, j + 0.5, 0))
    }
    ctx.strokeStyle = C.grid
    ctx.stroke()

    // 3. Tapes, charge bays, zebra line, lane boxes, pallets.
    ctx.beginPath()
    for (const q of model.tapes) quad(q.x, q.y, q.x + q.w, q.y + q.h, 0)
    ctx.fillStyle = C.ink
    ctx.fill()
    ctx.beginPath()
    for (const q of model.chargeBays) quad(q.x + 0.08, q.y + 0.08, q.x + q.w - 0.08, q.y + q.h - 0.08, 0)
    ctx.globalAlpha = 0.6
    ctx.strokeStyle = C.ink
    ctx.stroke()
    ctx.globalAlpha = 1
    ctx.beginPath()
    for (const q of model.chargeBays) quad(q.x + q.w / 2 - 0.14, q.y + q.h - 0.36, q.x + q.w / 2 + 0.14, q.y + q.h - 0.12, 0)
    ctx.fillStyle = C.t500
    ctx.fill()

    if (se >= 4.85) {
      const p = span(se, 4.85, 5)
      const zx = model.zebraX
      ctx.beginPath()
      quad(zx - 0.17, 0.3, zx + 0.17, 0.3 + (mh - 0.6) * p, 0)
      ctx.fillStyle = C.paper
      ctx.fill()
      ctx.fillStyle = screenPattern(stripes)
      ctx.fill()
    }

    const lane = model.lanes[1]
    const slotsA = span(se, 6, 6.15)
    const slotC = twValue(slotTw, now)
    if (slotsA > 0) {
      const half = lane.slotSize / 2
      for (let k = 1; k <= 8; k += 1) {
        const a = clamp01(slotC - (k - 1)) * slotsA
        if (a <= 0) continue
        const [cx, cy] = lane.slots[k - 1]
        ctx.globalAlpha = a
        ctx.beginPath()
        quad(cx - half, cy - half, cx + half, cy + half, 0)
        ctx.strokeStyle = C.t600
        ctx.lineWidth = 1
        ctx.stroke()
        // L-corners
        const arm = Math.min(0.2, half * 0.5)
        ctx.beginPath()
        for (const [ox, oy] of [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ]) {
          const px = cx + ox * half
          const py = cy + oy * half
          ctx.moveTo(sx(px - ox * arm, py), sy(px - ox * arm, py, 0))
          ctx.lineTo(sx(px, py), sy(px, py, 0))
          ctx.lineTo(sx(px, py - oy * arm), sy(px, py - oy * arm, 0))
        }
        ctx.lineWidth = 2
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      ctx.lineWidth = 1
    }

    // Congestion overlay at the STATION 02 lane mouth.
    const jamA = fleetA * (still ? 1 : clamp01((fleetClock - 3000) / 300))
    if (jamA > 0 && fleetOn) {
      ctx.beginPath()
      for (let i = lane.cellX0; i <= lane.cellX0 + 1; i += 1) quad(i - 0.5, lane.y - 0.5, i + 0.5, lane.y + 0.5, 0)
      ctx.globalAlpha = jamA
      ctx.fillStyle = screenPattern(stripes)
      ctx.fill()
      ctx.globalAlpha = 1
    }

    const palletPos: Array<{ x: number; y: number; a: number }> = []
    if (se >= 2 && palletA > 0) {
      model.pallets.forEach((p, k) => {
        const t = span(se, 2 + 0.05 * k, 2.15 + 0.05 * k)
        if (t <= 0) return
        const dx = -(1 - easeOut(t)) * 2.4
        const a = easeOut(t) * palletA
        ctx.globalAlpha = a
        ctx.beginPath()
        quad(p.x + dx, p.y, p.x + p.w + dx, p.y + p.h, 0)
        ctx.fillStyle = C.ink
        ctx.fill()
        palletPos.push({ x: p.x + p.w / 2 + dx, y: p.y + p.h / 2, a })
      })
      ctx.globalAlpha = 1
    }

    // 4. Stencils and floor text.
    if (fontsReady) {
      floorTransform()
      ctx.textBaseline = 'alphabetic'
      model.stencils.forEach((st, k) => {
        const lv = stencilLevel(k, now)
        if (lv <= 0) return
        const fill = lv >= 16 ? C.ink : screenPattern(inkTiles[lv])
        ctx.fillStyle = fill
        ctx.globalAlpha = 0.82
        ctx.textAlign = st.align === 'center' ? 'center' : 'left'
        ctx.font = `700 ${st.size * 100}px ${MONO}`
        ctx.fillText(st.text, st.x * 100, st.y * 100)
        if (st.zh && locale === 'zh') {
          ctx.textAlign = 'left'
          ctx.font = `700 ${st.zh.size * 100}px ${ZH}`
          ctx.fillText(st.zh.text, st.zh.x * 100, st.zh.y * 100)
        }
      })
      if (slotsA > 0) {
        const t = timesSignAt(model)
        ctx.globalAlpha = slotsA * 0.9
        ctx.fillStyle = C.t600
        ctx.textAlign = 'left'
        ctx.font = `700 ${t.size * 100}px ${MONO}`
        ctx.fillText(`×${slotN}`, t.x * 100, t.y * 100)
      }
      if (palletPos.length) {
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = C.paper
        const fs = Math.min(model.pallets[0].w / 2.6, model.pallets[0].h * 0.4)
        ctx.font = `700 ${fs * 100}px ${MONO}`
        palletPos.forEach((p, k) => {
          ctx.globalAlpha = p.a
          ctx.fillText(model.pallets[k].label, p.x * 100, p.y * 100)
        })
      }
      const idA = 1 - span(se, 3, 3.12)
      if (se >= 2.4 && idA > 0 && U * 0.28 >= 5) {
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = C.t600
        ctx.font = `600 28px ${MONO}`
        for (const r of model.racks) {
          if (r.estimated) continue
          const a = clamp01((scanX - r.x) / 1.5) * idA
          if (a <= 0) continue
          ctx.globalAlpha = a
          ctx.fillText(r.id, rackX(r, bv) * 100, r.y * 100)
        }
      }
      baseTransform()
      ctx.globalAlpha = 1
    }

    // 5. Heat.
    const fleetVisible = fleetA > 0.001
    if (fleetVisible) {
      const { cols } = model.grid
      if (still) {
        const lv = model.layouts[layoutKey].heat
        for (let c = 0; c < heatLv.length; c += 1) heatLv[c] = lv[c]
      } else {
        let max = 0
        for (let c = 0; c < heat.length; c += 1) if (heat[c] > max) max = heat[c]
        for (let c = 0; c < heat.length; c += 1) heatLv[c] = max > 0 ? Math.round((heat[c] / max) * 16) : 0
      }
      ctx.globalAlpha = fleetA
      for (let L = 1; L <= 16; L += 1) {
        let any = false
        ctx.beginPath()
        for (let c = 0; c < heatLv.length; c += 1) {
          if (heatLv[c] !== L) continue
          any = true
          const i = c % cols
          const j = (c - i) / cols
          const off = model.cellYOffset[c]
          quad(i - 0.5, j - 0.5 + off, i + 0.5, j + 0.5 + off, 0)
        }
        if (!any) continue
        ctx.fillStyle = level >= 1 ? `rgba(8,118,108,${((0.85 * L) / 16).toFixed(3)})` : screenPattern(heatTiles[L])
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    // 6. Routes and ghost trails.
    const loops = curLoops()
    const routeReveal = twValue(routeTw, now)
    if (fleetVisible) {
      const flow = -(clock / 1000) * 24
      ctx.lineWidth = 1
      ctx.strokeStyle = C.t600
      loops.forEach((p, i) => {
        ctx.globalAlpha = 0.28 * fleetA * liveMul
        ctx.setLineDash(DASHES[i % DASHES.length])
        ctx.lineDashOffset = flow
        ctx.beginPath()
        tracePath(p, 0, p.len * routeReveal)
        ctx.stroke()
      })
      ctx.lineWidth = 1.5
      agvs.forEach((a, i) => {
        if (a.phase !== 2) return
        ctx.globalAlpha = 0.8 * fleetA * liveMul
        ctx.setLineDash(DASHES[i % DASHES.length])
        ctx.lineDashOffset = flow
        ctx.beginPath()
        tracePath(loops[i], a.d, a.d + 6)
        ctx.stroke()
      })
      ctx.setLineDash([])
      ctx.lineDashOffset = 0
    } else if (!still && now - routeFlashT0 < 2400 && now >= routeFlashT0 && se >= 3.55) {
      // Route preview after moving pair B while the fleet is off.
      const t = now - routeFlashT0
      const a = t < 2000 ? 1 : 1 - (t - 2000) / 400
      ctx.lineWidth = 1.5
      ctx.strokeStyle = C.t600
      loops.forEach((p, i) => {
        ctx.globalAlpha = 0.8 * a
        ctx.setLineDash(DASHES[i % DASHES.length])
        ctx.beginPath()
        tracePath(p, 0, p.len * routeReveal)
        ctx.stroke()
      })
      ctx.setLineDash([])
    }
    const ghostPos: Array<{ x: number; y: number; hx: number; hy: number; a: number } | null> = []
    if (ghostA > 0.001) {
      ctx.strokeStyle = C.ink
      ctx.lineWidth = 1.5
      loops.forEach((p, i) => {
        const dwellAt = model.layouts[layoutKey].loops[i].dwellAt
        const lap = p.len / SPEED + DWELL
        let d = p.len
        let trailA = 1
        let gp = true
        if (!still) {
          const tc = ghostClock % (lap + 600)
          if (tc < lap) {
            const t1 = dwellAt / SPEED
            d = tc < t1 ? tc * SPEED : tc < t1 + DWELL ? dwellAt : (tc - DWELL) * SPEED
          } else {
            trailA = 1 - (tc - lap) / 600
            gp = false
          }
        }
        ctx.globalAlpha = ghostA * trailA * 0.9
        ctx.beginPath()
        tracePath(p, 0, Math.min(p.len, d))
        ctx.stroke()
        if (gp) {
          sampleAt(p, still ? 0 : d, tmpS)
          ghostPos.push({ x: tmpS.x, y: tmpS.y, hx: tmpS.hx, hy: tmpS.hy, a: ghostA })
        } else ghostPos.push(null)
      })
      ctx.globalAlpha = 1
    }

    // 7. Racks, stations and vehicles.
    const flat = se < 3.15
    const rackStroke = (r: Rack) => (flash ? C.o600 : se >= 2.8 || (se >= 2.4 && r.x + 0.45 < scanX) ? C.t600 : C.ink)
    // 7a. Flat footprints (plan, tilt, and racks that have not started rising).
    {
      const inkPath: number[] = []
      const tealPath: number[] = []
      const dashPath: number[] = []
      model.racks.forEach((r, i) => {
        const rise = flat ? 0 : span(se, 3.15 + 0.48 * r.rank, 3.37 + 0.48 * r.rank)
        if (rise > 0) return
        if (r.estimated) return
        const p = introOutline(introOrder[i], now)
        if (p < 1) dashPath.push(i)
        if (p <= 0) return
        ;(rackStroke(r) === C.ink ? inkPath : tealPath).push(i)
      })
      const outline = (list: number[], color: string) => {
        if (!list.length) return
        ctx.beginPath()
        for (const i of list) {
          const r = model.racks[i]
          const x = rackX(r, bv)
          footprint(x - r.w / 2, r.y - r.d / 2, x + r.w / 2, r.y + r.d / 2, 0)
          partialPoly(4, introOutline(introOrder[i], now))
        }
        ctx.strokeStyle = color
        ctx.lineWidth = 1
        ctx.globalAlpha = dim
        ctx.stroke()
      }
      if (dashPath.length) {
        ctx.beginPath()
        for (const i of dashPath) {
          const r = model.racks[i]
          quad(r.x - r.w / 2, r.y - r.d / 2, r.x + r.w / 2, r.y + r.d / 2, 0)
        }
        ctx.setLineDash([2, 3])
        ctx.strokeStyle = 'rgba(17,17,17,.35)'
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.setLineDash([])
      }
      outline(inkPath, flash ? C.o600 : C.ink)
      outline(tealPath, flash ? C.o600 : C.t600)
      if (estA > 0) {
        ctx.beginPath()
        for (const i of rackIdx.est) {
          const r = model.racks[i]
          if (!flat && span(se, 3.15 + 0.48 * r.rank, 3.37 + 0.48 * r.rank) > 0) continue
          quad(r.x - r.w / 2, r.y - r.d / 2, r.x + r.w / 2, r.y + r.d / 2, 0)
        }
        ctx.setLineDash([4, 3])
        ctx.strokeStyle = flash ? C.o600 : C.t600
        ctx.globalAlpha = estA * dim
        ctx.stroke()
        ctx.setLineDash([])
      }
      ctx.globalAlpha = 1
      // Stations before they rise.
      const stRise = span(se, 3.78, 3.85)
      if (stRise <= 0) {
        model.stations.forEach((st, k) => {
          const p = introOutline(introCount - model.stations.length + k, now)
          ctx.beginPath()
          footprint(st.x - st.w / 2, st.y - st.d / 2, st.x + st.w / 2, st.y + st.d / 2, 0)
          if (p >= 1) {
            partialPoly(4, 1)
            ctx.fillStyle = C.paper
            ctx.fill()
          } else partialPoly(4, p)
          ctx.strokeStyle = C.ink
          ctx.stroke()
        })
      }
    }

    // 7b. Depth-sorted boxes.
    if (!flat || se >= 3) {
      sortRacks(theta, bv)
      const dyn: BoxItem[] = []
      const keyOf = (x: number, y: number) => (x - MX) * sT + (y - MY) * cT
      const stRise = span(se, 3.78, 3.85)
      if (stRise > 0) model.stations.forEach((st, i) => dyn.push({ key: keyOf(st.x, st.y), kind: 0, i }))
      if (sP < 0.9) {
        if (idleVisible(se)) dyn.push({ key: keyOf(idleS.x, idleS.y), kind: 1, i: 0 })
        if (fleetVisible) agvs.forEach((a, i) => dyn.push({ key: keyOf(a.s.x, a.s.y), kind: 2, i }))
        ghostPos.forEach((g, i) => {
          if (g) dyn.push({ key: keyOf(g.x, g.y), kind: 3, i })
        })
        if (slotsA > 0) for (let k = 0; k < 8; k += 1) if (slotC - k > 0) dyn.push({ key: keyOf(lane.slots[k][0], lane.slots[k][1]), kind: 4, i: k })
      }
      dyn.sort((a, b) => a.key - b.key)
      let di = 0
      const drawDyn = (item: BoxItem) => {
        if (item.kind === 0) {
          const st = model.stations[item.i]
          const h = st.h * easeOut(stRise)
          Object.assign(boxStyle, { left: C.line, right: C.lineStrong, top: C.paper, stroke: C.ink, faceA: 1, edgeP: 1, dashed: false, shelves: false, lineWidth: 1 })
          drawBox(st.x - st.w / 2, st.y - st.d / 2, st.x + st.w / 2, st.y + st.d / 2, 0, Math.max(0.02, h), boxStyle, dim)
        } else if (item.kind === 1) {
          drawAgvBox(idleS.x, idleS.y, idleS.hx, idleS.hy, idleAlpha(se, now) * dim, false, false)
        } else if (item.kind === 2) {
          const a = agvs[item.i]
          drawAgvBox(a.s.x, a.s.y, a.s.hx, a.s.hy, fleetA * liveMul, a.phase === 2, false)
        } else if (item.kind === 3) {
          const g = ghostPos[item.i]
          if (g) drawAgvBox(g.x, g.y, g.hx, g.hy, g.a, false, true)
        } else {
          const [cx, cy] = lane.slots[item.i]
          const p = clamp01(slotC - item.i)
          drawAgvBox(cx - (1 - easeOut(p)) * 0.9, cy, 1, 0, slotsA * p, true, false)
        }
      }
      for (const i of sortedRacks) {
        const r = model.racks[i]
        const rise = flat ? 0 : span(se, 3.15 + 0.48 * r.rank, 3.37 + 0.48 * r.rank)
        if (rise <= 0) continue
        const x = rackX(r, bv)
        const key = keyOf(x, r.y)
        while (di < dyn.length && dyn[di].key < key) drawDyn(dyn[di++])
        let h = r.h * easeOutBack(rise)
        if (i === rackIdx.a01) h = lerp(model.a01.baseH, model.a01.tallH, a01v) * easeOutBack(rise)
        const isA01 = i === rackIdx.a01
        Object.assign(boxStyle, {
          left: C.t200,
          right: C.t300,
          top: C.t100,
          stroke: flash ? C.o600 : C.t600,
          faceA: span(rise, 0.4, 1) * (r.estimated ? 0.55 : 1),
          edgeP: span(rise, 0, 0.4),
          dashed: r.estimated,
          shelves: !r.estimated,
          lineWidth: isA01 && focus > 0 ? 1 + focus : 1,
        })
        const alpha = (isA01 ? 1 : dim) * (r.estimated ? estA : 1)
        if (isA01 && focus > 0) {
          ctx.shadowColor = 'rgba(19,160,144,.42)'
          ctx.shadowBlur = 6 * dpr * focus
        }
        drawBox(x - r.w / 2, r.y - r.d / 2, x + r.w / 2, r.y + r.d / 2, 0, Math.max(0.02, h), boxStyle, alpha)
        if (isA01 && focus > 0) {
          ctx.shadowBlur = 0
          ctx.shadowColor = 'transparent'
        }
      }
      while (di < dyn.length) drawDyn(dyn[di++])
      ctx.globalAlpha = 1
    }

    // 7c. Top-down vehicles (chevrons).
    if (sP >= 0.9) {
      if (idleVisible(se)) drawChevron(idleS.x, idleS.y, idleS.hx, idleS.hy, idleAlpha(se, now) * dim)
      if (fleetVisible) agvs.forEach((a) => drawChevron(a.s.x, a.s.y, a.s.hx, a.s.hy, fleetA * liveMul))
    }

    // Waiting pulse rings.
    if (fleetVisible && !still) {
      ctx.strokeStyle = C.t400
      ctx.lineWidth = 1.5
      for (const a of agvs) {
        if (a.wait <= 0) continue
        const ph = (clock % 1400) / 1400
        ctx.globalAlpha = (1 - ph) * fleetA
        ctx.beginPath()
        ctx.arc(sx(a.s.x, a.s.y), sy(a.s.x, a.s.y, 0.15), 6 + ph * 12, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
    }

    // 8. Overlays: scan line, pills, beacon.
    if (se > 2.4 && se < 2.8) {
      const p = span(se, 2.4, 2.8)
      const a = Math.min(1, p * 8, (1 - p) * 8)
      ctx.globalAlpha = a * 0.12
      ctx.beginPath()
      quad(scanX - 1.2, -0.3, scanX, mh + 0.3, 0)
      ctx.fillStyle = C.t500
      ctx.fill()
      ctx.globalAlpha = a
      ctx.beginPath()
      ctx.moveTo(sx(scanX, -0.3), sy(scanX, -0.3, 0))
      ctx.lineTo(sx(scanX, mh + 0.3), sy(scanX, mh + 0.3, 0))
      ctx.strokeStyle = C.t600
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.lineWidth = 1
      pill(labels.scan, sx(scanX, -0.3), sy(scanX, -0.3, 0) - 14, 'scan', a)
    }

    const estPillA = estA * (1 - span(se, 4, 4.15))
    if (estPillA > 0 && rackIdx.est.length) {
      const r0 = model.racks[rackIdx.est[0]]
      const r1 = model.racks[rackIdx.est[rackIdx.est.length - 1]]
      const cx = (r0.x + r1.x) / 2
      const cy = r0.y
      const rise = flat ? 0 : span(se, 3.15 + 0.48 * r0.rank, 3.37 + 0.48 * r0.rank)
      const top = r0.h * easeOutBack(rise)
      const ax = sx(cx, cy - 0.5)
      const ay = sy(cx, cy - 0.5, top)
      const box = pill(labels.estimated, ax, ay - 16, 'est', estPillA)
      const xlsx = palletPos[1]
      if (box && xlsx && variant === 'desktop') {
        ctx.globalAlpha = estPillA * xlsx.a * 0.9
        ctx.strokeStyle = C.t600
        ctx.setLineDash([2, 3])
        ctx.beginPath()
        ctx.moveTo(box.x0, box.y0 + box.h / 2)
        ctx.lineTo(sx(xlsx.x, xlsx.y), sy(xlsx.x, xlsx.y, 0))
        ctx.stroke()
        ctx.setLineDash([])
      }
    }

    const provA = span(se, 3.85, 4) * (1 - span(se, 4, 4.15))
    if (provA > 0) {
      const r = model.racks[rackIdx.a07]
      const ax = sx(r.x, r.y)
      const ay = sy(r.x, r.y, r.h)
      if (variant === 'desktop') {
        ctx.font = `600 11px ${LABEL}`
        const half = (ctx.measureText(labels.provenance).width + 16) / 2
        const px = ax + 36 + half
        const py = ay - 56
        ctx.globalAlpha = provA
        ctx.strokeStyle = C.t600
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(ax, ay)
        ctx.lineTo(ax + 36, py)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(ax, ay, 2.5, 0, Math.PI * 2)
        ctx.fillStyle = C.t600
        ctx.fill()
        pill(labels.provenance, px, py, 'prov', provA)
      } else {
        pill(labels.provenance, Math.max(W * 0.5, ax), ay - 16, 'prov', provA)
      }
    }

    const beacon = twValue(beaconTw, now) * focus
    if (beacon > 0.001) {
      const r = model.racks[rackIdx.a01]
      const h = lerp(model.a01.baseH, model.a01.tallH, a01v)
      const x = rackX(r, bv)
      const bx = sx(x, r.y)
      const by = sy(x, r.y, h)
      const top = by - 1.1 * cP * U * beacon
      ctx.globalAlpha = Math.min(1, beacon * 1.5)
      ctx.strokeStyle = C.t600
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(bx, by)
      ctx.lineTo(bx, top)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(bx, top, 3.5, 0, Math.PI * 2)
      ctx.fillStyle = C.t600
      ctx.fill()
      ctx.lineWidth = 1
    }

    if (jamA > 0 && fleetOn) {
      pill(labels.jam, sx(lane.cellX0 + 0.5, lane.y), sy(lane.cellX0 + 0.5, lane.y, 0) - 30, 'jam', jamA)
    }
    ctx.globalAlpha = 1
  }

  // Idle AGV (H5)
  const idleS: Sample = { x: 0, y: 0, hx: 1, hy: 0 }
  const idleVisible = (se: number) => se < 5
  function idleAlpha(se: number, now: number) {
    const intro = still ? 1 : introT0 < 0 ? 0 : clamp01((now - introT0 - h3End()) / 300)
    return intro * (1 - span(se, 4.9, 5))
  }
  function updateIdle() {
    const t = still ? 0 : Math.max(0, clock - h3End())
    sampleAt(idlePath, (t / IDLE_LAP) * idlePath.len, idleS)
  }

  function drawChevron(x: number, y: number, hx: number, hy: number, alpha: number) {
    if (alpha <= 0.001) return
    const px = -hy
    const py = hx
    const pts: Vec2[] = [
      [x + hx * 0.5, y + hy * 0.5],
      [x - hx * 0.42 + px * 0.36, y - hy * 0.42 + py * 0.36],
      [x - hx * 0.16, y - hy * 0.16],
      [x - hx * 0.42 - px * 0.36, y - hy * 0.42 - py * 0.36],
    ]
    ctx.globalAlpha = alpha
    ctx.beginPath()
    pts.forEach(([a, b], k) => (k ? ctx.lineTo(sx(a, b), sy(a, b, 0)) : ctx.moveTo(sx(a, b), sy(a, b, 0))))
    ctx.closePath()
    ctx.fillStyle = C.dark
    ctx.fill()
    ctx.beginPath()
    ctx.arc(sx(x + hx * 0.05, y + hy * 0.05), sy(x + hx * 0.05, y + hy * 0.05, 0), Math.max(1.5, 0.11 * U), 0, Math.PI * 2)
    ctx.fillStyle = C.t500
    ctx.fill()
    ctx.globalAlpha = 1
  }

  function drawAgvBox(x: number, y: number, hx: number, hy: number, alpha: number, loaded: boolean, ghost: boolean) {
    if (alpha <= 0.001) return
    const alongX = Math.abs(hx) >= Math.abs(hy)
    const ex = alongX ? 0.45 : 0.35
    const ey = alongX ? 0.35 : 0.45
    if (ghost) {
      Object.assign(boxStyle, { left: C.dark, right: C.dark, top: C.dark, stroke: C.ink, faceA: 0, edgeP: 1, dashed: false, shelves: false, lineWidth: 1 })
      drawBox(x - ex, y - ey, x + ex, y + ey, 0, 0.3, boxStyle, alpha)
      return
    }
    Object.assign(boxStyle, { left: C.dark, right: C.ink, top: C.dark, stroke: null, faceA: 1, edgeP: 1, dashed: false, shelves: false, lineWidth: 1 })
    drawBox(x - ex, y - ey, x + ex, y + ey, 0, 0.3, boxStyle, alpha)
    // Top light (teal-500), towards the front.
    const lx = x + hx * 0.18
    const ly = y + hy * 0.18
    ctx.globalAlpha = alpha
    ctx.beginPath()
    quad(lx - 0.1, ly - 0.1, lx + 0.1, ly + 0.1, 0.3)
    ctx.fillStyle = C.t500
    ctx.fill()
    if (loaded) {
      Object.assign(boxStyle, { left: C.t100, right: C.t100, top: C.t100, stroke: C.t600, faceA: 0.35, edgeP: 1, dashed: false, shelves: false, lineWidth: 1 })
      drawBox(x - 0.4, y - 0.4, x + 0.4, y + 0.4, 0.32, 1.9, boxStyle, alpha)
    }
    ctx.globalAlpha = 1
  }

  // ---- frame driving -------------------------------------------------------
  function drawFrame(now: number) {
    if (destroyed) return
    if (introT0 < 0 && W > 0) introT0 = now
    lastDrawNow = now
    updateIdle()
    draw(now)
    if (!firstFramed && W > 0) {
      firstFramed = true
      const cbs = firstFrameCbs.splice(0)
      for (const cb of cbs) queueMicrotask(cb)
    }
  }

  function animBusy(now: number) {
    return (
      introBusy(now) ||
      twBusy(a01Tw, now) ||
      twBusy(beaconTw, now) ||
      twBusy(bTw, now) ||
      twBusy(routeTw, now) ||
      twBusy(slotTw, now) ||
      twBusy(fleetTw, now) ||
      twBusy(ghostTw, now) ||
      now - flashT0 < 340 ||
      (now >= routeFlashT0 && now - routeFlashT0 < 2450)
    )
  }

  function ensureAnim() {
    if (still || destroyed || removeAnim) return
    removeAnim = addTask({
      kind: 'scroll',
      run: (now) => {
        if (destroyed) return false
        if (now !== lastDrawNow) drawFrame(now)
        const more = animBusy(now)
        if (!more) {
          removeAnim?.()
          removeAnim = null
        }
        return more
      },
    })
  }

  const loopLive = () => !still && !paused && !isPaused() && performance.now() - lastLoopAt < 120

  function requestDraw() {
    if (destroyed) return
    if (loopLive() || removeAnim) return
    drawFrame(performance.now())
  }

  function loopRun(now: number, dt: number) {
    if (destroyed) return
    lastLoopAt = now
    const t0 = performance.now()
    if (!paused) {
      clock += dt
      if (fleetOn) {
        fleetClock += dt
        tickFleet(dt)
      }
      if (ghostOn) ghostClock += dt
      panX += (panTX - panX) * 0.08
      panY += (panTY - panY) * 0.08
    }
    if (level >= 1 && now - lastDrawNow < 30) return
    if (now === lastDrawNow) return
    drawFrame(now)
    // Auto-degrade (C1.6): measure the first 60 loop frames, and one more window
    // after degrading once; after that a brief slowdown never swaps the model.
    if (level < 2 && degradeWindows < 2) {
      frameTotal += performance.now() - t0
      frameSamples += 1
      if (frameSamples >= 60) {
        const mean = frameTotal / frameSamples
        frameSamples = 0
        frameTotal = 0
        degradeWindows = mean > 20 ? degradeWindows + 1 : 2
        if (mean > 20) {
          level += 1
          if (level === 2 && model.variant !== 'mobile') {
            const wasFleet = fleetOn
            loadModel(buildFloorModel('mobile'))
            buildPatterns()
            layoutCamera()
            if (wasFleet) startFleet(now)
          }
        }
      }
    }
  }

  // ---- size --------------------------------------------------------------
  function resize() {
    if (destroyed) return
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (!w || !h) return
    const nextDpr = Math.min(window.devicePixelRatio || 1, dprCap)
    // The holder is sized in svh, so URL-bar changes do not reach here; always
    // resize the backing store (a skipped resize would stretch the drawing).
    if (W === w && H === h && nextDpr === dpr) return
    W = w
    H = h
    dpr = nextDpr
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    if (patternDpr !== dpr) buildPatterns()
    layoutCamera()
    sortedFor = NaN
    drawFrame(performance.now())
  }

  // ---- pointer parallax (H6) -----------------------------------------------
  const parallax =
    !still && variant === 'desktop' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches
  const onPointer = (e: PointerEvent) => {
    if (window.innerWidth < 1024) {
      panTX = 0
      panTY = 0
      return
    }
    panTX = ((e.clientX / window.innerWidth) * 2 - 1) * 8
    panTY = ((e.clientY / window.innerHeight) * 2 - 1) * 8
  }
  if (parallax) window.addEventListener('pointermove', onPointer, { passive: true })

  // ---- fonts ---------------------------------------------------------------
  const markFonts = () => {
    if (fontsReady || destroyed) return
    fontsReady = true
    fontsAt = performance.now()
    if (!still) ensureAnim()
    requestDraw()
  }
  try {
    const loads: Array<Promise<unknown>> = [document.fonts.load(`700 1px "JetBrains Mono"`), document.fonts.load(`600 1px "JetBrains Mono"`)]
    if (locale === 'zh') loads.push(document.fonts.load(`700 1px "Noto Sans TC"`, '收貨口充電區'))
    void Promise.allSettled(loads).then(markFonts)
  } catch {
    fontsReady = true
  }
  const fontTimer = window.setTimeout(markFonts, 2500)
  timers.add(fontTimer)

  // ---- boot ----------------------------------------------------------------
  loadModel(opts.model)
  dpr = Math.min(window.devicePixelRatio || 1, dprCap)
  buildPatterns()
  resize()
  if (!still) {
    removeLoop = addTask({ kind: 'loop', target: canvas, run: loopRun })
    ensureAnim()
  }

  function later(ms: number, fn: () => void) {
    const id = window.setTimeout(() => {
      timers.delete(id)
      fn()
    }, ms)
    timers.add(id)
  }

  return {
    setProgress(next: number) {
      if (destroyed || !Number.isFinite(next)) return
      const v = Math.max(0, Math.min(8, next))
      if (v === s && lastDrawNow >= 0) return
      s = v
      updateHysteresis(performance.now())
      if (animBusy(performance.now())) ensureAnim()
      requestDraw()
    },

    setEdits(next: EditState) {
      if (destroyed) return Promise.resolve()
      const now = performance.now()
      const instant = still || s < 3.8
      let dur = 0
      if (next.a01Tall !== edits.a01Tall) {
        const to = next.a01Tall ? 1 : 0
        a01Tw = instant ? fixed(to) : { from: twValue(a01Tw, now), to, t0: now, dur: 600, ease: to ? (t) => easeOutBack(t) : easeOut }
        beaconTw = instant ? fixed(to) : { from: twValue(beaconTw, now), to, t0: now, dur: 300, ease: easeOut }
        dur = Math.max(dur, 600)
      }
      if (next.bShift !== edits.bShift) {
        bTw = instant ? fixed(next.bShift) : { from: twValue(bTw, now), to: next.bShift, t0: now, dur: 500, ease: easeOut }
        layoutKey = next.bShift ? 'bShifted' : 'base'
        const loops = curLoops()
        if (still && fleetOn) placeFleetAtStarts()
        else for (const a of agvs) if (a.phase === 2) a.d = nearestDist(loops[a.path], a.s.x, a.s.y)
        routeTw = instant ? fixed(1) : { from: 0, to: 1, t0: now + 500, dur: 500, ease: linear }
        routeFlashT0 = instant || fleetOn ? -Infinity : now + 500
        dur = Math.max(dur, 1000)
      }
      edits = { a01Tall: next.a01Tall, bShift: next.bShift }
      if (!dur || instant) {
        requestDraw()
        return Promise.resolve()
      }
      ensureAnim()
      return new Promise<void>((resolve) => {
        pendingResolves.add(resolve)
        later(dur, () => {
          pendingResolves.delete(resolve)
          resolve()
        })
      })
    },

    setSlots(n: number) {
      if (destroyed || !Number.isFinite(n)) return
      const v = Math.max(1, Math.min(8, Math.round(n)))
      if (v === slotN) return
      const now = performance.now()
      slotTw = still ? fixed(v) : { from: twValue(slotTw, now), to: v, t0: now, dur: 180, ease: easeOut }
      slotN = v
      ensureAnim()
      requestDraw()
    },

    flashBatchFail() {
      if (destroyed) return
      flashT0 = performance.now()
      if (still) {
        requestDraw()
        later(320, requestDraw)
      } else ensureAnim()
    },

    setPaused(p: boolean) {
      paused = p
      requestDraw()
    },

    resize,

    destroy() {
      if (destroyed) return
      destroyed = true
      removeLoop?.()
      removeAnim?.()
      removeLoop = null
      removeAnim = null
      for (const id of timers) window.clearTimeout(id)
      timers.clear()
      for (const resolve of pendingResolves) resolve()
      pendingResolves.clear()
      if (parallax) window.removeEventListener('pointermove', onPointer)
      firstFrameCbs.length = 0
      heatTiles = []
      inkTiles = []
      stripes = null
    },

    onFirstFrame(cb: () => void) {
      if (destroyed) return
      if (firstFramed) queueMicrotask(cb)
      else firstFrameCbs.push(cb)
    },
  }
}
