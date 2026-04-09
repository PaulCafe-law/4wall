# Beta Deploy Topology

## Goal

Ship a launch-ready beta with one deploy platform, predictable domains, and explicit smoke checks for both API and web surfaces.

## Current State

- `planner-server` already has a Render web service definition in `planner-server/render.yaml`.
- API health check path is `/healthz`.
- GitHub Actions currently test only `planner-server` via `.github/workflows/planner-server.yml`.
- No web app deploy path exists yet.

## Target Topology

```text
staging-app.<domain>  -> Render Static Site  -> web-app build
app.<domain>          -> Render Static Site  -> web-app build

staging-api.<domain>  -> Render Web Service  -> planner-server
api.<domain>          -> Render Web Service  -> planner-server

planner-server        -> Render Managed Postgres
planner-server        -> S3-compatible private artifact bucket
```

## Platform Choices

- API: Render Web Service
- Web: Render Static Site
- Database: Render managed Postgres
- Artifact storage: S3-compatible private bucket
- DNS shape:
  - `staging-app.<domain>`
  - `app.<domain>`
  - `staging-api.<domain>`
  - `api.<domain>`

Using Render for both surfaces keeps beta operations on one platform and avoids split deploy logic.

## Environment Contract

### Shared

- `BUILDING_ROUTE_ENVIRONMENT`
- `BUILDING_ROUTE_AUTH_SECRET_KEY`
- `BUILDING_ROUTE_DATABASE_URL`
- `BUILDING_ROUTE_ARTIFACT_BACKEND`
- `BUILDING_ROUTE_ARTIFACT_BUCKET`
- `BUILDING_ROUTE_APP_ORIGIN`
- `BUILDING_ROUTE_API_ORIGIN`

### API Only

- `BUILDING_ROUTE_ROUTE_PROVIDER`
- `BUILDING_ROUTE_BOOTSTRAP_OPERATOR_ENABLED=false` in staging and production
- cookie/session settings for `fw_refresh`

### Web Only

- `VITE_API_BASE_URL`
- `VITE_APP_ENVIRONMENT`
- `VITE_SENTRY_DSN` if enabled later

## Health Checks

### API

- primary health check: `GET /healthz`
- response must be `2xx` or `3xx`
- production and staging should also verify database connectivity inside the health endpoint over time

### Web

- smoke check 1: login route loads
- smoke check 2: authenticated mission list route renders after login

Render health checks apply directly to the API web service. Web checks can run as post-deploy smoke tests.

## Canary and Smoke Flow

1. Deploy staging API.
2. Verify `staging-api.<domain>/healthz`.
3. Deploy staging web app.
4. Run smoke checks:
   - login page loads
   - session refresh works
   - mission list route renders for a seeded test org
5. Promote or merge to production.
6. Repeat the same checks on `api.<domain>` and `app.<domain>`.

## Rollback Rules

- Any failed API health check blocks promotion.
- Any org-isolation or auth smoke failure blocks promotion.
- Any artifact download auth regression blocks promotion.
- Web regressions roll back independently from Android work and must never require Android changes to restore service.

## CI Notes

Current workflow coverage is backend-only. Beta target requires:

- planner-server tests
- web-app build and tests
- API and web smoke checks before marking deploy healthy

These CI changes belong to implementation sprints, not Stage 0, but the topology is fixed here so later work does not guess.
