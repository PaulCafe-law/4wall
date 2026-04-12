# Beta Deploy Topology

## Goal

Ship a launch-ready beta with one deploy platform, predictable domains, and explicit smoke checks for both API and web surfaces.

## Current State

- Repo-root `render.yaml` is the Render blueprint source of truth for staging and production app/api services.
- API health check path is `/healthz`, and it now includes DB dependency status.
- GitHub Actions cover backend CI, web CI, and beta smoke in separate workflows.
- Web release smoke reuses `planner-server/scripts/smoke_test.py` in `web-beta` mode.
- Render staging and production services are expected to track `main` so deploy behavior follows the repo rather than a long-lived release branch.

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

### Shared API Inputs

- `BUILDING_ROUTE_ENVIRONMENT`
- `BUILDING_ROUTE_APP_ORIGIN`
- `BUILDING_ROUTE_AUTH_SECRET_KEY`
- `BUILDING_ROUTE_DATABASE_URL`
- `BUILDING_ROUTE_ARTIFACT_BACKEND`
- `BUILDING_ROUTE_S3_BUCKET`
- `BUILDING_ROUTE_S3_ENDPOINT_URL`
- `BUILDING_ROUTE_S3_REGION`
- `BUILDING_ROUTE_S3_ACCESS_KEY_ID`
- `BUILDING_ROUTE_S3_SECRET_ACCESS_KEY`

### API Only

- `BUILDING_ROUTE_ROUTE_PROVIDER`
- `BUILDING_ROUTE_BOOTSTRAP_OPERATOR_ENABLED=false` in staging and production
- cookie/session settings for `fw_refresh`

### Web Only

- `VITE_API_BASE_URL`
- `VITE_APP_ENVIRONMENT`
- `VITE_SENTRY_DSN` if enabled later

### Smoke Only

- `BETA_API_BASE_URL`
- `BETA_WEB_LOGIN_URL`
- `BETA_APP_ORIGIN`
- `BETA_WEB_SMOKE_EMAIL`
- `BETA_WEB_SMOKE_PASSWORD`

## Health Checks

### API

- primary health check: `GET /healthz`
- response must be `200` only when API and DB are healthy
- response must be `503` when DB connectivity fails
- response body includes dependency status so deploy failures are actionable

### Web

- smoke check 1: login route loads
- smoke check 2: authenticated mission list route renders after login

Render health checks apply directly to the API web service. Web checks can run as post-deploy smoke tests.

## Canary and Smoke Flow

1. Merge the intended release revision to `main`.
2. Wait for Render to auto-deploy staging and production after required GitHub checks pass.
3. Verify `staging-api.<domain>/healthz`.
4. Run smoke checks against staging:
   - login page loads
   - session refresh works with the configured app origin
   - mission list route renders for a seeded test org
   - artifact download succeeds from an existing seeded mission
5. Verify `api.<domain>/healthz` and `app.<domain>/login`.
6. Repeat the same checks on `api.<domain>` and `app.<domain>`.
7. Roll back immediately if production smoke fails.

## Rollback Rules

- Any failed API health check blocks release acceptance.
- Any org-isolation or auth smoke failure blocks release acceptance.
- Any artifact download auth regression blocks release acceptance.
- Web regressions roll back independently from Android work and must never require Android changes to restore service.

## Deploy Policy Tradeoff

- Production auto-deploy removes the previous manual promote gate between staging and production.
- The compensating control is green CI plus immediate post-deploy smoke on both staging and production.
- If that smoke becomes flaky or non-actionable, production auto-deploy should be reverted until the signal is trustworthy again.

## CI Notes

- `.github/workflows/planner-server.yml`
- `.github/workflows/web-app.yml`
- `.github/workflows/smoke-beta.yml`

The blueprint and workflows together now define the deploy contract in-repo.
