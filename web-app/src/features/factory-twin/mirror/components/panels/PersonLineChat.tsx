// Faux LINE chat window. Looks/behaves like LINE but does NOT call the real Messaging API.
// Swap `send` for a backend call later to go live.
import { useState } from 'react';
import type { PersonEntity } from '../../domain/entities';

interface Msg {
  id: number;
  from: 'me' | 'them';
  text: string;
}

export function PersonLineChat({ entity }: { entity: PersonEntity }) {
  const [msgs, setMsgs] = useState<Msg[]>([
    { id: 1, from: 'them', text: `我是 ${entity.name}，目前在 ${entity.station ?? '產線'}。有什麼需要協助的嗎？` },
  ]);
  const [input, setInput] = useState('');

  const send = () => {
    const t = input.trim();
    if (!t) return;
    const myId = Date.now();
    setMsgs((m) => [...m, { id: myId, from: 'me', text: t }]);
    setInput('');
    window.setTimeout(() => {
      setMsgs((m) => [...m, { id: myId + 1, from: 'them', text: '收到，馬上處理！' }]);
    }, 800);
  };

  return (
    <div className="detail">
      <div className="panel-title">LINE 對話（擬真）</div>
      <div className="line-head">
        <span className="line-avatar">{entity.name.slice(0, 1)}</span>
        <div>
          <div className="line-name">{entity.name}</div>
          <div className="line-role">{entity.role}</div>
        </div>
      </div>

      <div className="line-body">
        {msgs.map((m) => (
          <div key={m.id} className={`line-bubble ${m.from}`}>
            {m.text}
          </div>
        ))}
      </div>

      <div className="chat-input">
        <textarea
          rows={1}
          value={input}
          placeholder={`傳 LINE 給 ${entity.name}…`}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="send" onClick={send} aria-label="送出">
          ↑
        </button>
      </div>
      <div className="detail-note">擬真視窗；之後接 LINE Messaging API 即可真正送出。</div>
    </div>
  );
}
