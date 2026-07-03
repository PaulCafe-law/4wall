# Repo Operating Rules

## Mission

This repo is for the production-ready beta of the Mini 4 Pro building route assistant.
Android owns the flight-critical runtime.
The planner server and desktop web app own planning, operations, and customer surfaces.

## Hard Rules

- `AGENTS.md` is the sole repo authority. `CLAUDE.md` is a tool-compatibility shim and must not introduce conflicting policy.
- Write docs and gap analysis before code when changing scope or architecture.
- Use sprint-scoped guard boundaries. Do not edit outside the active sprint boundary.
- Create a git checkpoint at the start of every sprint.
- Run review at the end of every sprint.
- If a bug, regression, or flaky test appears, investigate root cause before fixing it.
- Run a security pass before shipping backend or deploy changes.
- Do not put the server or desktop web app in the flight-critical loop.
- Do not use virtual stick for continuous corridor following.
- Keep demo mode. Add prod mode through interfaces and dependency wiring.
- Conservative behavior wins. Any uncertainty resolves to HOLD first.

## Architecture Decisions

- Main transit authority: waypoint mission / KMZ.
- Local correction authority: low-speed, short-duration virtual stick only.
- Mobile model scope: branch verify and landmark confirm only.
- Local avoider scope: `SLOW_DOWN`, `HOLD`, `NUDGE_LEFT`, `NUDGE_RIGHT`.
- Desktop web app scope: planning workspace, operations console, and customer portal only.
- No SLAM, no free-space planner, no server-issued stick commands.

## Sprint Boundaries

- Stage 0: `docs/`, `AGENTS.md`, `CLAUDE.md`, `DESIGN.md`, `TODOS.md`, `.codex/config.toml`, `.agents/skills/gstack/review/`
- Sprint 1: `android-app/`, `shared-schemas/`, `docs/`
- Sprint 2: `planner-server/`, `web-app/`, `shared-schemas/`, `docs/`, CI/deploy config
- Sprint 3: `planner-server/`, `web-app/`, `shared-schemas/`, `docs/`
- Sprint 4: `android-app/`, `planner-server/`, `web-app/`, `docs/`, minimal test support elsewhere only if required

## Release Gates

- Stage 0: docs complete, governance present, design system present, review assets unblocked.
- Sprint 1: demo mode still boots, prod flavor compiles, preflight gates are testable.
- Sprint 2: auth, persistence, artifacts, tenancy foundation, and CI are in place and security-reviewed.
- Sprint 3: invite-only desktop web app supports missions, artifacts, billing, and audit flows in staging without changing Android safety boundaries.
- Sprint 4: simulator, failsafe UI, blackbox export, field docs, and launch-readiness verification are complete.

## Review Focus

- Safety invariants and trust boundaries
- Reducer and state-machine correctness
- Auth, tenancy, invite, and artifact protection
- Offline behavior and backlog handling
- Auditability, billing mutation controls, and deploy safety
- Failsafe escalation and takeover clarity

## Skill Routing

When the user's request matches an available skill, invoke it first instead of improvising.

Key routing rules:

- Product ideas or scope changes: `office-hours`
- Bugs, regressions, flaky tests, or unexpected behavior: `investigate`
- Ship, deploy, push, create PR: `ship`
- QA or bug sweeps: `qa`
- Code review or diff review: `review`
- Documentation sync after shipping: `document-release`
- Design system work: `design-consultation`
- Design critique before implementation: `plan-design-review`
- Architecture and execution review: `plan-eng-review`
- Deploy setup and rollout config: `setup-deploy`
- Security review before backend or deploy changes ship: `cso`

## Design Pointer

- Read `DESIGN.md` before making UI decisions.
- `DESIGN.md` owns typography, color, spacing, layout, and interaction tone.
- Do not restate or fork design policy here.

## Deploy Configuration

- Platform: Render
- Production URL: `https://app.<domain>` and `https://api.<domain>`
- Staging URL: `https://staging-app.<domain>` and `https://staging-api.<domain>`
- Deploy workflow: Render auto-deploy after CI passes
- Deploy status command: `TBD by /setup-deploy`
- Merge method: squash
- Project type: Android app + planner API + desktop web app
- Post-deploy health check: `GET /healthz` on API, login + mission list smoke checks on web
- Pre-merge: backend tests, web build/tests, org-isolation checks, artifact auth checks
- Deploy trigger: automatic on push to the production branch
- Deploy status: poll Render service status and production endpoints
- Health check: `https://api.<domain>/healthz`
