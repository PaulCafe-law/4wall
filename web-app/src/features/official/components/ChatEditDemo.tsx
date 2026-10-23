import { useEffect, useRef, useState, type FormEvent } from 'react'

import { fill, type OfficialCopy, type OfficialLocale } from '../officialContent'
import type { EditState } from '../motion/floorStage'
import { prefersReducedMotion } from '../motion/scheduler'
import { useHydrated } from './hooks'
import { RichText } from './shared'
import { useStage } from './stageController'

type Line = { id: number; who: 'user' | 'sys'; text: string; tone?: 'ok' | 'warn'; rich?: boolean }

/** A saved warehouse version: undo restores an older content as a new version, like the product. */
type Entry = { edit: EditState; version: number }

type ChatState = { version: number; history: Entry[]; log: Line[]; busy: boolean }

const BASE: EditState = { a01Tall: false, bShift: 0, batch: false }
const A01: EditState = { a01Tall: true, bShift: 0, batch: false }

/** The SSR / reduced-motion transcript: A01 already edited, version 2. */
function finalState(t: OfficialCopy): ChatState {
  return {
    version: 2,
    history: [
      { edit: BASE, version: 1 },
      { edit: A01, version: 2 },
    ],
    log: [
      { id: -2, who: 'user', text: t.chat.chips[0] },
      { id: -1, who: 'sys', text: fill(t.chat.replyA01, { n: 2 }), tone: 'ok' },
    ],
    busy: false,
  }
}

function initialState(): ChatState {
  return { version: 1, history: [{ edit: BASE, version: 1 }], log: [], busy: false }
}

const head = (state: ChatState) => state.history[state.history.length - 1].edit

function normalise(text: string) {
  // Full-width ASCII and ideographic spaces → half-width, so 「Ａ01」 matches "A01".
  let out = ''
  for (const ch of text.trim()) {
    const code = ch.charCodeAt(0)
    if (code >= 0xff01 && code <= 0xff5e) out += String.fromCharCode(code - 0xfee0)
    else if (code === 0x3000) out += ' '
    else out += ch
  }
  return out.replace(/\s+/g, ' ').toLowerCase()
}

export function ChatEditDemo({ t, locale }: { t: OfficialCopy; locale: OfficialLocale }) {
  const stage = useStage()
  const hydrated = useHydrated()
  const [state, setState] = useState<ChatState>(() => finalState(t))
  const [typing, setTyping] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const stateRef = useRef(state)
  const timers = useRef<number[]>([])
  const nextId = useRef(0)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach((id) => window.clearTimeout(id))
  }, [])

  const later = (ms: number) =>
    new Promise<void>((resolve) => {
      timers.current.push(window.setTimeout(resolve, ms))
    })
  const line = (who: Line['who'], text: string, extra: Partial<Line> = {}): Line => {
    nextId.current += 1
    return { id: nextId.current, who, text, ...extra }
  }

  // Scroll choreography (C3): reset to version 1 once the stage is live, play the
  // first edit at s ≥ 4.25, and reset again when the visitor scrolls back above 3.8.
  useEffect(() => {
    if (!stage || typeof IntersectionObserver === 'undefined') return undefined

    if (prefersReducedMotion()) {
      // Final transcript stays; the still canvas shows the edit from step 03 on.
      let shown: boolean | null = null
      return stage.onProgress((s) => {
        const want = s >= 4
        if (want === shown) return
        shown = want
        void stage.setEdits(want ? head(stateRef.current) : BASE)
      })
    }

    let phase: 'idle' | 'playing' | 'played' = 'idle'
    let primed = false
    const reset = () => {
      phase = 'idle'
      setTyping(null)
      setState(initialState())
      void stage.setEdits(BASE)
    }
    const play = async () => {
      const current = stateRef.current
      // Never overwrite edits the visitor already made.
      if (current.busy || current.version > 1) {
        phase = 'played'
        return
      }
      phase = 'playing'
      const text = t.chat.chips[0]
      setState((prev) => ({ ...prev, busy: true }))
      const step = locale === 'zh' ? 32 : 18
      for (let i = 1; i <= text.length; i += 1) {
        setTyping(text.slice(0, i))
        await later(step)
      }
      setTyping(null)
      const parsing = line('sys', t.chat.parsing)
      setState((prev) => ({ ...prev, log: [...prev.log, line('user', text), parsing] }))
      await later(600)
      const next: EditState = { ...head(stateRef.current), a01Tall: true }
      await stage.setEdits(next)
      setState((prev) => {
        const version = prev.version + 1
        return {
          version,
          history: [...prev.history, { edit: next, version }],
          log: [...prev.log.filter((l) => l.id !== parsing.id), line('sys', fill(t.chat.replyA01, { n: version }), { tone: 'ok' })],
          busy: false,
        }
      })
      phase = 'played'
      if (stage.progress < 3.8) reset()
    }
    return stage.onProgress((s) => {
      if (!primed) {
        primed = true
        if (s < 4.25) {
          reset()
        } else {
          phase = 'played'
          void stage.setEdits(head(stateRef.current))
        }
        return
      }
      if (phase === 'idle' && s >= 4.25) void play()
      else if (phase === 'played' && s < 3.8 && !stateRef.current.busy) reset()
    })
    // t/locale are stable for the page's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage])

  async function apply(next: EditState, reply: string) {
    setState((prev) => ({ ...prev, busy: true }))
    await stage?.setEdits(next)
    setState((prev) => {
      const version = prev.version + 1
      return {
        version,
        history: [...prev.history, { edit: next, version }],
        log: [...prev.log, line('sys', fill(reply, { n: version }), { tone: 'ok' })],
        busy: false,
      }
    })
  }

  async function runChip(index: number) {
    const current = stateRef.current
    if (current.busy) return
    const text = t.chat.chips[index]
    const top = head(current)
    setState((prev) => ({ ...prev, log: [...prev.log, line('user', text)] }))
    if (index === 0) {
      if (top.a01Tall) {
        setState((prev) => ({ ...prev, log: [...prev.log, line('sys', fill(t.chat.replyA01, { n: prev.version }), { tone: 'ok' })] }))
        return
      }
      await apply({ ...top, a01Tall: true }, t.chat.replyA01)
    } else if (index === 1) {
      if (top.bShift === 1) {
        setState((prev) => ({ ...prev, log: [...prev.log, line('sys', fill(t.chat.replyBMove, { n: prev.version }), { tone: 'ok' })] }))
        return
      }
      await apply({ ...top, bShift: 1 }, t.chat.replyBMove)
    } else {
      if (top.batch) {
        setState((prev) => ({ ...prev, log: [...prev.log, line('sys', fill(t.chat.replyBatch, { n: prev.version }), { tone: 'ok' })] }))
        return
      }
      await apply({ ...top, batch: true }, t.chat.replyBatch)
    }
  }

  async function undo() {
    const current = stateRef.current
    if (current.busy || current.history.length < 2) return
    const restored = current.history[current.history.length - 2]
    setState((prev) => ({ ...prev, busy: true }))
    await stage?.setEdits(restored.edit)
    setState((prev) => {
      const version = prev.version + 1
      return {
        version,
        history: prev.history.slice(0, -1),
        log: [...prev.log, line('sys', fill(t.chat.replyUndo, { from: restored.version, n: version }))],
        busy: false,
      }
    })
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const raw = draft.trim()
    const text = normalise(draft)
    if (!text || stateRef.current.busy) return
    setDraft('')
    const chip = t.chat.chips.findIndex((c) => normalise(c) === text)
    if (chip >= 0) {
      void runChip(chip)
      return
    }
    if (t.chat.undoWords.some((w) => normalise(w) === text)) {
      setState((prev) => ({ ...prev, log: [...prev.log, line('user', raw)] }))
      void undo()
      return
    }
    setState((prev) => ({
      ...prev,
      log: [...prev.log, line('user', raw), line('sys', t.chat.fallback, { tone: 'warn', rich: true })],
    }))
  }

  const busy = state.busy

  return (
    <div className="ow-panel ow-chat" role="group" aria-label={t.chat.groupAria}>
      <div className="ow-panel__head">
        <span className="ow-panel__title">{t.chat.header}</span>
        <span className="ow-chat__version ow-mono" key={state.version}>
          {fill(t.chat.version, { n: state.version })}
        </span>
      </div>
      <ol className="ow-chat__log" role="log" aria-live="polite">
        {state.log.map((item) => (
          <li key={item.id} className={`ow-chat__line ow-chat__line--${item.who}${item.tone ? ` is-${item.tone}` : ''}`}>
            <span className="ow-sr">
              {item.who === 'user' ? t.chat.you : t.chat.system}
              {locale === 'zh' ? '：' : ': '}
            </span>
            {item.rich ? <RichText text={item.text} locale={locale} /> : item.text}
          </li>
        ))}
        {typing !== null ? (
          <li className="ow-chat__line ow-chat__line--user is-typing" aria-hidden="true">
            {typing}
            <span className="ow-caret" />
          </li>
        ) : null}
      </ol>
      {/* Controls only work with JavaScript, so they appear after hydration. */}
      <div className="ow-chat__chips" hidden={!hydrated}>
        {t.chat.chips.map((chip, i) => (
          <button key={chip} type="button" className="ow-chip-btn" aria-disabled={busy} onClick={() => void runChip(i)}>
            {chip}
          </button>
        ))}
        <button type="button" className="ow-chip-btn ow-chip-btn--undo" aria-disabled={busy || state.history.length < 2} onClick={() => void undo()}>
          ↺ {t.chat.undo}
        </button>
      </div>
      <form className="ow-chat__form" onSubmit={submit} hidden={!hydrated}>
        <input
          className="ow-chat__input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t.chat.placeholder}
          aria-label={t.chat.inputAria}
          maxLength={80}
        />
        <button type="submit" className="ow-chat__send">
          {t.chat.send}
        </button>
      </form>
      <p className="ow-panel__foot">
        {t.chat.footer}
      </p>
    </div>
  )
}
