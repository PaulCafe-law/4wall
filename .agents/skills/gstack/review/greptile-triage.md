# 4wall Greptile Triage

## High Severity

- Safety invariant broken
- TAKEOFF possible without validated mission bundle
- Server command path enters flight-critical control
- Virtual stick used for continuous corridor following
- Auth bypass on artifact download
- Secrets committed

## Medium Severity

- Missing retry/backoff or backlog persistence
- Reducer state mismatch with UI affordances
- Preflight blocker surfaced only in UI and not policy
- Simulator or fake mode drift from prod interfaces

## Low Severity

- Documentation drift
- Missing non-critical diagnostics
- Naming or package layout inconsistencies

## Known Acceptable Constraints

- Bench-only or simulator-only validation for hardware-dependent behaviors
- Mock or local providers in dev mode
- Render/Postgres/S3 path documented before full production deployment
