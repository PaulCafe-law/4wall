# Web Beta Release Runbook

## Scope

This runbook covers the Web Beta RC release path for:

- `planner-server`
- `web-app`
- Render staging and production services defined in the repo-root `render.yaml`

It does not cover Android field readiness or Sprint 4 hardware validation.
It also does not own Android implementation details for live monitoring; Android is treated here as an upstream contract dependency only.

## Required Inputs

Reference these docs before shipping any `live-ops` or `support` change:

- `docs/WEB_THREAD_ANDROID_HANDOFF.md`
- `docs/WEB_THREAD_FAIL_CLOSED_BEHAVIOR.md`

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
2. If the release touches `live-ops` or `support`, confirm the expected Android event contract is unchanged or already available. If not, the web surface must stay in placeholder or monitor-only state.
3. Apply the repo-root `render.yaml` blueprint if service shape changed.
4. Deploy `four-wall-api-staging`.
5. Wait for `/healthz` to return `200` with `"database": {"status": "ok"}`.
6. Deploy `four-wall-web-staging`.
7. Run `.github/workflows/smoke-beta.yml` against staging.
8. If LINE floorplan is enabled for the release, run:

   ```bash
   cd planner-server
   BUILDING_ROUTE_AUTH_SECRET_KEY=<same-secret-as-staging-api> \
   python scripts/line_floorplan_smoke.py \
     --base-url https://<staging-api-origin> \
     --group-id <bound-line-group-id>
   ```

If Render cannot access GitHub, stop using Git-backed deploys for recovery and
follow `docs/render-image-deploy-recovery.md`. Do not repeatedly retry failed
Git deploys after Render reports repository access failure.

For the image-backed production API recovery path, `four-wall-api` deploys are
triggered by `.github/workflows/planner-server-image.yml` after it pushes
`docker.io/paul953206/4wall-api:prod` and calls the Render Deploy API. Render's
native Auto-Deploy toggle does not watch Docker Hub tag updates.

## Promotion to Production

1. Confirm staging smoke passed.
2. Promote the same revision to `four-wall-api`.
3. Wait for production `/healthz` to return `200`.
4. Promote the same revision to `four-wall-web`.
5. Re-run `.github/workflows/smoke-beta.yml` against production values.
6. If LINE floorplan is enabled for the release, run:

   ```bash
   cd planner-server
   BUILDING_ROUTE_AUTH_SECRET_KEY=<same-secret-as-prod-api> \
   python scripts/line_floorplan_smoke.py \
     --base-url https://<prod-api-origin> \
     --group-id <bound-line-group-id>
   ```

## LINE Live Status v3 Rollout

When this release includes LINE live status v3, use this order after the normal
staging checks and repeat it for production:

1. Restore and fix the `192.168.1.10` camera view. Set a new explicit calibration
   id and confirm HMI and dispatch-sheet pixel regions remain inside the full frame.
2. Confirm the HMI worker production config has GPT summary and adjudication both
   disabled, then deploy it. Require two consecutive valid live observations with
   exact frame ids, source capture times, matching dimensions, calibration id, and
   reliable OCR before accepting LINE output.
3. Deploy the person worker for `192.168.1.31` and verify that both `detections: []`
   and multi-person frames reach the scoped ingest endpoint.
4. Deploy the API and Web from the same revision. Verify `/healthz`, database access,
   OCR/person ingest, LINE webhook signature/destination handling, and the public
   mobile floorplan.
5. On a real phone, test dispatch ticket, HMI screen, HC600-01, HC600-02, machine
   people, and contact email.
6. Apply `factory-ops-v3` last. The provisioning script must confirm
   `4wallaitech / @941wjxxe`, set and verify the default, and restore the prior
   default if any step fails.

If either edge worker fails, keep the v3 backend's honest no-data responses and
roll back only the worker/config. Do not restore the old fixed dispatch crop or
historical PRESS/FLOW LINE response.

## Live Ops Guardrail

If Android is not yet emitting the expected telemetry, lease, video, or bridge-alert events:

- keep `Live Ops` internal-only
- show placeholder or monitor-only states in web
- do not add browser-side control shortcuts to compensate

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

For image-backed recovery services, rollback by retagging the last known-good
Docker Hub image and triggering a new Render image deploy.

## Evidence to Keep

- the commit SHA deployed
- staging smoke run URL
- production smoke run URL
- Render deploy IDs for staging and production
- any rollback event and the reason it was triggered
