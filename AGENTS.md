# Repo Operating Rules

## Mission

This repo is for the production-ready beta of the Mini 4 Pro building route assistant.
Android owns the flight-critical runtime. The planner server is planning-only.

## Hard Rules

- Write docs and gap analysis before code when changing scope or architecture.
- Use sprint-scoped guard boundaries. Do not edit outside the active sprint boundary.
- Create a git checkpoint at the start of every sprint.
- Run review at the end of every sprint.
- If a bug, regression, or flaky test appears, investigate root cause before fixing it.
- Run a security pass before shipping backend or deploy changes.
- Do not put the server in the flight-critical loop.
- Do not use virtual stick for continuous corridor following.
- Keep demo mode. Add prod mode through interfaces and dependency wiring.
- Conservative behavior wins. Any uncertainty resolves to HOLD first.

## Architecture Decisions

- Main transit authority: waypoint mission / KMZ.
- Local correction authority: low-speed, short-duration virtual stick only.
- Mobile model scope: branch verify and landmark confirm only.
- Local avoider scope: `SLOW_DOWN`, `HOLD`, `NUDGE_LEFT`, `NUDGE_RIGHT`.
- No SLAM, no free-space planner, no server-issued stick commands.

## Sprint Boundaries

- Stage 0: `docs/`, `AGENTS.md`, `.codex/config.toml`, `.agents/skills/gstack/review/`
- Sprint 1: `android-app/`, `shared-schemas/`, `docs/`
- Sprint 2: `planner-server/`, `shared-schemas/`, `docs/`, CI/deploy config
- Sprint 3: Android data/domain/network, planner API, `shared-schemas/`, `docs/`
- Sprint 4: `android-app/`, `docs/`, minimal test support elsewhere only if required

## Release Gates

- Stage 0: docs complete, governance present, review assets unblocked.
- Sprint 1: demo mode still boots, prod flavor compiles, preflight gates are testable.
- Sprint 2: auth, persistence, artifacts, and CI are in place and security-reviewed.
- Sprint 3: offline-safe bundle lifecycle blocks unsafe takeoff and tolerates server loss.
- Sprint 4: simulator, failsafe UI, blackbox export, and field docs are complete.

## Review Focus

- Safety invariants and trust boundaries
- Reducer and state-machine correctness
- Auth and artifact protection
- Offline behavior and backlog handling
- Failsafe escalation and takeover clarity
