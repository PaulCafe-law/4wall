# Factory Twin Agent Worker

This worker runs on the operator's laptop. It polls twin-agent jobs from the platform outbound-only, composes one prompt from the booth world snapshot, answers through the operator's personal OpenAI OAuth (Codex CLI) via a subprocess bridge, and posts `{text, toolCalls}` back.

It never stores OpenAI tokens and never accepts inbound connections. The bridge subprocess environment is scrubbed of a fixed deny-list (`ANTHROPIC_API_KEY`, `AZURE_OPENAI_API_KEY`, `CODEX_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `OPENAI_API_KEY`), every variable whose name ends with `_API_KEY`, and `TWIN_AGENT_WORKER_TOKEN`.

## Data Flow

```text
Bearer TWIN_AGENT_WORKER_TOKEN GET /v1/twin-agent/jobs
  -> {job: {jobId, source, text, sessionId?, groupId?, siteSlug?, organizationId?} | null, world, worldAgeSeconds, ledgerContext?}
  -> skip duplicate job ids
  -> build one prompt: rules + tool specs + world JSON + ledgerContext JSON + job
  -> scripts/openai_oauth_bridge.py -> codex exec (local OAuth login)
  -> validate toolCalls against the allowlist, truncate text
  -> POST /v1/twin-agent/jobs/{jobId}/result
```

## Install

Linux:

```bash
cd planner-server/deploy/twin-agent-worker
./install.sh
```

Windows laptop:

```powershell
cd planner-server\deploy\twin-agent-worker
.\install.ps1
```

Set secrets outside git:

```bash
export TWIN_AGENT_ENABLED=true
export TWIN_AGENT_API_BASE_URL="https://four-wall-api.onrender.com"
export TWIN_AGENT_WORKER_TOKEN="..."
```

`TWIN_AGENT_WORKER_TOKEN` must match the planner-server `TWIN_AGENT_WORKER_TOKEN` setting.

## Codex CLI Login on Windows

The bridge shells out to the locally logged-in Codex CLI; the CLI owns the OAuth cache (`C:\Users\<you>\.codex`).

```powershell
npm install -g @openai/codex
codex login
```

The bridge resolves the CLI via the `CODEX_CLI` environment variable first, then `codex` on `PATH`, then the legacy `~/.local/codex-cli/node_modules/@openai/codex/bin/codex.js` install (which needs Node via `CODEX_NODE` or `~/.local/opt/node-v22/bin/node`).

In `config.yaml` on Windows, point the bridge command at the venv interpreter:

```yaml
agent:
  command:
    - ".\\.venv\\Scripts\\python.exe"
    - "scripts/openai_oauth_bridge.py"
    - "--model"
    - "{model}"
    - "--timeout-sec"
    - "40"
```

Keep `agent.timeout_sec` (45 by default) and the bridge `--timeout-sec` under the backend job claim TTL (60s), or slow answers are reclaimed server-side and every result submit dies as HTTP 409.

## Offline Dry Run

Create a job file:

```json
{
  "job": { "jobId": "local-1", "source": "web", "text": "HC600-01 現在溫度多少？" },
  "world": { "entities": [] },
  "worldAgeSeconds": 2.0,
  "ledgerContext": {
    "available": true,
    "date": "2026-07-09",
    "timezone": "Asia/Taipei",
    "text": "今日尚無派工單對帳資料。",
    "planVsActual": []
  }
}
```

Run without any network or Codex CLI:

```bash
python -m agent_worker.main --config config.yaml --input samples/job.json --dry-run --fake-agent
```

Drop `--fake-agent` to exercise the real bridge through the local Codex login while still skipping the platform POST.

## Run

```bash
TWIN_AGENT_ENABLED=true python -m agent_worker.main --config config.yaml --once
TWIN_AGENT_ENABLED=true python -m agent_worker.main --config config.yaml
```

Live polling requires `TWIN_AGENT_ENABLED=true` (or `platform.enabled: true` in `config.yaml`); without it the worker prints a JSON error and exits nonzero instead of claiming jobs it cannot answer to. Offline `--input` mode works regardless. Publishing is on by default — pass `--dry-run` to skip posting results.

The worker polls every `platform.poll_interval_sec`, retries platform errors with exponential backoff (max 300s), and logs JSON lines to stdout/stderr.

## Degraded Modes

- Worker offline or not polling: the booth chat falls back to the local rule engine; LINE questions get the canned offline reply once the job expires server-side.
- Codex CLI missing, logged out, or bridge timeout (`auth_required` / `failed`): the worker still posts the fallback text 「AI 助理暫時無法回應，請稍後再試 / The AI assistant cannot respond right now.」 with no toolCalls, and logs the bridge error to stderr.
- Platform unreachable: results queue locally (bounded at 20) and retry with backoff; 404/409 responses (expired or reclaimed jobs) are dropped instead of retried.

## Tests

```bash
python -m pytest tests -q
```

Tests use `FakeAgentBridge` and a tiny Python echo script; they never call the Codex CLI or the network.

## systemd

```bash
sudo install -D -m 0644 systemd/fourwall-twin-agent.service /etc/systemd/system/fourwall-twin-agent.service
sudo systemctl daemon-reload
sudo systemctl enable --now fourwall-twin-agent
sudo journalctl -u fourwall-twin-agent -n 100 --no-pager
```

Store secrets in `/etc/fourwall/twin-agent.env` (`TWIN_AGENT_ENABLED`, `TWIN_AGENT_API_BASE_URL`, `TWIN_AGENT_WORKER_TOKEN`). On Windows, use Task Scheduler to run the same `-m agent_worker.main --config <abs path>` entrypoint with the venv interpreter.

## User systemd on a GPU host

When the worker runs under a normal Linux user without sudo, use
`systemd/fourwall-twin-agent.user.service`. It uses systemd user lingering, so
the worker survives logout and starts again after a host reboot.

Install a current Codex CLI under that user's home directory, then install the
unit. The service stores only the worker settings in
`~/.config/fourwall/twin-agent.env`; keep `TWIN_AGENT_WORKER_TOKEN` there with
mode `0600` and do not put it in the unit file.

```bash
PATH="$HOME/.local/opt/node-v22/bin:$PATH" \
  npm install --prefix "$HOME/.local/codex-cli" @openai/codex@latest

mkdir -p ~/.config/systemd/user ~/.config/fourwall
cp systemd/fourwall-twin-agent.user.service ~/.config/systemd/user/fourwall-twin-agent.service
chmod 600 ~/.config/fourwall/twin-agent.env
loginctl enable-linger "$USER"
systemctl --user daemon-reload
systemctl --user enable --now fourwall-twin-agent
systemctl --user status fourwall-twin-agent --no-pager
```

The unit explicitly selects the user-local Codex CLI and Node 22 paths so a
system-wide, older Node.js cannot break the worker after reboot. If the host
uses a different Node 22 location, update only `CODEX_NODE` in the user unit.
