// One requestAnimationFrame loop for every animation on the official site.
// Client-only: nothing here touches the DOM until a task is added.

export type TaskKind = 'loop' | 'scroll'

export type SchedulerTask = {
  /** 'loop' runs every frame (pausable); 'scroll' runs after scroll/resize until it settles. */
  kind: TaskKind
  /** Optional element gating the task: it only runs while this element intersects the viewport. */
  target?: Element | null
  /** Return true to request another frame (e.g. a scroll task still easing towards its target). */
  run: (now: number, dt: number) => boolean | void
}

type Entry = SchedulerTask & { visible: boolean; wantsMore: boolean }

const PAUSE_KEY = 'ow-motion-paused'
const entries = new Set<Entry>()
const pauseListeners = new Set<(paused: boolean) => void>()
let raf = 0
let last = 0
let scrollDirty = true
let paused: boolean | null = null
let reduced: boolean | null = null
let observer: IntersectionObserver | null = null
let listening = false

export function prefersReducedMotion() {
  if (reduced === null) {
    reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  }
  return reduced
}

/** Without IntersectionObserver (old browsers, jsdom) we never run loops. */
export function motionSupported() {
  return typeof window !== 'undefined' && typeof IntersectionObserver !== 'undefined' && typeof requestAnimationFrame !== 'undefined'
}

export function isPaused() {
  if (paused === null) {
    paused = false
    try {
      paused = window.sessionStorage.getItem(PAUSE_KEY) === '1'
    } catch {
      paused = false
    }
  }
  return paused
}

export function setPaused(next: boolean) {
  paused = next
  try {
    window.sessionStorage.setItem(PAUSE_KEY, next ? '1' : '0')
  } catch {
    // storage blocked: keep the in-memory flag
  }
  for (const listener of pauseListeners) listener(next)
  kick()
}

export function onPausedChange(listener: (paused: boolean) => void) {
  pauseListeners.add(listener)
  return () => {
    pauseListeners.delete(listener)
  }
}

export function markScrollDirty() {
  scrollDirty = true
  kick()
}

function ensureListeners() {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('scroll', markScrollDirty, { passive: true })
  window.addEventListener('resize', markScrollDirty, { passive: true })
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      last = 0
      kick()
    }
  })
}

function getObserver() {
  if (!observer && typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver(
      (records) => {
        for (const record of records) {
          for (const entry of entries) {
            if (entry.target !== record.target) continue
            // A scroll that happened while the target was off-screen consumed the dirty
            // flag without running this task, so catch up once it becomes visible.
            if (record.isIntersecting && !entry.visible) entry.wantsMore = true
            entry.visible = record.isIntersecting
          }
        }
        kick()
      },
      { rootMargin: '100px 0px' },
    )
  }
  return observer
}

export function addTask(task: SchedulerTask) {
  const entry: Entry = { ...task, visible: !task.target, wantsMore: true }
  entries.add(entry)
  ensureListeners()
  if (task.target) getObserver()?.observe(task.target)
  kick()
  return () => {
    entries.delete(entry)
    if (task.target && ![...entries].some((e) => e.target === task.target)) observer?.unobserve(task.target)
  }
}

function frame(now: number) {
  raf = 0
  const dt = last ? Math.min(64, now - last) : 16
  last = now
  const hidden = document.hidden
  const loopsAllowed = !hidden && !isPaused() && !prefersReducedMotion()
  const runScroll = scrollDirty
  scrollDirty = false
  let again = false
  for (const entry of entries) {
    if (!entry.visible || hidden) continue
    if (entry.kind === 'loop') {
      if (!loopsAllowed) continue
      entry.run(now, dt)
      again = true
    } else if (runScroll || entry.wantsMore) {
      entry.wantsMore = entry.run(now, dt) === true
      if (entry.wantsMore) again = true
    }
  }
  if (again) raf = requestAnimationFrame(frame)
  else last = 0
}

export function kick() {
  if (!raf && typeof requestAnimationFrame !== 'undefined' && entries.size) raf = requestAnimationFrame(frame)
}
