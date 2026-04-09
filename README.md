# Building Route Assistant

Mini 4 Pro production-ready beta repo with three runtime boundaries:

- `android-app/`: flight-critical operator app
- `planner-server/`: planning, tenancy, artifact, billing, and ingest API
- `web-app/`: desktop-first invite-only operations and customer console

## Safety Position

- Android owns the flight-critical loop.
- The planner server and web app never issue real-time flight control.
- Mission artifacts and web surfaces must fail closed.
- Uncertainty resolves to `HOLD`.

## Current Status

- Stage 0 governance and web beta scope docs are in place.
- `planner-server` now includes web auth, tenancy, billing, audit, and DB-aware health checks.
- `web-app` provides invite/login, sites, missions, planner, billing, org admin, and audit views.
- Android Sprint 4 work exists separately and is not part of the Web Beta RC release gate.

## Repo Layout

```text
docs/
  scope, architecture, deploy topology, threat model, release runbook

android-app/
  flight-critical Android runtime

planner-server/
  FastAPI planner and operations backend

web-app/
  React/Vite desktop beta console

render.yaml
  Render blueprint for staging/prod app + api services
```

## Verification Commands

Planner server:

```powershell
Set-Location .\planner-server
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m pytest tests -q
```

Web app:

```powershell
Set-Location .\web-app
npm ci
npm run lint
npm run test
npm run build
```

## Release Paths

- Deploy topology source of truth: [render.yaml](/D:/The%20Fourth%20Wall%20AI/codebase/render.yaml)
- Deploy and rollback procedure: [web-beta-release-runbook.md](/D:/The%20Fourth%20Wall%20AI/codebase/docs/web-beta-release-runbook.md)
- Staging/prod topology contract: [deploy-topology.md](/D:/The%20Fourth%20Wall%20AI/codebase/docs/deploy-topology.md)

## Key Docs

- [architecture-building-route-assistant.md](/D:/The%20Fourth%20Wall%20AI/codebase/docs/architecture-building-route-assistant.md)
- [api-spec.md](/D:/The%20Fourth%20Wall%20AI/codebase/docs/api-spec.md)
- [PROD_READINESS_PLAN.md](/D:/The%20Fourth%20Wall%20AI/codebase/docs/PROD_READINESS_PLAN.md)
- [web-beta-scope.md](/D:/The%20Fourth%20Wall%20AI/codebase/docs/web-beta-scope.md)
- [web-threat-model.md](/D:/The%20Fourth%20Wall%20AI/codebase/docs/web-threat-model.md)
- [deploy-topology.md](/D:/The%20Fourth%20Wall%20AI/codebase/docs/deploy-topology.md)
