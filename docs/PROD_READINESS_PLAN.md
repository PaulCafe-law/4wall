# Production-Ready Beta Plan

## Beta Definition

Production-ready beta means:

- Android can run in `demo` and `prod` mode without interface drift.
- Prod mode can initialize DJI MSDK, evaluate preflight policy, load verified mission artifacts, and execute the bounded mission flow.
- Planner server can authenticate operators, persist missions and flight data, generate artifacts, and serve them through authenticated endpoints.
- Android remains safe when the server is unavailable during flight.
- Failsafe and operator takeover paths are explicit, test-covered, and documented.
- Internal deployment and rollback steps are repeatable.

It does not mean:

- app-store distribution
- autonomous free-space navigation
- SLAM
- server-side flight control
- hardware validation already complete on every field condition

## Release Gates

### Stage 0

- Governance files exist.
- Gap matrix and product-grade docs are complete.
- Repo-local review assets exist so review can run.

### Sprint 1

- `demo` and `prod` flavors exist.
- Fake mode still boots.
- Prod mode compiles with real DJI adapter wiring.
- Preflight policy is reducer-backed and tested.
- Smoke tests cover real adapter boundaries and simulator harness.

### Sprint 2

- Auth is live.
- Persistence is durable.
- Artifact generation has checksum and version fields.
- API integration tests pass.
- Security review has no high-severity open issues.

### Sprint 3

- Auth/login, bundle download, checksum validation, local cache, rollback, and upload backlog are integrated.
- TAKEOFF is impossible without validated `mission.kmz` and `mission_meta.json`.
- Flight continues safely with in-flight server outage.

### Sprint 4

- Failsafe states are operator-readable and simulator-tested.
- Blackbox export exists.
- Field and emergency procedures are documented.
- Review finds no blocking state-machine or safety issues.

### Release

- Documentation synchronized with shipped behavior.
- Deploy path configured.
- Canary path defined for a real service URL.

## Rollback Rules

- Any artifact validation anomaly blocks takeoff and forces operator back to Mission Setup / Preflight.
- Any unverified virtual stick behavior is disabled in prod mode.
- Any blocker in MSDK activation, fly-safe, or device health holds the mission at preflight.
- Any backend auth or storage regression blocks deployment until fixed.

## Sprint Order

1. Governance, docs, review assets
2. Android real DJI integration
3. Backend productization
4. Android-server integration
5. Failsafe, simulator, field-readiness UI and docs
6. Release and deploy setup

## Non-Scope

- Server-issued stick commands
- Full autonomy beyond road-network corridor following
- Multi-operator fleet management
- Post-flight analytics portal
