import { useState } from 'react';
import { useFactoryStore, type ReasoningTrace } from '../store/factoryStore';

function severityLabel(severity: string): string {
  if (severity === 'critical') return '緊急';
  if (severity === 'warning') return '警示';
  return '通知';
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function TracePanel({ trace }: { trace: ReasoningTrace }) {
  return (
    <div className="agent-trace">
      <div className="agent-trace-root">
        <span>根因</span>
        <strong>{trace.rootCause}</strong>
        <em>信心值 {pct(trace.confidence)}</em>
      </div>

      <div className="agent-trace-section">
        <h4>證據</h4>
        {trace.evidence.slice(0, 5).map((item) => (
          <div key={item.id} className="agent-trace-row">
            <span>{item.source}</span>
            <p>{item.detail}</p>
          </div>
        ))}
      </div>

      <div className="agent-trace-section">
        <h4>候選根因</h4>
        {trace.candidates.map((candidate) => (
          <div key={candidate.id} className="agent-trace-row">
            <span>{pct(candidate.confidence)}</span>
            <p>
              <strong>{candidate.title}</strong>
              {candidate.why}
            </p>
          </div>
        ))}
      </div>

      <div className="agent-trace-section">
        <h4>推理步驟</h4>
        {trace.steps.map((step) => (
          <div key={step.id} className="agent-trace-row">
            <span>{step.title}</span>
            <p>{step.detail}</p>
          </div>
        ))}
      </div>

      <div className="agent-trace-section">
        <h4>處置計畫</h4>
        {trace.plan.map((step) => (
          <div key={step.id} className={`agent-plan-row ${step.autonomy}`}>
            <span>{step.autonomy === 'auto' ? '自動' : step.autonomy === 'suggest' ? '建議' : '禁止'}</span>
            <p>{step.title}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AgentFeed() {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [minimized, setMinimized] = useState(false);
  const connected = useFactoryStore((s) => s.agentConnected);
  const notifications = useFactoryStore((s) => s.agentNotifications);
  const dismiss = useFactoryStore((s) => s.dismissAgentNotification);

  if (minimized) {
    return (
      <section className="agent-feed minimized" aria-label="Supervisor Agent 已最小化">
        <div className={`agent-dot ${connected ? 'online' : ''}`} />
        <div>
          <div className="agent-kicker">Supervisor Agent</div>
          <div className="agent-title">主動通知 · {notifications.length}</div>
        </div>
        <button
          className="agent-mini-button"
          onPointerDown={(event) => {
            event.preventDefault();
            setMinimized(false);
          }}
          type="button"
          aria-label="展開 Supervisor Agent"
          title="展開 Supervisor Agent"
        >
          +
        </button>
      </section>
    );
  }

  if (notifications.length === 0) {
    return (
      <section className="agent-feed idle" aria-label="Supervisor Agent">
        <div className={`agent-dot ${connected ? 'online' : ''}`} />
        <span>{connected ? 'Supervisor Agent 待命中' : 'Supervisor Agent 連線中'}</span>
      </section>
    );
  }

  return (
    <section className="agent-feed" aria-label="Supervisor Agent 主動通知">
      <div className="agent-feed-head">
        <div>
          <div className="agent-kicker">Supervisor Agent</div>
          <div className="agent-title">主動通知</div>
        </div>
        <div className="agent-head-actions">
          <div className={`agent-dot ${connected ? 'online' : ''}`} />
          <button
            className="agent-mini-button"
            onPointerDown={(event) => {
              event.preventDefault();
              setMinimized(true);
            }}
            type="button"
            aria-label="最小化 Supervisor Agent"
            title="最小化 Supervisor Agent"
          >
            -
          </button>
        </div>
      </div>
      <div className="agent-list">
        {notifications.slice(0, 4).map((notification) => {
          const isExpanded = !!expanded[notification.id];
          return (
            <article key={notification.id} className={`agent-card ${notification.severity}`}>
              <div className="agent-card-meta">
                <span>{severityLabel(notification.severity)}</span>
                <span>LINE {notification.lineMode}</span>
                {notification.trace ? <span>RCA {pct(notification.trace.confidence)}</span> : null}
              </div>
              <div className="agent-card-title">{notification.title}</div>
              <p>{notification.message}</p>
              <div className="agent-card-actions">
                {notification.trace ? (
                  <button
                    type="button"
                    onClick={() => setExpanded((value) => ({ ...value, [notification.id]: !isExpanded }))}
                  >
                    {isExpanded ? '關閉推理' : '展開推理'}
                  </button>
                ) : null}
                <button type="button" onClick={() => dismiss(notification.id)} aria-label="關閉通知">
                  關閉
                </button>
              </div>
              {isExpanded && notification.trace ? <TracePanel trace={notification.trace} /> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
