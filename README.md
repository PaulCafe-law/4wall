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

## Codex Authentication

This project uses Codex with ChatGPT OAuth, not an OpenAI API key.

```powershell
codex login
```

Do not add `OPENAI_API_KEY` to project `.env` files. See [codex-auth.md](docs/codex-auth.md).

## Runtime Providers

Industrial Data Engine production runtime uses Gemini, World Labs / Marble, Ollama Qwen-VL, gsplat, Boxer, and optional EGO-Planner. It does not use the OpenAI API. See [industrial-data-engine.md](docs/industrial-data-engine.md).

## Release Paths

- Deploy topology source of truth: [render.yaml](render.yaml)
- Deploy and rollback procedure: [web-beta-release-runbook.md](docs/web-beta-release-runbook.md)
- Staging/prod topology contract: [deploy-topology.md](docs/deploy-topology.md)

## Key Docs

- [architecture-building-route-assistant.md](docs/architecture-building-route-assistant.md)
- [api-spec.md](docs/api-spec.md)
- [codex-auth.md](docs/codex-auth.md)
- [industrial-data-engine.md](docs/industrial-data-engine.md)
- [line-safe-natural-language-and-rich-menu.md](docs/line-safe-natural-language-and-rich-menu.md)
- [PROD_READINESS_PLAN.md](docs/PROD_READINESS_PLAN.md)
- [web-beta-scope.md](docs/web-beta-scope.md)
- [web-threat-model.md](docs/web-threat-model.md)
- [deploy-topology.md](docs/deploy-topology.md)
