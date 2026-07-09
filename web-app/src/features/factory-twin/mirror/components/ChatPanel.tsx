import { useEffect, useRef, useState } from 'react';
import { api } from '../../../../lib/api';
import { useAuthedMutation } from '../../../../lib/auth-query';
import { useFactoryStore, uid } from '../store/factoryStore';
import { runConversation } from '../agent/runConversation';
import { TWIN_AGENT_SESSION_ID } from '../hooks/useTwinAgentBridge';
import { AuthControl } from './AuthControl';

const DEMO_SUGGESTIONS = [
  '小明在哪？',
  'HC600-03 今天狀況？',
  '派小明去處理 HC600-01',
  '找 HC600-07',
  '清除標記',
  'Send an AMR to the dock',
  '讓 HC600-02 出貨口跑一趟',
];

const LIVE_FACTORY_SUGGESTIONS = [
  '01機台現在狀況',
  '今天計畫與實際對帳',
  '現場有人嗎',
];

export function ChatPanel({ liveOnly = false }: { liveOnly?: boolean }) {
  const messages = useFactoryStore((s) => s.messages);
  const cloudAgentOnline = useFactoryStore((s) => s.cloudAgentOnline);
  const pendingAgentReplies = useFactoryStore((s) => s.pendingAgentReplies);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const sendCloudMessage = useAuthedMutation({
    mutationFn: ({ token, payload }: { token: string; payload: string }) =>
      api.postTwinAgentMessage(token, { sessionId: TWIN_AGENT_SESSION_ID, text: payload }),
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const thinking = busy || pendingAgentReplies > 0;
  const suggestions = liveOnly ? LIVE_FACTORY_SUGGESTIONS : DEMO_SUGGESTIONS;

  const send = async (text?: string) => {
    const t = (text ?? input).trim();
    if (!t || busy) return;
    setInput('');
    const store = useFactoryStore.getState();
    if (cloudAgentOnline) {
      store.addMessage({ id: uid('msg'), role: 'user', text: t });
      store.incPendingAgentReplies();
      sendCloudMessage
        .mutateAsync(t)
        .catch(() => useFactoryStore.getState().decPendingAgentReplies());
      return;
    }
    if (liveOnly) {
      store.addMessage({ id: uid('msg'), role: 'user', text: t });
      store.addMessage({
        id: uid('msg'),
        role: 'assistant',
        text: '4WALL AI 助理暫時離線，請稍後再試。',
      });
      return;
    }
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
        <span className="chat-title">4WALL AI 工廠助手</span>
        {!liveOnly ? <AuthControl /> : null}
      </div>

      <div className="chat-body">
        {messages.length === 0 && <div className="chat-empty">問我工廠任何事，或點下方範例。</div>}
        {messages.map((m) => (
          <div key={m.id} className={`bubble ${m.role}`}>
            {m.text}
          </div>
        ))}
        {thinking && <div className="bubble assistant typing">思考中…</div>}
        <div ref={endRef} />
      </div>

      <div className="chat-suggest">
        {suggestions.map((s) => (
          <button key={s} className="chip" onClick={() => send(s)}>
            {s}
          </button>
        ))}
      </div>

      <div className="chat-input">
        <textarea
          value={input}
          rows={1}
          placeholder="請輸入想了解的現場狀況…"
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
