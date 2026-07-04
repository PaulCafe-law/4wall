# Twin Agent Demo (StarFab SEA Pitch) Gap Analysis

## Sprint Boundary

This change stays inside the Sprint 3/4 shared boundary: `planner-server/`, `web-app/`, and `docs/`.
Android, flight-control logic, Pi capture, the HMI OCR worker, and the person-presence worker are out of scope.
Existing LINE floorplan commands, rich menu flows, and imagemap rendering must remain byte-identical.

## Checkpoint Exception

The worktree was already dirty before this sprint (HMI OCR, person presence, LINE floorplan, video
production assets). A normal sprint git checkpoint would mix unrelated user work into this sprint,
so the checkpoint is recorded here instead of a commit.

- Branch: `codex/hc600-hmi-ocr-gpt-summary`
- HEAD: `891f320`
- Rule for this implementation: do not stage, commit, revert, delete, or overwrite unrelated existing changes.

## Goal

Booth demo for the StarFab Southeast Asia pitch. Two natural-language surfaces drive the existing
simulated Factory Twin (with the real Jingcheng camera snapshots kept on screen, approved by the
customer):

1. The desktop management platform: visitors type free-form commands in the Factory Twin chat panel
   ("send someone to fix machine 3", "AMR 去出貨口") and the 3D scene reacts.
2. A LINE group on the operator's phone: visitors ask questions and issue commands; answers return to
   LINE while commands also animate on the booth screen.

## Architecture Decision

The sim stays in the booth browser. planner-server (Render) gains a thin relay: an in-memory job
queue, a world-snapshot slot, and a command queue. It runs no LLM and stores no LLM credentials.
A laptop worker (`planner-server/deploy/twin-agent-worker/`) polls jobs over outbound HTTPS, calls
OpenAI through the operator's personal OAuth command bridge (same `account_oauth_dev` pattern as the
HMI OCR GPT summarizer), and posts back `{text, toolCalls}`. The browser polls for replies and
executes toolCalls through the existing frontend action layer.

```text
browser twin (sim host) -> POST snapshot / POST messages / GET updates -> planner-server relay
LINE group -> webhook unmatched bound-group text -> job queue
laptop worker -> GET jobs (+snapshot) -> local OAuth LLM -> POST result {text, toolCalls}
relay -> web: updates feed; LINE: replyToken or push; toolCalls -> active twin session
```

## Red Lines

- No LLM API keys, OAuth tokens, or auth caches on Render, in the repo, or in the web app.
- The relay endpoints for the browser require the existing web session auth; the worker endpoints
  require a dedicated bearer token compared in constant time. No unauthenticated routes.
- Existing LINE deterministic behavior is untouched; the NL path only handles bound-group text that
  matches no existing command. Unbound groups keep the existing refusal reply.
- Agent tool calls mutate the simulation only. No real-machine control, no flight paths, no
  planner-server data mutations from LLM output.
- Rate limits on both surfaces (per LINE group and per twin session) so booth visitors cannot drain
  the operator's OpenAI quota or flood the queue.
- Conservative failure behavior: worker offline or LLM auth expired degrades to a canned LINE reply
  and the existing local rule-based chat fallback; the sim and camera views never depend on the agent.

## Implementation Gap

- planner-server has no twin-agent relay: needs job queue + snapshot slot + command queue (in-memory,
  matching the LINE floorplan cache precedent), four web-session endpoints, two worker endpoints,
  lazy expiry with canned replies, and the LINE webhook fallthrough.
- The frontend chat panel is a local keyword rule engine; the backend-LLM protocol
  (`ChatResult.toolCalls`) is defined in `mirror/api/types.ts` but nothing serves it. Needs snapshot
  push, updates polling, toolCall execution with ack, worker-online badge, and rule-engine fallback.
- The action layer lacks AMR dispatch, machine state override, and demo incident triggers; the sim
  lifecycles support all three but no action wraps them.
- No worker exists for LLM jobs; the OCR summarizer bridge pattern must be generalized to a
  chat+tools bridge with tests that use a fake bridge.
- Booth operations: one-click sim reset to a scripted state, idle auto-reset, worker start script,
  and a rehearsal runbook (including degraded-mode talk track).

## Acceptance

- `cd planner-server && python -m pytest tests -q` green, including new relay tests: auth matrix
  (web session / worker token / anonymous), job lifecycle with expiry and canned LINE replies,
  replyToken-vs-push routing, rate limits, snapshot size cap, and unchanged existing LINE tests.
- `cd planner-server/deploy/twin-agent-worker && python -m pytest tests -q` green with a fake bridge.
- `cd web-app && npm run test -- --run` and `npm run build` green.
- Manual demo path: chat command moves an AMR on screen; a LINE message in the bound group returns
  an answer and animates the same scene; killing the worker degrades both surfaces gracefully.
