# Twin Agent Demo Runbook (StarFab SEA Pitch)

Companion to `docs/twin-agent-demo-gap-analysis.md`. This is the operator runbook for the booth.

## What It Is

The authenticated `/demo-factory` chat panel on the management platform reads and
controls the simulated 4WALL Demo Factory. LINE is not a Twin Agent surface.

planner-server only relays jobs and world snapshots in memory. The LLM worker runs as the
`fourwall-twin-agent` user service on the NCKU 3090 host, via
`planner-server/deploy/twin-agent-worker/`.

```text
demo factory -> accelerator_demo snapshot -> job queue                  [internal web auth]
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

## Booth-Day Checklist

1. Projection computer: plugged in, sleep disabled, 1280 px or wider display, phone hotspot ready
   as backup network.
2. Confirm the 3090 `fourwall-twin-agent` service is active. Do not start the old laptop batch worker.
3. Open the management platform in one browser tab, log in with the internal operator account,
   and open `/demo-factory`. The chat header must show 「AI 代理在線」 within about 15 seconds.
4. Smoke the protected web path:
   - Chat: `Send an AMR to the dock` -> AMR moves, reply arrives.
   - Security regression: LINE input such as `展示工廠：派一台 AMR 去出貨區` returns only a deterministic supported-intent/help response and creates no Twin Agent job.
5. Between visitors: press 「重設目前情境」 in the simulation control panel.

Keep one `/demo-factory` tab open and visible while presenting the web demo.

## Degraded Modes (rehearse these)

- 3090 worker not running / OAuth expired: the chat panel chip shows 「本機規則模式」 and falls back to the local Chinese rule engine (小明在哪 / 派工 / 查狀態 still demo fine). Sim, 3D, and camera snapshots are unaffected.
- Venue network down: switch the projection computer to a hotspot; the platform recovers on reconnect. The sim itself never stops.
- Flooding: the twin web session rate limit protects the operator's OpenAI quota. LINE never consumes that quota.

## Security Properties

- No LLM keys or OAuth tokens on Render or in the repo; the bridge uses the laptop's Codex CLI
  login cache only. The child process env is scrubbed of a fixed deny-list of known LLM keys
  (`ANTHROPIC_API_KEY`, `AZURE_OPENAI_API_KEY`, `CODEX_API_KEY`, `GEMINI_API_KEY`,
  `GOOGLE_API_KEY`, `OPENAI_API_KEY`), every env var ending in `_API_KEY`, and
  `TWIN_AGENT_WORKER_TOKEN`.
- The demo page and `accelerator_demo` snapshots require platform admin/ops web sessions; worker endpoints require the
  dedicated bearer token (constant-time compare); everything else 401/503.
- External LINE text never creates Twin Agent jobs or selects `organization_live`,
  `web_only`, or `accelerator_demo` snapshots.
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
