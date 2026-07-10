# Twin Agent Demo Runbook (StarFab SEA Pitch)

Companion to `docs/twin-agent-demo-gap-analysis.md`. This is the operator runbook for the booth.

## What It Is

Two natural-language surfaces read and control the simulated 4WALL Demo Factory:

- The `/demo-factory` chat panel on the management platform.
- The bound LINE group on the operator's phone. Demo questions must begin with
  `展示工廠：`; ordinary questions stay on the group's Jingcheng live scope.

planner-server only relays jobs and world snapshots in memory. The LLM worker runs as the
`fourwall-twin-agent` user service on the NCKU 3090 host, via
`planner-server/deploy/twin-agent-worker/`.

```text
demo factory -> accelerator_demo snapshot                               [internal web auth]
LINE `展示工廠：...` -> fresh demo session -> job queue
3090 worker -> /v1/twin-agent/jobs + /jobs/{id}/result                  [worker bearer token]
```

## One-Time Setup

1. Render environment (dashboard, `four-wall-api` service; staging first if desired):
   - `TWIN_AGENT_ENABLED=true`
   - `TWIN_AGENT_WORKER_TOKEN=<long random string>` (generate locally, e.g.
     `python -c "import secrets; print(secrets.token_urlsafe(32))"`)
   Both default to disabled/absent, so nothing changes until these are set.
2. 3090 worker: install `planner-server/deploy/twin-agent-worker/` as the
   `fourwall-twin-agent` user service. Set `TWIN_AGENT_API_BASE_URL`,
   `TWIN_AGENT_WORKER_TOKEN`, and `TWIN_AGENT_ENABLED=true` in its protected config.
3. OpenAI OAuth: the 3090 bridge uses its logged-in Codex CLI session. Verify that session before
   the presentation and confirm `systemctl --user is-active fourwall-twin-agent` returns `active`.
4. LINE: the demo group must have an active `LineGroupBinding` (existing
   `scripts/bind_line_group.py` flow). Existing commands (廠區圖/機台/儀表/異常) keep working;
   any other text in the bound group goes to the agent.

## Booth-Day Checklist

1. Projection computer: plugged in, sleep disabled, 1280 px or wider display, phone hotspot ready
   as backup network.
2. Confirm the 3090 `fourwall-twin-agent` service is active. Do not start the old laptop batch worker.
3. Open the management platform in one browser tab, log in with the internal operator account,
   and open `/demo-factory`. The chat header must show 「AI 代理在線」 within about 15 seconds.
4. Smoke the three paths:
   - Chat: `Send an AMR to the dock` -> AMR moves, reply arrives.
   - LINE: ask `展示工廠：現在 AMR 情況` -> a reply beginning with `模擬情境：`.
   - LINE command: `展示工廠：派一台 AMR 去出貨區` -> reply in group + demo AMR moves on screen.
   - Plain LINE: ask `現在 AMR 情況` -> Jingcheng live scope only, never demo data.
5. Between visitors: press 「重設目前情境」 in the simulation control panel.

Keep one `/demo-factory` tab open and visible. LINE refuses demo routing when its snapshot is stale.

## Degraded Modes (rehearse these)

- 3090 worker not running / OAuth expired: LINE replies
  「AI 助理暫時離線，請稍後再試 / AI assistant is temporarily offline…」; the chat panel chip
  shows 「本機規則模式」 and falls back to the local Chinese rule engine (小明在哪 / 派工 /
  查狀態 still demo fine). Sim, 3D, and camera snapshots are unaffected.
- Venue network down: switch the projection computer + phone to a hotspot; LINE and the platform recover on
  reconnect. The sim itself never stops.
- Flooding: per-group limit 6 messages/min (busy reply), max 3 queued LINE jobs per group,
  10 messages/min per twin session. Protects the operator's OpenAI quota.

## Security Properties

- No LLM keys or OAuth tokens on Render or in the repo; the bridge uses the laptop's Codex CLI
  login cache only. The child process env is scrubbed of a fixed deny-list of known LLM keys
  (`ANTHROPIC_API_KEY`, `AZURE_OPENAI_API_KEY`, `CODEX_API_KEY`, `GEMINI_API_KEY`,
  `GOOGLE_API_KEY`, `OPENAI_API_KEY`), every env var ending in `_API_KEY`, and
  `TWIN_AGENT_WORKER_TOKEN`.
- The demo page and `accelerator_demo` snapshots require platform admin/ops web sessions; worker endpoints require the
  dedicated bearer token (constant-time compare); everything else 401/503.
- Normal LINE questions select only `organization_live` snapshots for the bound organization.
  `web_only` internal simulations cannot enter the LINE live path.
- Demo LINE jobs carry the selected demo session but no Jingcheng organization ID, site slug,
  camera evidence, or production decision-ledger context.
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
