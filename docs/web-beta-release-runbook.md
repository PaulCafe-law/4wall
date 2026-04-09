# Web Beta Release Runbook

## Scope

This runbook covers the Web Beta RC release path for:

- `planner-server`
- `web-app`
- Render staging and production services defined in the repo-root `render.yaml`

It does not cover Android field readiness or Sprint 4 hardware validation.

## Required Inputs

### Render Services

- `four-wall-api-staging`
- `four-wall-web-staging`
- `four-wall-api`
- `four-wall-web`

### Required Config

- API envs:
  - `BUILDING_ROUTE_DATABASE_URL`
  - `BUILDING_ROUTE_AUTH_SECRET_KEY`
  - `BUILDING_ROUTE_APP_ORIGIN`
  - `BUILDING_ROUTE_ARTIFACT_BACKEND`
  - `BUILDING_ROUTE_S3_BUCKET`
  - `BUILDING_ROUTE_S3_ENDPOINT_URL`
  - `BUILDING_ROUTE_S3_REGION`
  - `BUILDING_ROUTE_S3_ACCESS_KEY_ID`
  - `BUILDING_ROUTE_S3_SECRET_ACCESS_KEY`
- Web envs:
  - `VITE_API_BASE_URL`
  - `VITE_APP_ENVIRONMENT`
- Smoke envs:
  - `BETA_API_BASE_URL`
  - `BETA_WEB_LOGIN_URL`
  - `BETA_APP_ORIGIN`
  - `BETA_WEB_SMOKE_EMAIL`
  - `BETA_WEB_SMOKE_PASSWORD`

## Staging Deploy

1. Confirm CI is green for `planner-server` and `web-app`.
2. Apply the repo-root `render.yaml` blueprint if service shape changed.
3. Deploy `four-wall-api-staging`.
4. Wait for `/healthz` to return `200` with `"database": {"status": "ok"}`.
5. Deploy `four-wall-web-staging`.
6. Run `.github/workflows/smoke-beta.yml` against staging.

## Promotion to Production

1. Confirm staging smoke passed.
2. Promote the same revision to `four-wall-api`.
3. Wait for production `/healthz` to return `200`.
4. Promote the same revision to `four-wall-web`.
5. Re-run `.github/workflows/smoke-beta.yml` against production values.

## Rollback Triggers

Rollback immediately if any of these occur:

- `/healthz` returns `503`
- web session login or refresh fails
- authenticated mission list smoke fails
- artifact download smoke fails
- org-isolation or auth regression is detected after deploy

## Rollback Path

1. Open the affected Render service.
2. Go to `Deploys`.
3. Select the last healthy deploy.
4. Redeploy that version.
5. Re-run API health and beta smoke before declaring recovery complete.

## Evidence to Keep

- the commit SHA deployed
- staging smoke run URL
- production smoke run URL
- Render deploy IDs for staging and production
- any rollback event and the reason it was triggered
