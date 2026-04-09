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
