# Production-Ready Beta Plan

## Beta Definition

Production-ready beta means:

- Android can run in `demo` and `prod` mode without interface drift.
- Prod mode can initialize DJI MSDK, evaluate preflight policy, load verified mission artifacts, and execute the bounded mission flow.
- Planner server can authenticate users, enforce org/site tenancy, persist missions and flight data, generate artifacts, and serve them through authenticated endpoints.
- A desktop-first web app can support invite-only internal and customer workflows for sites, mission requests, mission status, artifact downloads, and manual invoices.
- Android remains safe when the server or desktop web app is unavailable during flight.
- Failsafe and operator takeover paths are explicit, test-covered, and documented.
- Internal deployment, smoke test, rollback, and canary steps are repeatable.

It does not mean:

- app-store distribution
- PC native desktop packaging
- open self-serve signup
- hosted online checkout as a release gate
- post-flight analytics portal
- autonomous free-space navigation
- SLAM
- server-side flight control
- hardware validation already complete on every field condition

## Release Gates

### Stage 0

- Governance files exist.
- Gap matrix, web scope, deploy topology, and threat model docs are complete.
- `AGENTS.md` is the sole repo authority.
- `CLAUDE.md` exists as a tool-compat shim, and `DESIGN.md` and `TODOS.md` exist as active project files.
- Repo-local review assets exist so review can run.

### Sprint 1

- `demo` and `prod` flavors exist.
- Fake mode still boots.
- Prod mode compiles with real DJI adapter wiring.
- Preflight policy is reducer-backed and tested.
- Smoke tests cover real adapter boundaries and simulator harness.

### Sprint 2

- Auth is live.
- Org, membership, and invite foundations exist.
- Persistence is durable.
- Artifact generation has checksum and version fields.
- API integration tests pass.
- Security review has no high-severity open issues.

### Sprint 3

- Desktop web app supports invite-only login, role-aware navigation, site CRUD, mission list/detail, artifact panel, and manual invoice views.
- Internal ops can create orgs, invite customers, inspect audit logs, and update invoice status.
- Auth/login, bundle download, checksum validation, local cache, rollback, and upload backlog are integrated.
- TAKEOFF is impossible without validated `mission.kmz` and `mission_meta.json`.
- Flight continues safely with in-flight server outage.

### Sprint 4

- Failsafe states are operator-readable and simulator-tested.
- Blackbox export exists.
- Field and emergency procedures are documented.
- Review finds no blocking state-machine, tenancy, or safety issues.

### Release

- Documentation synchronized with shipped behavior.
- Staging and production app/api paths are configured.
- Manual invoice workflow is operator-usable.
- Deploy path is configured for web and API.
- Canary path is defined for real app and API URLs.
- Security pass has no blocking findings on auth, tenancy, invite, or artifact delivery.

## Rollback Rules

- Any auth, invite, or org-isolation regression blocks deployment until fixed.
- Any artifact validation anomaly blocks takeoff and forces operator back to Mission Setup / Preflight.
- Any unverified virtual stick behavior is disabled in prod mode.
- Any blocker in MSDK activation, fly-safe, or device health holds the mission at preflight.
- Any backend auth or storage regression blocks deployment until fixed.
- Any web-app regression must fail closed on protected data and must not alter Android safety behavior.

## Sprint Order

1. Governance, docs, design system, and review assets
2. Backend and tenancy foundation
3. Desktop web app beta surfaces
4. Android-server integration and field readiness
5. Release, deploy hardening, and security review

## Non-Scope

- Server-issued stick commands
- PC native app
- Open self-serve signup
- Hosted online checkout as the beta launch gate
- Post-flight analytics portal
- Full autonomy beyond road-network corridor following
- Multi-operator fleet management
