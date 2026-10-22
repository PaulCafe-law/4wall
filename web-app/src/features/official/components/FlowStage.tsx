import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import { fill, type OfficialCopy, type OfficialLocale } from '../officialContent'
import { buildFloorModel, posterPlanSVG } from '../motion/floorModel'
import type { FloorStageHandle } from '../motion/floorStage'
import { addTask, isPaused, markScrollDirty, motionSupported, onPausedChange, prefersReducedMotion, setPaused } from '../motion/scheduler'
import { Hero } from './Hero'
import { useHydrated } from './hooks'
import { Stamp } from './shared'
import { StageContext, createStageController } from './stageController'
import { StageSteps } from './StageSteps'

const DESKTOP_QUERY = '(min-width: 1024px)'

function legendFor(t: OfficialCopy, slot: number) {
  if (slot < 2) return t.stage.legendPlan
  const k = Math.min(6, slot - 1)
  const base = fill(t.stage.legendPattern, { k: String(k).padStart(2, '0'), name: t.stage.legendSteps[k - 1] })
  return k === 4 ? `${base}${t.stage.legendHeat}` : base
}

function MotionToggle({ t }: { t: OfficialCopy }) {
  const hydrated = useHydrated()
  const paused = useSyncExternalStore(onPausedChange, isPaused, () => false)
  if (!hydrated || prefersReducedMotion() || !motionSupported()) return null
  return (
    <button
      type="button"
      className="ow-stage__pause"
      aria-pressed={paused}
      aria-label={t.motion.pause}
      title={paused ? t.motion.play : t.motion.pause}
      onClick={() => setPaused(!paused)}
    >
      <span aria-hidden="true">{paused ? '▶' : '❚❚'}</span>
    </button>
  )
}

export function FlowStage({ t, locale }: { t: OfficialCopy; locale: OfficialLocale }) {
  const [controller] = useState(createStageController)
  const wrapRef = useRef<HTMLDivElement>(null)
  const holderRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const legendRef = useRef<HTMLParagraphElement>(null)
  const railRef = useRef<HTMLElement>(null)

  const posters = useMemo(
    () => ({
      desktop: posterPlanSVG(buildFloorModel('desktop'), locale),
      mobile: posterPlanSVG(buildFloorModel('mobile'), locale),
    }),
    [locale],
  )

  // Engine: loaded after hydration when the browser is idle; rebuilt when the
  // layout crosses the desktop breakpoint.
  useEffect(() => {
    const canvas = canvasRef.current
    const holder = holderRef.current
    if (!canvas || !holder || !motionSupported()) return undefined
    const media = window.matchMedia(DESKTOP_QUERY)
    let cancelled = false
    let handle: FloorStageHandle | null = null
    let idle = 0
    let fallback = 0

    const boot = async () => {
      const { createFloorStage } = await import('../motion/floorStage')
      if (cancelled) return
      handle?.destroy()
      const variant = media.matches ? 'desktop' : 'mobile'
      handle = createFloorStage(canvas, { model: buildFloorModel(variant), locale, reduced: prefersReducedMotion(), variant })
      handle.setPaused(isPaused())
      handle.onFirstFrame(() => holder.setAttribute('data-live', '1'))
      controller.attach(handle)
    }
    const schedule = () => {
      const ric = window.requestIdleCallback
      if (ric) idle = ric(() => void boot(), { timeout: 1200 })
      else fallback = window.setTimeout(() => void boot(), 200)
    }
    schedule()

    const onBreakpoint = () => {
      holder.removeAttribute('data-live')
      void boot()
    }
    media.addEventListener('change', onBreakpoint)
    const unpause = onPausedChange((p) => handle?.setPaused(p))
    const ro = new ResizeObserver(() => handle?.resize())
    ro.observe(holder)
    // A device-pixel-ratio change (window moved to another screen) needs a new backing store.
    let dprQuery: MediaQueryList | null = null
    const onDpr = () => {
      handle?.resize()
      dprQuery?.removeEventListener('change', onDpr)
      dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      dprQuery.addEventListener('change', onDpr)
    }
    dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    dprQuery.addEventListener('change', onDpr)
    return () => {
      cancelled = true
      if (idle) window.cancelIdleCallback?.(idle)
      window.clearTimeout(fallback)
      dprQuery?.removeEventListener('change', onDpr)
      media.removeEventListener('change', onBreakpoint)
      unpause()
      ro.disconnect()
      controller.attach(null)
      handle?.destroy()
    }
  }, [controller, locale])

  // Scroll → progress s (C1.2). Geometry is cached; scroll only marks dirty.
  useEffect(() => {
    const wrap = wrapRef.current
    const holder = holderRef.current
    if (!wrap || !holder || typeof IntersectionObserver === 'undefined') return undefined
    let slots: Array<{ el: HTMLElement; top: number; height: number }> = []
    let wrapTop = 0
    let s = controller.progress
    let active = -1
    const railTicks = [...(railRef.current?.querySelectorAll<HTMLElement>('[data-tick]') ?? [])]

    const measure = () => {
      wrapTop = wrap.getBoundingClientRect().top + window.scrollY
      slots = [...wrap.querySelectorAll<HTMLElement>('[data-slot]')].map((el) => {
        const rect = el.getBoundingClientRect()
        return { el, top: rect.top + window.scrollY - wrapTop, height: rect.height }
      })
      markScrollDirty()
    }
    measure()
    let measureTimer = 0
    const ro = new ResizeObserver(() => {
      window.clearTimeout(measureTimer)
      measureTimer = window.setTimeout(measure, 150)
    })
    ro.observe(wrap)
    document.fonts?.ready.then(measure)

    const targetFor = () => {
      const desktop = window.innerWidth >= 1024
      let anchorOffset = window.innerHeight / 2
      if (!desktop) {
        const stickyBottom = 56 + holder.offsetHeight
        anchorOffset = stickyBottom + (window.innerHeight - stickyBottom) / 2
      }
      const anchor = window.scrollY - wrapTop + anchorOffset
      let target = 0
      for (let i = 0; i < slots.length; i += 1) {
        const slot = slots[i]
        if (anchor >= slot.top && anchor < slot.top + slot.height) {
          target = i + (anchor - slot.top) / slot.height
          break
        }
        if (anchor >= slot.top + slot.height) target = i + 1
      }
      return Math.min(slots.length, Math.max(0, target))
    }

    const setActive = (index: number) => {
      if (index === active) return
      slots[active]?.el.classList.remove('is-active')
      active = index
      slots[active]?.el.classList.add('is-active')
      if (legendRef.current) legendRef.current.textContent = legendFor(t, index)
      holder.setAttribute('data-step', String(index))
      railTicks.forEach((tick, k) => tick.toggleAttribute('data-current', k === index - 2))
    }

    const reduced = prefersReducedMotion()
    const remove = addTask({
      kind: 'scroll',
      target: wrap,
      run: (_now, dt) => {
        const target = targetFor()
        s = reduced ? target : s + (target - s) * (1 - Math.exp(-dt / 90))
        if (Math.abs(target - s) < 0.001) s = target
        controller.setProgress(s)
        setActive(Math.min(slots.length - 1, Math.floor(s)))
        holder.style.setProperty('--ow-rail', String(Math.min(1, Math.max(0, (s - 2) / 6))))
        holder.toggleAttribute('data-rail', s >= 1.6 && s <= 7.9)
        return s !== target
      },
    })
    return () => {
      remove()
      ro.disconnect()
      window.clearTimeout(measureTimer)
    }
  }, [controller, t])

  return (
    <StageContext.Provider value={controller}>
      <div id="flow-wrap" ref={wrapRef} className="ow-stage">
        <Hero t={t} locale={locale} />
        <div ref={holderRef} className="ow-stage__holder" data-step="0">
          <svg
            className="ow-stage__poster ow-stage__poster--desktop"
            viewBox={posters.desktop.viewBox}
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
            focusable="false"
            dangerouslySetInnerHTML={{ __html: posters.desktop.markup }}
          />
          <svg
            className="ow-stage__poster ow-stage__poster--mobile"
            viewBox={posters.mobile.viewBox}
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
            focusable="false"
            dangerouslySetInnerHTML={{ __html: posters.mobile.markup }}
          />
          <canvas ref={canvasRef} className="ow-stage__canvas" aria-hidden="true" />
          <span className="ow-corner ow-corner--tl" aria-hidden="true" />
          <span className="ow-corner ow-corner--br" aria-hidden="true" />
          <Stamp className="ow-stage__stamp">{t.stamp.illustrativeAnim}</Stamp>
          <p ref={legendRef} className="ow-stage__legend" aria-hidden="true">
            {t.stage.legendPlan}
          </p>
          <nav ref={railRef} className="ow-rail" aria-label={t.stage.railLabel}>
            <span className="ow-rail__tape" aria-hidden="true" />
            <span className="ow-rail__marker" aria-hidden="true" />
            <ol>
              {t.stage.rail.map((label, k) => (
                <li key={label}>
                  <a href={`#step-0${k + 1}`} data-tick aria-label={t.stage.railAria[k]}>
                    <span className="ow-rail__label">{label}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <MotionToggle t={t} />
        </div>
        <StageSteps t={t} locale={locale} />
      </div>
    </StageContext.Provider>
  )
}
