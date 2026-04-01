# Sprint 2 Plan: Planner Server

## Goal

Stand up a planner server skeleton that produces a mission bundle boundary the Android app can consume.

## Scope

- Bootstrap `planner-server/` if absent
- Define mission planning API
- Add route provider abstraction with OSM/OSRM and mock providers
- Add corridor generator outputs
- Add mission KMZ generator abstraction
- Add DTO and planner tests

## Deliverables

- FastAPI app skeleton
- `/v1/missions/plan`
- mission artifact endpoints
- flight event and telemetry endpoints
- DTO validation and tests

## Acceptance

- API docs match `docs/api-spec.md`
- Mission bundle schema aligns with Android parser contract
- Tests cover DTO validation and planner behavior

## Risks

- OSM/OSRM integration details may shift, so provider abstraction must be clean
- KMZ format may need later hardware validation

## Not In Scope

- Production auth hardening
- Full route editor UI
- In-flight control callbacks from server
