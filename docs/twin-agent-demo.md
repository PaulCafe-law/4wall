# Twin Agent Demo Runbook (StarFab SEA Pitch)

Companion to `docs/twin-agent-demo-gap-analysis.md`. This is the operator runbook for the booth.

## What It Is

Two natural-language surfaces drive the simulated Factory Twin on the booth laptop:

- The Factory Twin chat panel on the management platform (any language; commands and questions).
- The bound LINE duty group on the operator's phone (questions answered in-chat; commands also
  animate on the booth screen).

planner-server only relays jobs and world snapshots in memory. The LLM runs on the booth laptop
through the operator's personal OpenAI OAuth (Codex CLI), via
`planner-server/deploy/twin-agent-worker/`.

```text
browser twin (sim host) <-> /v1/twin-agent/{snapshot,messages,updates}   [web session auth]
LINE bound group -> webhook unmatched text -> job queue
laptop worker -> /v1/twin-agent/jobs + /jobs/{id}/result                 [worker bearer token]
```

## One-Time Setup

1. Render environment (dashboard, `four-wall-api` service; staging first if desired):
   - `TWIN_AGENT_ENABLED=true`
   - `TWIN_AGENT_WORKER_TOKEN=<long random string>` (generate locally, e.g.
     `python -c "import secrets; print(secrets.token_urlsafe(32))"`)
   Both default to disabled/absent, so nothing changes until these are set.
2. Booth laptop worker:
   ```powershell
   cd "planner-server\deploy\twin-agent-worker"
   .\install.ps1
   Copy-Item config.example.yaml config.yaml   # if install.ps1 did not already
   ```
   Set in `config.yaml` or env: `TWIN_AGENT_API_BASE_URL=https://<api-origin>`,
   `TWIN_AGENT_WORKER_TOKEN=<same token>`, `TWIN_AGENT_ENABLED=true`.
3. OpenAI OAuth: the bridge shells out to the locally logged-in Codex CLI
   (`scripts/openai_oauth_bridge.py`; resolution order `CODEX_CLI` env -> `codex` on PATH ->
   legacy home path). Verify login the day before: `codex exec "say ok"`.
4. LINE: the demo group must have an active `LineGroupBinding` (existing
   `scripts/bind_line_group.py` flow). Existing commands (廠區圖/機台/儀表/異常) keep working;
   any other text in the bound group goes to the agent.

## Booth-Day Checklist

1. Laptop: plugged in, sleep disabled, phone hotspot ready as backup network.
2. Start the worker (publishing is on by default; `--dry-run` would disable it):
   ```powershell
   cd "planner-server\deploy\twin-agent-worker"
   $env:TWIN_AGENT_ENABLED = "true"   # unless config.yaml already sets platform.enabled: true
   .\.venv\Scripts\python.exe -m agent_worker.main --config config.yaml
   ```
3. Open the management platform in ONE browser tab, log in with the operator (platform admin)
   account, open Factory Twin. The chat header chip must show 「AI 代理在線」 within ~15 s.
4. Smoke the three paths:
   - Chat: `Send an AMR to the dock` -> AMR moves, reply arrives.
   - LINE: ask 「現在幾台機台在運轉？」 in the demo group -> answer in group.
   - LINE command: `dispatch an AMR to zone-a` -> reply in group + AMR moves on screen.
5. Between visitors: press 「重置演示」 in the sim control panel.

Keep exactly one twin tab open: commands route to the most recent snapshot session.

## Degraded Modes (rehearse these)

- Worker not running / OAuth expired: LINE replies
  「AI 助理暫時離線，請稍後再試 / AI assistant is temporarily offline…」; the chat panel chip
  shows 「本機規則模式」 and falls back to the local Chinese rule engine (小明在哪 / 派工 /
  查狀態 still demo fine). Sim, 3D, and camera snapshots are unaffected.
- Venue network down: switch laptop + phone to hotspot; LINE and the platform recover on
  reconnect. The sim itself never stops.
- Flooding: per-group limit 6 messages/min (busy reply), max 3 queued LINE jobs per group,
  10 messages/min per twin session. Protects the operator's OpenAI quota.

## Security Properties

- No LLM keys or OAuth tokens on Render or in the repo; the bridge uses the laptop's Codex CLI
  login cache only. The child process env is scrubbed of a fixed deny-list of known LLM keys
  (`ANTHROPIC_API_KEY`, `AZURE_OPENAI_API_KEY`, `CODEX_API_KEY`, `GEMINI_API_KEY`,
  `GOOGLE_API_KEY`, `OPENAI_API_KEY`), every env var ending in `_API_KEY`, and
  `TWIN_AGENT_WORKER_TOKEN`.
- Browser endpoints require platform admin/ops web session; worker endpoints require the
  dedicated bearer token (constant-time compare); everything else 401/503.
- Agent tool calls mutate the browser-side simulation only — machines, AMR, people in the sim.
  No planner-server data, no real devices, no flight paths.
- `TWIN_AGENT_ENABLED=false` (default) restores pre-feature behavior byte-for-byte.

## Verification

```bash
cd planner-server && python -m pytest tests -q
cd planner-server/deploy/twin-agent-worker && python -m pytest tests -q
cd web-app && npm run test -- --run && npm run build
```

Offline worker smoke (no network, no OpenAI):

```bash
cd planner-server/deploy/twin-agent-worker
python -m agent_worker.main --config config.example.yaml --input samples/job.json --once --dry-run --fake-agent
```
