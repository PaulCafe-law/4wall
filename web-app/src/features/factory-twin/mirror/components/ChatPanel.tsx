import { useEffect, useRef, useState } from 'react';
import { useFactoryStore } from '../store/factoryStore';
import { runConversation } from '../agent/runConversation';
import { AuthControl } from './AuthControl';

const SUGGESTIONS = ['小明在哪？', 'HC600-03 今天狀況？', '派小明去處理 HC600-01', '找 HC600-07', '清除標記'];

export function ChatPanel() {
  const messages = useFactoryStore((s) => s.messages);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (text?: string) => {
    const t = (text ?? input).trim();
    if (!t || busy) return;
    setInput('');
    setBusy(true);
    try {
      await runConversation(t);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chat">
      <div className="chat-head">
        <span className="chat-title">工廠對話</span>
        <AuthControl />
      </div>

      <div className="chat-body">
        {messages.length === 0 && <div className="chat-empty">問我工廠任何事，或點下方範例。</div>}
        {messages.map((m) => (
          <div key={m.id} className={`bubble ${m.role}`}>
            {m.text}
          </div>
        ))}
        {busy && <div className="bubble assistant typing">思考中…</div>}
        <div ref={endRef} />
      </div>

      <div className="chat-suggest">
        {SUGGESTIONS.map((s) => (
          <button key={s} className="chip" onClick={() => send(s)}>
            {s}
          </button>
        ))}
      </div>

      <div className="chat-input">
        <textarea
          value={input}
          rows={1}
          placeholder="問工廠任何事…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button className="send" onClick={() => void send()} disabled={busy} aria-label="送出">
          ↑
        </button>
      </div>
    </div>
  );
}
