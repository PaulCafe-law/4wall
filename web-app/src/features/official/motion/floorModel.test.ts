import { ISO_REGION, PLAN_REGION, buildFloorModel, createFloorModel, posterIsoSVG, posterPlanSVG, type AgvLoop, type FloorLayout, type FloorModel } from './floorModel'

const variants = ['desktop', 'mobile'] as const

function rackAt(model: FloorModel, id: string) {
  const rack = model.racks.find((r) => r.id === id)
  if (!rack) throw new Error(`missing ${id}`)
  return rack
}

function expectValidLoop(model: FloorModel, layout: FloorLayout, loop: AgvLoop) {
  const { cols, rows } = model.grid
  expect(loop.cells.length).toBeGreaterThan(4)
  const seen = new Set<string>()
  loop.cells.forEach(([i, j], k) => {
    expect(Number.isInteger(i) && Number.isInteger(j)).toBe(true)
    expect(i >= 0 && j >= 0 && i < cols && j < rows).toBe(true)
    expect(layout.blocked[j * cols + i]).toBe(0)
    const [ni, nj] = loop.cells[(k + 1) % loop.cells.length]
    // 4-connected, including the closing step back to the first cell.
    expect(Math.abs(ni - i) + Math.abs(nj - j)).toBe(1)
    seen.add(`${i},${j}`)
  })
  expect(loop.points.length).toBeGreaterThanOrEqual(4)
  expect(loop.length).toBeGreaterThan(0)
  for (const [x, y] of loop.points) {
    expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true)
  }
}

describe('floorModel', () => {
  it('builds 108 desktop racks and 60 mobile racks', () => {
    expect(buildFloorModel('desktop').racks).toHaveLength(108)
    expect(buildFloorModel('mobile').racks).toHaveLength(60)
    expect(buildFloorModel('desktop').width).toBe(32)
    expect(buildFloorModel('desktop').height).toBe(18)
    expect(buildFloorModel('mobile').width).toBe(26)
    expect(buildFloorModel('mobile').height).toBe(15)
  })

  it('places A01 and A07 at the specified cells', () => {
    const d = buildFloorModel('desktop')
    expect([rackAt(d, 'A01').x, rackAt(d, 'A01').y]).toEqual([4, 3])
    expect([rackAt(d, 'A07').x, rackAt(d, 'A07').y]).toEqual([4, 6])
    expect(rackAt(d, 'A01').h).toBe(3)
    const m = buildFloorModel('mobile')
    expect([rackAt(m, 'A01').x, rackAt(m, 'A01').y]).toEqual([2, 3])
    expect(rackAt(m, 'A01').h).toBe(3)
  })

  it('marks the estimated racks', () => {
    const d = buildFloorModel('desktop')
    expect(d.ids.estimated).toEqual(['F17', 'F18'])
    expect(d.racks.filter((r) => r.estimated).map((r) => r.id)).toEqual(['F17', 'F18'])
    expect(rackAt(d, 'F17').y).toBe(12)
    const m = buildFloorModel('mobile')
    expect(m.racks.filter((r) => r.estimated).map((r) => r.id)).toEqual(['E11', 'E12'])
  })

  it('uses unique rack ids and the 2.4 / 3.0 / 3.6 m heights', () => {
    for (const v of variants) {
      const model = buildFloorModel(v)
      expect(new Set(model.racks.map((r) => r.id)).size).toBe(model.racks.length)
      for (const r of model.racks) expect([2.4, 3, 3.6]).toContain(r.h)
    }
  })

  it.each(variants)('%s: every AGV loop is a closed 4-connected walk on free cells', (variant) => {
    const model = buildFloorModel(variant)
    for (const key of ['base', 'bShifted'] as const) {
      const layout = model.layouts[key]
      expect(layout.loops).toHaveLength(model.fleetSize)
      for (const loop of layout.loops) expectValidLoop(model, layout, loop)
      expect(layout.entries).toHaveLength(model.fleetSize)
    }
    expectValidLoop(model, model.layouts.base, model.idleLoop)
    // STATION 02 receives two loops so a queue forms.
    expect(model.layouts.base.loops.filter((l) => l.station === 1)).toHaveLength(2)
  })

  it.each(variants)('%s: moving pair B closes the aisle next to it', (variant) => {
    const model = buildFloorModel(variant)
    const { cols } = model.grid
    const [, bRight] = model.pairs[1].x
    const closed = bRight + 1
    const row = model.racks[0].y
    expect(model.layouts.base.blocked[row * cols + closed]).toBe(0)
    expect(model.layouts.bShifted.blocked[row * cols + closed]).toBe(1)
    expect(model.layouts.bShifted.loops.map((l) => l.cells)).not.toEqual(model.layouts.base.loops.map((l) => l.cells))
  })

  it('is deterministic', () => {
    for (const v of variants) expect(createFloorModel(v)).toEqual(createFloorModel(v))
    expect(buildFloorModel('desktop')).toBe(buildFloorModel('desktop'))
  })

  it('precomputes reduced-motion heat levels 0..16', () => {
    const model = buildFloorModel('desktop')
    expect(model.heatReduced).toHaveLength(model.grid.cols * model.grid.rows)
    expect(Math.max(...model.heatReduced)).toBe(16)
    expect(model.heatReduced.every((v) => Number.isInteger(v) && v >= 0 && v <= 16)).toBe(true)
  })

  it('renders the posters', () => {
    for (const v of variants) {
      const model = buildFloorModel(v)
      for (const locale of ['zh', 'en'] as const) {
        const plan = posterPlanSVG(model, locale)
        expect(plan.markup.length).toBeGreaterThan(100)
        expect(plan.markup).not.toContain('NaN')
        expect(plan.viewBox).toBe(`-1 -1 ${model.width + 2} ${model.height + 2}`)
        expect(plan.markup.includes('收貨口')).toBe(locale === 'zh')
      }
    }
    const iso = posterIsoSVG(buildFloorModel('mobile'))
    expect(iso.markup.length).toBeGreaterThan(100)
    expect(iso.markup).not.toContain('NaN')
    expect(iso.viewBox).not.toContain('NaN')
    expect(iso.markup.length).toBeLessThan(10 * 1024)
  })

  it('computes the plan and iso regions', () => {
    expect(PLAN_REGION('desktop', 1000, 500)).toEqual({ x: 400, y: 50, w: 570, h: 400 })
    expect(ISO_REGION('desktop', 1000, 500)).toEqual({ x: 400, y: 40, w: 550, h: 420 })
    expect(PLAN_REGION('mobile', 390, 300)).toEqual({ x: 16, y: 16, w: 358, h: 268 })
    expect(ISO_REGION('mobile', 390, 300)).toEqual(PLAN_REGION('mobile', 390, 300))
  })
})
