import { createContext, useContext } from 'react'

import type { EditState, FloorStageHandle } from '../motion/floorStage'

/**
 * Shared state between the sticky canvas stage and the step cards. It is a
 * plain object (not React state) so per-frame progress updates never re-render.
 */
export type StageController = {
  handle: FloorStageHandle | null
  edits: EditState
  slots: number
  progress: number
  attach: (handle: FloorStageHandle | null) => void
  setEdits: (next: EditState) => Promise<void>
  setSlots: (n: number) => void
  setProgress: (s: number) => void
  onProgress: (listener: (s: number) => void) => () => void
}

export function createStageController(): StageController {
  const listeners = new Set<(s: number) => void>()
  const controller: StageController = {
    handle: null,
    edits: { a01Tall: false, bShift: 0, batch: false },
    slots: 3,
    progress: 0,
    attach(handle) {
      controller.handle = handle
      if (handle) {
        void handle.setEdits(controller.edits)
        handle.setSlots(controller.slots)
        handle.setProgress(controller.progress)
      }
    },
    setEdits(next) {
      controller.edits = next
      return controller.handle ? controller.handle.setEdits(next) : Promise.resolve()
    },
    setSlots(n) {
      controller.slots = n
      controller.handle?.setSlots(n)
    },
    setProgress(s) {
      controller.progress = s
      controller.handle?.setProgress(s)
      for (const listener of listeners) listener(s)
    },
    onProgress(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
  return controller
}

export const StageContext = createContext<StageController | null>(null)

export function useStage() {
  return useContext(StageContext)
}
