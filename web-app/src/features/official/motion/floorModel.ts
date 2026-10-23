// Floor geometry for the stage (C1.4). Pure and deterministic: no DOM, no
// window, no Date, no Math.random. It runs during SSR (posters) and in the
// client engine.

export type FloorVariant = 'desktop' | 'mobile'
export type Locale = 'zh' | 'en'
export type Vec2 = [number, number]
export type Rect = { x: number; y: number; w: number; h: number }

/** A rack, centred on an integer cell (x, y). The cell covers [x-.5, x+.5]. */
export type Rack = {
  id: string
  pair: string
  pairIndex: number
  col: 0 | 1
  rowIndex: number
  x: number
  y: number
  w: number
  d: number
  h: number
  estimated: boolean
  /** Normalised (x + y) order, 0..1 (rise stagger). */
  rank: number
}

export type Station = { id: string; index: number; label: string; x: number; y: number; w: number; d: number; h: number }

export type QueueLane = {
  station: number
  /** Visual lane axis (equals the station's y). */
  y: number
  /** Grid row the AGVs use inside the lane. */
  row: number
  /** Grid rows the lane occupies (closed to other traffic). */
  rows: number[]
  cellX0: number
  cellX1: number
  /** Slot centres, slot 1 (at the station) first. */
  slots: Vec2[]
  slotSize: number
}

export type Stencil = {
  id: string
  text: string
  x: number
  y: number
  size: number
  align: 'start' | 'center'
  /** zh-only word, drawn only on the zh page. */
  zh?: { text: string; x: number; y: number; size: number }
}

export type Pallet = Rect & { label: string }

export type AgvLoop = {
  id: string
  pair: string
  station: number
  rackId: string
  /** Closed 4-connected walk on free grid cells; last cell is adjacent to the first. */
  cells: Vec2[]
  /** Render polyline in metres (collinear points removed, lane points on the lane axis). Closed. */
  points: Vec2[]
  length: number
  /** Distance along `points` where the AGV dwells at its station. */
  dwellAt: number
}

export type AgvPath = { points: Vec2[]; length: number }

export type FloorLayout = {
  /** 1 = blocked (rack, station, charger or outside the floor), indexed j * cols + i. */
  blocked: number[]
  loops: AgvLoop[]
  /** Charge bay → loop start, one per loop. */
  entries: AgvPath[]
  /** Precomputed 60 s heat run, levels 0..16 per cell. */
  heat: number[]
}

export type FloorModel = {
  variant: FloorVariant
  width: number
  height: number
  cx: number
  cy: number
  grid: { cols: number; rows: number }
  racks: Rack[]
  pairs: Array<{ id: string; x: [number, number] }>
  aisles: number[]
  crossAisles: number[]
  rackBlock: Rect
  stations: Station[]
  lanes: QueueLane[]
  charge: Rect
  chargeBays: Rect[]
  dock: Rect
  pallets: Pallet[]
  tapes: Rect[]
  stencils: Stencil[]
  /** The zebra stripe line (x in metres). */
  zebraX: number
  /** Heat quad y offset per cell (lane rows sit on half metres). */
  cellYOffset: number[]
  idleLoop: AgvLoop
  layouts: { base: FloorLayout; bShifted: FloorLayout }
  /** Reduced-motion heat for the base layout (same as layouts.base.heat). */
  heatReduced: number[]
  /** `batch`: the 12 racks the chat demo's attachment raises by 1 m. */
  ids: { a01: string; a07: string; estimated: string[]; batch: string[] }
  bPair: { pair: string; rackIds: string[]; dx: number }
  a01: { baseH: number; tallH: number }
  fleetSize: number
  /** Zoom on A01 in step 03 and where A01 lands (fraction of canvas W, H). */
  a01Zoom: number
  a01Screen: Vec2
  /** CSS px of one heat dither pixel. */
  heatPixel: number
  /** Tallest point used for iso framing (m). */
  maxZ: number
}

/** Canvas-only labels (aria-hidden). */
export const STAGE_LABELS: Record<Locale, { scan: string; estimated: string; provenance: string; jam: string; pallets: string[] }> = {
  zh: {
    scan: 'AI 判讀中…',
    estimated: '推估',
    provenance: 'A07 · 料架 · 來源：設施清單.xlsx 第 12 列',
    jam: '壅塞熱點',
    pallets: ['PPTX', 'XLSX', 'CSV', 'PDF', 'JPG', 'PNG'],
  },
  en: {
    scan: 'Reading…',
    estimated: 'EST.',
    provenance: 'A07 · rack · source: facility-list.xlsx, row 12',
    jam: 'Congestion hotspot',
    pallets: ['PPTX', 'XLSX', 'CSV', 'PDF', 'JPG', 'PNG'],
  },
}

// ---------------------------------------------------------------------------
// Regions (where the plan and the iso view sit inside the canvas)

/** Desktop plan region as fractions of the holder (match the poster CSS). */
export const PLAN_REGION_FRACTION = { left: 0.4, top: 0.1, width: 0.57, height: 0.8 } as const
export const ISO_REGION_FRACTION = { left: 0.4, top: 0.08, width: 0.55, height: 0.84 } as const
/** <1024 layouts: both regions are the canvas inset by this many CSS px. */
export const MOBILE_REGION_INSET = 16

function regionFrom(variant: FloorVariant, width: number, height: number, f: { left: number; top: number; width: number; height: number }): Rect {
  if (variant === 'mobile') {
    const i = MOBILE_REGION_INSET
    return { x: i, y: i, w: Math.max(1, width - 2 * i), h: Math.max(1, height - 2 * i) }
  }
  return { x: width * f.left, y: height * f.top, w: width * f.width, h: height * f.height }
}

/** Plan region in canvas CSS px. */
export function PLAN_REGION(variant: FloorVariant, width: number, height: number): Rect {
  return regionFrom(variant, width, height, PLAN_REGION_FRACTION)
}

/** Iso region in canvas CSS px. */
export function ISO_REGION(variant: FloorVariant, width: number, height: number): Rect {
  return regionFrom(variant, width, height, ISO_REGION_FRACTION)
}

// ---------------------------------------------------------------------------
// Variant specs (C1.4 table)

type VariantSpec = {
  width: number
  height: number
  pairCols: Array<[number, number]>
  rows: number[]
  crossAisles: number[]
  aisles: number[]
  outer: [number, number]
  perimeterRows: [number, number]
  stationX: number
  stationYs: number[]
  stationSize: [number, number, number]
  laneCells: [number, number]
  slotEnd: number
  slotPitch: number
  charge: Rect
  bays: number
  chargeFrontRow: number
  dock: Rect
  zebraX: number
  estimated: string[]
  fleet: Array<[string, number]>
  stencils: Stencil[]
  a01Zoom: number
  a01Screen: Vec2
  heatPixel: number
  timesSign: { x: number; dy: number; size: number }
}

const DESKTOP: VariantSpec = {
  width: 32,
  height: 18,
  pairCols: [
    [4, 5],
    [7, 8],
    [10, 11],
    [13, 14],
    [16, 17],
    [19, 20],
  ],
  rows: [3, 4, 5, 6, 8, 9, 10, 11, 12],
  crossAisles: [2, 7, 13],
  aisles: [6, 9, 12, 15, 18],
  outer: [3, 21],
  perimeterRows: [2, 13],
  stationX: 30.5,
  stationYs: [3.5, 6.5, 9.5, 12.5],
  stationSize: [1.6, 1.2, 1.1],
  laneCells: [22, 29],
  slotEnd: 29.5,
  slotPitch: 1,
  charge: { x: 23, y: 15.5, w: 6, h: 1.5 },
  bays: 6,
  chargeFrontRow: 15,
  dock: { x: 0, y: 6.5, w: 2, h: 3 },
  zebraX: 21.5,
  estimated: ['F17', 'F18'],
  fleet: [
    ['A', 0],
    ['B', 1],
    ['C', 2],
    ['D', 1],
    ['E', 3],
    ['F', 0],
  ],
  stencils: [
    { id: 'dock', text: 'DOCK 00', x: 0.3, y: 6.1, size: 0.55, align: 'start', zh: { text: '收貨口', x: 0.3, y: 5.42, size: 0.5 } },
    { id: 'zoneA', text: 'ZONE A', x: 6, y: 1.1, size: 0.8, align: 'start' },
    { id: 'zoneB', text: 'ZONE B', x: 15, y: 1.1, size: 0.8, align: 'start' },
    { id: 'charge', text: 'CHARGE', x: 23.2, y: 15.2, size: 0.5, align: 'start', zh: { text: '充電區', x: 25.15, y: 15.2, size: 0.5 } },
  ],
  a01Zoom: 1.3,
  a01Screen: [0.62, 0.45],
  heatPixel: 4,
  timesSign: { x: 21.75, dy: 1.4, size: 0.75 },
}

const MOBILE: VariantSpec = {
  width: 26,
  height: 15,
  pairCols: [
    [2, 3],
    [5, 6],
    [8, 9],
    [11, 12],
    [14, 15],
  ],
  rows: [3, 4, 5, 8, 9, 10],
  crossAisles: [2, 6, 7, 11],
  aisles: [4, 7, 10, 13],
  outer: [1, 16],
  perimeterRows: [2, 11],
  stationX: 24.5,
  stationYs: [3, 5.5, 8.5, 11],
  stationSize: [1.6, 1.2, 1.1],
  laneCells: [17, 23],
  slotEnd: 23.5,
  slotPitch: 0.875,
  charge: { x: 18, y: 13.2, w: 5, h: 1.4 },
  bays: 4,
  chargeFrontRow: 12,
  dock: { x: 0, y: 6, w: 1.6, h: 2 },
  zebraX: 16.5,
  estimated: ['E11', 'E12'],
  fleet: [
    ['A', 0],
    ['B', 1],
    ['C', 2],
    ['D', 1],
  ],
  stencils: [
    { id: 'dock', text: 'DOCK 00', x: 0.15, y: 5.9, size: 0.4, align: 'start', zh: { text: '收貨口', x: 0.15, y: 5.38, size: 0.38 } },
    { id: 'zoneA', text: 'ZONE A', x: 3.5, y: 1.1, size: 0.65, align: 'start' },
    { id: 'zoneB', text: 'ZONE B', x: 11, y: 1.1, size: 0.65, align: 'start' },
    { id: 'charge', text: 'CHARGE', x: 18.2, y: 12.95, size: 0.4, align: 'start', zh: { text: '充電區', x: 19.84, y: 12.95, size: 0.4 } },
  ],
  a01Zoom: 1.2,
  a01Screen: [0.5, 0.5],
  heatPixel: 3,
  timesSign: { x: 16.85, dy: 1.25, size: 0.6 },
}

// ---------------------------------------------------------------------------
// Helpers

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PAIR_IDS = 'ABCDEF'
const HEIGHTS = [2.4, 3.0, 3.6]
const RACK_SIZE = 0.9
const OVERLAP_EPS = 0.15
const DIRS: Vec2[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

const r3 = (v: number) => Math.round(v * 1000) / 1000

function markRect(blocked: number[], cols: number, rows: number, x0: number, y0: number, x1: number, y1: number) {
  for (let j = 0; j < rows; j += 1) {
    const oy = Math.min(y1, j + 0.5) - Math.max(y0, j - 0.5)
    if (oy <= OVERLAP_EPS) continue
    for (let i = 0; i < cols; i += 1) {
      const ox = Math.min(x1, i + 0.5) - Math.max(x0, i - 0.5)
      if (ox > OVERLAP_EPS) blocked[j * cols + i] = 1
    }
  }
}

/**
 * Shortest 4-connected path from src to dst (BFS from dst), walked greedily
 * so it keeps going straight whenever that is still a shortest path.
 * `src` may itself be a closed cell (it is the place we leave from).
 */
function bfsPath(src: Vec2, dst: Vec2 | Vec2[], free: (i: number, j: number) => boolean, cols: number, rows: number): Vec2[] {
  const dist = new Int32Array(cols * rows).fill(-1)
  const queue = new Int32Array(cols * rows)
  let head = 0
  let tail = 0
  const si = src[1] * cols + src[0]
  const targets: Vec2[] = typeof dst[0] === 'number' ? [dst as Vec2] : (dst as Vec2[])
  for (const t of targets) {
    const di = t[1] * cols + t[0]
    if (dist[di] === 0) continue
    dist[di] = 0
    queue[tail++] = di
  }
  // Toward the first target (only used to break ties on the first step).
  const aim = targets[0]
  while (head < tail) {
    const c = queue[head++]
    const ci = c % cols
    const cj = (c - ci) / cols
    for (const [dx, dy] of DIRS) {
      const ni = ci + dx
      const nj = cj + dy
      if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue
      const n = nj * cols + ni
      if (dist[n] >= 0) continue
      if (n !== si && !free(ni, nj)) continue
      dist[n] = dist[c] + 1
      queue[tail++] = n
    }
  }
  if (dist[si] < 0) throw new Error(`floorModel: no path ${src} → ${dst}`)
  const path: Vec2[] = [[src[0], src[1]]]
  let [ci, cj] = src
  let dir: Vec2 | null = null
  while (dist[cj * cols + ci] > 0) {
    const here = dist[cj * cols + ci]
    const options: Vec2[] = dir ? [dir, ...DIRS.filter((d) => d !== dir)] : [...DIRS].sort((a, b) => Math.abs((aim[0] - ci) * b[0] + (aim[1] - cj) * b[1]) - Math.abs((aim[0] - ci) * a[0] + (aim[1] - cj) * a[1]))
    let moved = false
    for (const d of options) {
      const ni = ci + d[0]
      const nj = cj + d[1]
      if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue
      if (dist[nj * cols + ni] === here - 1) {
        ci = ni
        cj = nj
        dir = d
        moved = true
        break
      }
    }
    if (!moved) throw new Error('floorModel: path walk failed')
    path.push([ci, cj])
  }
  return path
}

function simplify(points: Vec2[], closed: boolean): Vec2[] {
  const out: Vec2[] = []
  const n = points.length
  for (let k = 0; k < n; k += 1) {
    const p = points[k]
    const prev = out.length ? out[out.length - 1] : closed ? points[n - 1] : null
    const next = k + 1 < n ? points[k + 1] : closed ? points[0] : null
    if (prev && prev[0] === p[0] && prev[1] === p[1]) continue
    // Keep the first point of a closed loop: it is where the AGV starts.
    if (k > 0 && prev && next) {
      const cross = (p[0] - prev[0]) * (next[1] - p[1]) - (p[1] - prev[1]) * (next[0] - p[0])
      if (Math.abs(cross) < 1e-9) continue
    }
    out.push([r3(p[0]), r3(p[1])])
  }
  return out
}

function polyLength(points: Vec2[], closed: boolean) {
  let len = 0
  const n = points.length
  for (let k = 0; k < (closed ? n : n - 1); k += 1) {
    const a = points[k]
    const b = points[(k + 1) % n]
    len += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  return r3(len)
}

function distanceTo(points: Vec2[], target: Vec2) {
  let len = 0
  for (let k = 0; k < points.length; k += 1) {
    const p = points[k]
    if (p[0] === target[0] && p[1] === target[1]) return r3(len)
    const q = points[(k + 1) % points.length]
    len += Math.hypot(q[0] - p[0], q[1] - p[1])
  }
  return 0
}

// ---------------------------------------------------------------------------
// Build

function buildBlocked(spec: VariantSpec, racks: Rack[], dxB: number, stations: Station[], cols: number, rows: number) {
  const blocked = new Array<number>(cols * rows).fill(0)
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      if (i === 0 || j === 0 || i >= spec.width || j >= spec.height) blocked[j * cols + i] = 1
    }
  }
  for (const r of racks) {
    const x = r.x + (r.pair === 'B' ? dxB : 0)
    blocked[r.y * cols + x] = 1
  }
  for (const s of stations) markRect(blocked, cols, rows, s.x - s.w / 2, s.y - s.d / 2, s.x + s.w / 2, s.y + s.d / 2)
  const c = spec.charge
  markRect(blocked, cols, rows, c.x, c.y, c.x + c.w, c.y + c.h)
  return blocked
}

function buildLayout(spec: VariantSpec, model: Omit<FloorModel, 'layouts' | 'heatReduced'>, dxB: number, targets: string[]): FloorLayout {
  const { cols, rows } = model.grid
  const blocked = buildBlocked(spec, model.racks, dxB, model.stations, cols, rows)
  const laneMask = new Uint8Array(cols * rows)
  for (const lane of model.lanes) {
    for (const row of lane.rows) for (let i = lane.cellX0; i <= lane.cellX1; i += 1) laneMask[row * cols + i] = 1
  }
  const freeOutsideLanes = (i: number, j: number) => blocked[j * cols + i] === 0 && laneMask[j * cols + i] === 0
  const rackAt = (id: string) => model.racks.find((r) => r.id === id)!
  const outerX = spec.outer[1]

  const loops: AgvLoop[] = spec.fleet.map(([pair, stationIndex], k) => {
    const rack = rackAt(targets[k])
    const rx = rack.x + (rack.pair === 'B' ? dxB : 0)
    const sides: Vec2[] = rack.col === 0 ? [[-1, 0], [1, 0], [0, -1], [0, 1]] : [[1, 0], [-1, 0], [0, -1], [0, 1]]
    const side = sides.find(([dx, dy]) => freeOutsideLanes(rx + dx, rack.y + dy))
    if (!side) throw new Error(`floorModel: rack ${rack.id} unreachable`)
    const start: Vec2 = [rx + side[0], rack.y + side[1]]
    const lane = model.lanes[stationIndex]
    const entry: Vec2 = [outerX, lane.row]
    const out = bfsPath(start, entry, freeOutsideLanes, cols, rows)
    const laneCells: Vec2[] = []
    for (let i = lane.cellX0; i <= lane.cellX1; i += 1) laneCells.push([i, lane.row])
    const front: Vec2 = [lane.cellX1, lane.row]
    const back = bfsPath(front, start, freeOutsideLanes, cols, rows)
    const cells: Vec2[] = [...out, ...laneCells, ...back.slice(1, -1)]
    // Lane cells (and the corner that feeds the lane) ride on the lane axis.
    const onLane = new Set<number>()
    onLane.add(out.length - 1)
    for (let q = 0; q < laneCells.length; q += 1) onLane.add(out.length + q)
    const raw: Vec2[] = cells.map((c, q) => [c[0], onLane.has(q) ? lane.y : c[1]])
    const points = simplify(raw, true)
    return {
      id: `loop-${pair}`,
      pair,
      station: stationIndex,
      rackId: rack.id,
      cells,
      points,
      length: polyLength(points, true),
      dwellAt: distanceTo(points, [lane.cellX1, lane.y]),
    }
  })

  // Charge bay → nearest cell of the loop (outside the queue lanes).
  const entries: AgvPath[] = loops.map((loop, k) => {
    const bay = model.chargeBays[k % model.chargeBays.length]
    const bx = bay.x + bay.w / 2
    const front: Vec2 = [Math.floor(bx), spec.chargeFrontRow]
    const joins = loop.cells.filter(([i, j]) => laneMask[j * cols + i] === 0)
    const path = bfsPath(front, joins, freeOutsideLanes, cols, rows)
    const raw: Vec2[] = [[bx, bay.y + bay.h / 2], [bx, spec.chargeFrontRow], ...path]
    const points = simplify(raw, false)
    return { points, length: polyLength(points, false) }
  })

  return { blocked, loops, entries, heat: simulateHeat(loops, cols, rows) }
}

/** 60 s of the fleet at 1.4 m/s with a 400 ms station dwell, sampled every 50 ms. */
function simulateHeat(loops: AgvLoop[], cols: number, rows: number) {
  const heat = new Float64Array(cols * rows)
  const dt = 50
  for (const loop of loops) {
    const pts = loop.points
    const n = pts.length
    let d = 0
    let dwell = 0
    let dwelt = false
    for (let t = 0; t < 60000; t += dt) {
      if (dwell > 0) dwell -= dt
      else {
        const prev = d
        d += 0.0014 * dt
        if (!dwelt && prev < loop.dwellAt && d >= loop.dwellAt) {
          d = loop.dwellAt
          dwell = 400
          dwelt = true
        }
        if (d >= loop.length) {
          d -= loop.length
          dwelt = false
        }
      }
      let acc = 0
      let x = pts[0][0]
      let y = pts[0][1]
      for (let k = 0; k < n; k += 1) {
        const a = pts[k]
        const b = pts[(k + 1) % n]
        const seg = Math.hypot(b[0] - a[0], b[1] - a[1])
        if (acc + seg >= d) {
          const f = seg > 0 ? (d - acc) / seg : 0
          x = a[0] + (b[0] - a[0]) * f
          y = a[1] + (b[1] - a[1]) * f
          break
        }
        acc += seg
      }
      const i = Math.round(x)
      const j = Math.floor(y + 0.5 - 1e-6)
      if (i >= 0 && j >= 0 && i < cols && j < rows) heat[j * cols + i] += dt / 1000
    }
  }
  let max = 0
  for (const v of heat) max = Math.max(max, v)
  return Array.from(heat, (v) => (max > 0 ? Math.round((v / max) * 16) : 0))
}

export function createFloorModel(variant: FloorVariant): FloorModel {
  const spec = variant === 'desktop' ? DESKTOP : MOBILE
  const rng = mulberry32(4)
  const W = spec.width
  const H = spec.height
  const cols = W + 1
  const rows = H + 1

  // Racks
  const racks: Rack[] = []
  spec.pairCols.forEach((pairX, pairIndex) => {
    const pair = PAIR_IDS[pairIndex]
    spec.rows.forEach((y, rowIndex) => {
      pairX.forEach((x, col) => {
        const id = `${pair}${String(rowIndex * 2 + col + 1).padStart(2, '0')}`
        const pick = HEIGHTS[Math.floor(rng() * HEIGHTS.length)]
        racks.push({
          id,
          pair,
          pairIndex,
          col: col as 0 | 1,
          rowIndex,
          x,
          y,
          w: RACK_SIZE,
          d: RACK_SIZE,
          h: id === 'A01' ? 3.0 : pick,
          estimated: spec.estimated.includes(id),
          rank: 0,
        })
      })
    })
  })
  const sums = racks.map((r) => r.x + r.y)
  const minSum = Math.min(...sums)
  const maxSum = Math.max(...sums)
  for (const r of racks) r.rank = r3((r.x + r.y - minSum) / (maxSum - minSum))

  const rackBlock: Rect = {
    x: spec.pairCols[0][0] - 0.5,
    y: spec.rows[0] - 0.5,
    w: spec.pairCols[spec.pairCols.length - 1][1] - spec.pairCols[0][0] + 1,
    h: spec.rows[spec.rows.length - 1] - spec.rows[0] + 1,
  }

  // Stations and queue lanes
  const [sw, sd, sh] = spec.stationSize
  const stations: Station[] = spec.stationYs.map((y, index) => ({
    id: `ST0${index + 1}`,
    index,
    label: `STATION 0${index + 1}`,
    x: spec.stationX,
    y,
    w: sw,
    d: sd,
    h: sh,
  }))
  const cellYOffset = new Array<number>(cols * rows).fill(0)
  const lanes: QueueLane[] = stations.map((st) => {
    const row = Math.floor(st.y)
    const half = st.y - row > 0.25
    const laneRows = half ? [row, row + 1] : [row]
    const slots: Vec2[] = []
    for (let k = 1; k <= 8; k += 1) slots.push([r3(spec.slotEnd - (k - 0.5) * spec.slotPitch), st.y])
    if (half) for (let i = spec.laneCells[0]; i <= spec.laneCells[1]; i += 1) cellYOffset[row * cols + i] = 0.5
    return { station: st.index, y: st.y, row, rows: laneRows, cellX0: spec.laneCells[0], cellX1: spec.laneCells[1], slots, slotSize: r3(spec.slotPitch * 0.86) }
  })

  // Charge, dock, pallets, tapes
  const c = spec.charge
  const bayW = c.w / spec.bays
  const chargeBays: Rect[] = Array.from({ length: spec.bays }, (_, b) => ({ x: r3(c.x + b * bayW), y: c.y, w: r3(bayW), h: c.h }))
  const dock = spec.dock
  const m = 0.08
  const g = 0.06
  const pw = r3((dock.w - 2 * m - g) / 2)
  const pd = r3((dock.h - 2 * m - 2 * g) / 3)
  const pallets: Pallet[] = STAGE_LABELS.en.pallets.map((label, k) => ({
    label,
    x: r3(dock.x + m + (k % 2) * (pw + g)),
    y: r3(dock.y + m + Math.floor(k / 2) * (pd + g)),
    w: pw,
    h: pd,
  }))
  const t = 0.12
  const b = rackBlock
  const tapes: Rect[] = [
    { x: b.x - t, y: b.y - t, w: b.w + 2 * t, h: t },
    { x: b.x - t, y: b.y + b.h, w: b.w + 2 * t, h: t },
    { x: b.x - t, y: b.y, w: t, h: b.h },
    { x: b.x + b.w, y: b.y, w: t, h: b.h },
    { x: dock.x, y: dock.y, w: dock.w, h: t },
    { x: dock.x, y: dock.y + dock.h - t, w: dock.w, h: t },
    { x: dock.x + dock.w - t, y: dock.y + t, w: t, h: dock.h - 2 * t },
  ].map((q) => ({ x: r3(q.x), y: r3(q.y), w: r3(q.w), h: r3(q.h) }))

  // Stencils
  const stencils: Stencil[] = [
    ...spec.stencils,
    ...spec.aisles.map((x, k): Stencil => ({ id: `aisle${k + 1}`, text: `AISLE ${k + 1}`, x, y: 1.9, size: variant === 'desktop' ? 0.35 : 0.3, align: 'center' })),
    ...stations.map((st): Stencil => ({ id: `station${st.index + 1}`, text: st.label, x: st.x, y: r3(st.y - st.d / 2 - 0.15), size: variant === 'desktop' ? 0.4 : 0.35, align: 'center' })),
  ]

  // Idle perimeter loop
  const [xl, xr] = spec.outer
  const [yt, yb] = spec.perimeterRows
  const idleCells: Vec2[] = []
  for (let i = xl; i <= xr; i += 1) idleCells.push([i, yt])
  for (let j = yt + 1; j <= yb; j += 1) idleCells.push([xr, j])
  for (let i = xr - 1; i >= xl; i -= 1) idleCells.push([i, yb])
  for (let j = yb - 1; j > yt; j -= 1) idleCells.push([xl, j])
  const idlePoints = simplify(idleCells, true)
  const idleLoop: AgvLoop = { id: 'idle', pair: '', station: -1, rackId: '', cells: idleCells, points: idlePoints, length: polyLength(idlePoints, true), dwellAt: -1 }

  const bRacks = racks.filter((r) => r.pair === 'B')
  const partial: Omit<FloorModel, 'layouts' | 'heatReduced'> = {
    variant,
    width: W,
    height: H,
    cx: W / 2,
    cy: H / 2,
    grid: { cols, rows },
    racks,
    pairs: spec.pairCols.map((x, k) => ({ id: PAIR_IDS[k], x })),
    aisles: spec.aisles,
    crossAisles: spec.crossAisles,
    rackBlock,
    stations,
    lanes,
    charge: c,
    chargeBays,
    dock,
    pallets,
    tapes,
    stencils,
    zebraX: spec.zebraX,
    cellYOffset,
    idleLoop,
    ids: { a01: 'A01', a07: 'A07', estimated: spec.estimated, batch: racks.filter((r) => r.pair === 'C' && !r.estimated).slice(0, 12).map((r) => r.id) },
    bPair: { pair: 'B', rackIds: bRacks.map((r) => r.id), dx: 1 },
    a01: { baseH: 3, tallH: 4 },
    fleetSize: spec.fleet.length,
    a01Zoom: spec.a01Zoom,
    a01Screen: spec.a01Screen,
    heatPixel: spec.heatPixel,
    maxZ: 4.2,
  }

  // Fleet target racks: seeded pick among racks reachable in both layouts.
  const blockedBase = buildBlocked(spec, racks, 0, stations, cols, rows)
  const blockedShift = buildBlocked(spec, racks, 1, stations, cols, rows)
  const reachable = (r: Rack, blocked: number[], dx: number) => {
    const x = r.x + (r.pair === 'B' ? dx : 0)
    return DIRS.some(([ox, oy]) => blocked[(r.y + oy) * cols + x + ox] === 0)
  }
  const targets = spec.fleet.map(([pair]) => {
    const pool = racks.filter((r) => r.pair === pair && !r.estimated && r.id !== 'A01' && reachable(r, blockedBase, 0) && reachable(r, blockedShift, 1))
    return pool[Math.floor(rng() * pool.length)].id
  })

  // AGV loops and the heat pre-run are only needed by the engine, so they are
  // computed on first access (posters during SSR/hydration skip them).
  let layouts: FloorModel['layouts'] | null = null
  return {
    ...partial,
    get layouts() {
      return (layouts ??= { base: buildLayout(spec, partial, 0, targets), bShifted: buildLayout(spec, partial, 1, targets) })
    },
    get heatReduced() {
      return this.layouts.base.heat
    },
  }
}

const cache: Partial<Record<FloorVariant, FloorModel>> = {}

/** Memoised per variant. Treat the result as read-only. */
export function buildFloorModel(variant: FloorVariant): FloorModel {
  return (cache[variant] ??= createFloorModel(variant))
}

/** Timesign placement for the STATION 02 queue stencil (「×N」). */
export function timesSignAt(model: FloorModel) {
  const spec = model.variant === 'desktop' ? DESKTOP.timesSign : MOBILE.timesSign
  return { x: spec.x, y: r3(model.lanes[1].y + spec.dy), size: spec.size }
}

// ---------------------------------------------------------------------------
// Posters (SSR)

const fmt = (v: number) => String(Math.round(v * 100) / 100)
const MONO_FAMILY = `'JetBrains Mono', ui-monospace, 'Cascadia Mono', Consolas, monospace`
const ZH_FAMILY = `'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif`
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Top-down plan poster. Units are metres; the viewBox is the floor padded by
 * 1 m. Groups carry classes so CSS can hide layers the canvas replaces.
 */
export function posterPlanSVG(model: FloorModel, locale: Locale): { viewBox: string; markup: string } {
  const W = model.width
  const H = model.height
  let grid = ''
  for (let i = 0; i < W; i += 1) grid += `M${i + 0.5} 0V${H}`
  for (let j = 0; j < H; j += 1) grid += `M0 ${j + 0.5}H${W}`
  const tapes = model.tapes.map((q) => `M${fmt(q.x)} ${fmt(q.y)}h${fmt(q.w)}v${fmt(q.h)}h${fmt(-q.w)}z`).join('')
  const racks = model.racks
    .filter((r) => !r.estimated)
    .map((r) => `M${fmt(r.x - r.w / 2)} ${fmt(r.y - r.d / 2)}h${fmt(r.w)}v${fmt(r.d)}h${fmt(-r.w)}z`)
    .join('')
  const latin = model.stencils
    .map((s) => `<text x="${fmt(s.x)}" y="${fmt(s.y)}" font-size="${fmt(s.size)}"${s.align === 'center' ? ' text-anchor="middle"' : ''}>${esc(s.text)}</text>`)
    .join('')
  const zh =
    locale === 'zh'
      ? model.stencils
          .filter((s) => s.zh)
          .map((s) => `<text x="${fmt(s.zh!.x)}" y="${fmt(s.zh!.y)}" font-size="${fmt(s.zh!.size)}">${esc(s.zh!.text)}</text>`)
          .join('')
      : ''
  const markup =
    `<g class="ow-poster-floor"><rect x="0" y="0" width="${W}" height="${H}" fill="#eceeee"/></g>` +
    `<g class="ow-poster-grid"><path d="${grid}" fill="none" stroke="#e3e6e6" stroke-width="1" vector-effect="non-scaling-stroke"/>` +
    `<rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="#d9dede" stroke-width="1" vector-effect="non-scaling-stroke"/></g>` +
    `<g class="ow-poster-tapes"><path d="${tapes}" fill="#111111"/></g>` +
    `<g class="ow-poster-racks"><path d="${racks}" fill="none" stroke="rgba(17,17,17,.35)" stroke-width="1" stroke-dasharray="2 3" vector-effect="non-scaling-stroke"/></g>` +
    `<g class="ow-poster-stencils" fill="#111111" opacity=".5" font-weight="700"><g font-family="${MONO_FAMILY}">${latin}</g>` +
    (zh ? `<g font-family="${ZH_FAMILY}">${zh}</g>` : '') +
    `</g>`
  return { viewBox: `-1 -1 ${W + 2} ${H + 2}`, markup }
}

const ISO_T = Math.PI / 4
const ISO_P = (35.264 * Math.PI) / 180

/** Static isometric figure (θ = 45°, φ = 35.264°), metres as units. */
export function posterIsoSVG(model: FloorModel): { viewBox: string; markup: string } {
  const cT = Math.cos(ISO_T)
  const sT = Math.sin(ISO_T)
  const sP = Math.sin(ISO_P)
  const cP = Math.cos(ISO_P)
  const px = (x: number, y: number) => (x - model.cx) * cT - (y - model.cy) * sT
  const py = (x: number, y: number, z: number) => ((x - model.cx) * sT + (y - model.cy) * cT) * sP - z * cP
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const pt = (x: number, y: number, z = 0) => {
    const a = px(x, y)
    const b = py(x, y, z)
    minX = Math.min(minX, a)
    maxX = Math.max(maxX, a)
    minY = Math.min(minY, b)
    maxY = Math.max(maxY, b)
    return `${fmt(a)} ${fmt(b)}`
  }
  const W = model.width
  const H = model.height
  const floor = `M${pt(0, 0)}L${pt(W, 0)}L${pt(W, H)}L${pt(0, H)}z`
  let grid = ''
  for (let i = 0; i < W; i += 1) grid += `M${pt(i + 0.5, 0)}L${pt(i + 0.5, H)}`
  for (let j = 0; j < H; j += 1) grid += `M${pt(0, j + 0.5)}L${pt(W, j + 0.5)}`
  const tapes = model.tapes.map((q) => `M${pt(q.x, q.y)}L${pt(q.x + q.w, q.y)}L${pt(q.x + q.w, q.y + q.h)}L${pt(q.x, q.y + q.h)}z`).join('')
  const bays = model.chargeBays.map((q) => `M${pt(q.x + 0.06, q.y + 0.06)}L${pt(q.x + q.w - 0.06, q.y + 0.06)}L${pt(q.x + q.w - 0.06, q.y + q.h - 0.06)}L${pt(q.x + 0.06, q.y + q.h - 0.06)}z`).join('')

  // Box symbols, drawn relative to the projected footprint centre.
  const rel = (x: number, y: number, z: number) => `${fmt(px(x + model.cx, y + model.cy))} ${fmt(py(x + model.cx, y + model.cy, z))}`
  const boxSymbol = (id: string, w: number, d: number, h: number, faces: [string, string, string], stroke: string, dashed: boolean, shelves: boolean) => {
    const x0 = -w / 2
    const x1 = w / 2
    const y0 = -d / 2
    const y1 = d / 2
    const left = `M${rel(x0, y1, 0)}L${rel(x1, y1, 0)}L${rel(x1, y1, h)}L${rel(x0, y1, h)}z`
    const right = `M${rel(x1, y0, 0)}L${rel(x1, y1, 0)}L${rel(x1, y1, h)}L${rel(x1, y0, h)}z`
    const top = `M${rel(x0, y0, h)}L${rel(x1, y0, h)}L${rel(x1, y1, h)}L${rel(x0, y1, h)}z`
    const edges = `${top}M${rel(x0, y1, h)}L${rel(x0, y1, 0)}L${rel(x1, y1, 0)}L${rel(x1, y0, 0)}L${rel(x1, y0, h)}M${rel(x1, y1, 0)}L${rel(x1, y1, h)}`
    let shelf = ''
    if (shelves) for (let z = 0.6; z < h - 0.05; z += 0.6) shelf += `M${rel(x0, y1, z)}L${rel(x1, y1, z)}L${rel(x1, y0, z)}`
    const dash = dashed ? ' stroke-dasharray="4 3"' : ''
    const ve = 'vector-effect="non-scaling-stroke"'
    return (
      `<g id="${id}"${dashed ? ' opacity=".7"' : ''}><path d="${left}" fill="${faces[0]}"/><path d="${right}" fill="${faces[1]}"/><path d="${top}" fill="${faces[2]}"/>` +
      (shelf ? `<path d="${shelf}" fill="none" stroke="${stroke}" stroke-opacity=".4" ${ve}/>` : '') +
      `<path d="${edges}" fill="none" stroke="${stroke}" stroke-linejoin="round"${dash} ${ve}/></g>`
    )
  }
  const TEAL: [string, string, string] = ['#c9e4de', '#a9d4cb', '#eaf6f3']
  const heightsUsed = [...new Set(model.racks.map((r) => r.h))].sort((a, b) => a - b)
  let defs = ''
  for (const h of heightsUsed) {
    const key = Math.round(h * 10)
    defs += boxSymbol(`owiso-r${key}`, RACK_SIZE, RACK_SIZE, h, TEAL, '#08766c', false, true)
    if (model.racks.some((r) => r.estimated && r.h === h)) defs += boxSymbol(`owiso-e${key}`, RACK_SIZE, RACK_SIZE, h, TEAL, '#08766c', true, false)
  }
  const st = model.stations[0]
  defs += boxSymbol('owiso-st', st.w, st.d, st.h, ['#e5e7eb', '#d6dadf', '#ffffff'], '#111111', false, false)

  type Item = { key: number; use: string }
  const items: Item[] = []
  for (const r of model.racks) {
    const k = Math.round(r.h * 10)
    items.push({ key: (r.x - model.cx) * sT + (r.y - model.cy) * cT, use: `<use href="#owiso-${r.estimated ? 'e' : 'r'}${k}" x="${fmt(px(r.x, r.y))}" y="${fmt(py(r.x, r.y, 0))}"/>` })
    pt(r.x - r.w / 2, r.y - r.d / 2, r.h)
  }
  for (const s of model.stations) {
    items.push({ key: (s.x - model.cx) * sT + (s.y - model.cy) * cT, use: `<use href="#owiso-st" x="${fmt(px(s.x, s.y))}" y="${fmt(py(s.x, s.y, 0))}"/>` })
  }
  items.sort((a, b) => a.key - b.key)
  const pad = 0.6
  const vb = `${fmt(minX - pad)} ${fmt(minY - pad)} ${fmt(maxX - minX + 2 * pad)} ${fmt(maxY - minY + 2 * pad)}`
  const ve = 'vector-effect="non-scaling-stroke"'
  const markup =
    `<defs>${defs}</defs>` +
    `<path d="${floor}" fill="#eceeee" stroke="#d9dede" ${ve}/>` +
    `<path d="${grid}" fill="none" stroke="#e3e6e6" ${ve}/>` +
    `<path d="${tapes}" fill="#111111"/>` +
    `<path d="${bays}" fill="none" stroke="#111111" stroke-opacity=".6" ${ve}/>` +
    items.map((i) => i.use).join('')
  return { viewBox: vb, markup }
}
