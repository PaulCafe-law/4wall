# Web Beta Release Runbook

## Scope

This runbook covers the Web Beta RC release path for:

- `planner-server`
- `web-app`
- Render staging and production services defined in the repo-root `render.yaml`

It does not cover Android field readiness or Sprint 4 hardware validation.
It also does not own Android implementation details for live monitoring; Android is treated here as an upstream contract dependency only.

The release acceptance checklist lives in:

- `docs/WEB_RELEASE_CHECKLIST.md`

The Phase 1 demo scope and target contracts live in:

- `docs/PHASE_1_DEMO_CONTROL_PLANE_AND_REPORTING.md`

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
  - `BETA_WEB_SMOKE_ADMIN_EMAIL`
  - `BETA_WEB_SMOKE_ADMIN_PASSWORD`
  - `BETA_WEB_SMOKE_VIEWER_EMAIL`
  - `BETA_WEB_SMOKE_VIEWER_PASSWORD`

The current rollout model is:

- seeded data smoke is required and uses `BETA_WEB_SMOKE_EMAIL` / `BETA_WEB_SMOKE_PASSWORD`
- authenticated admin shell smoke is required
- browser-level customer admin management smoke is enabled when explicit `BETA_WEB_SMOKE_ADMIN_*` secrets are configured
- viewer smoke is supported and should be turned on once the environment has a stable seeded `customer_viewer`
- if any smoke secret is rotated, manually verify that the exact staging/production account can still log in before re-running `Beta Smoke`

## Staging Deploy

1. Confirm CI is green for `planner-server` and `web-app`.
2. If the release touches `live-ops` or `support`, confirm the expected Android event contract is unchanged or already available. If not, the web surface must stay in placeholder or monitor-only state.
3. Apply the repo-root `render.yaml` blueprint if service shape changed.
4. Deploy `four-wall-api-staging`.
5. Wait for `/healthz` to return `200` with `"database": {"status": "ok"}`.
6. Deploy `four-wall-web-staging`.
7. Run `.github/workflows/smoke-beta.yml` against staging.
8. Manually verify self-serve signup and invite acceptance if auth surface changed.
9. If viewer smoke credentials are configured, confirm the viewer deployed smoke also passed.
10. Manually verify:
   - site map and site selection flow
   - route/template records can be created, viewed, or edited without entering any flight-control path
   - schedule and dispatch records can be created and show the expected planning metadata
   - overview pending-action cards, invoice reminders, invite reminders, and setup guidance when the workspace has no sites or no missions
   - overview demo cards for scheduled/running/failed missions, latest events, and latest reports
   - mission list delivery badges, clean failure copy, and ready-to-deliver summaries
   - mission detail publication panel with download metadata, next-step guidance, event count, report summary, evidence/report artifacts, and linked route/template/schedule/dispatch metadata when the release touched control-plane surfaces
   - internal-only analysis reprocess flow can generate demo findings, clean-pass output, and explicit analysis-failed output when the release touched event/report surfaces
   - team invite lifecycle, including resend / revoke
   - billing status clarity, payment note, receipt reference rendering, and reminder panels for overdue or due-soon invoices
11. If the release touches internal ops surfaces, manually verify:
   - `Support` shows severity/category filters, mission/org/site context, last-observed timing, recommended next steps, and claim / acknowledge / resolve workflow state
   - `Support` includes analysis/report failure categories, including `report_generation_failed`, if the release touched event/report flows
   - `Live Ops` shows telemetry freshness, video availability, lease status, dispatch context, report status, event count, report summary, and monitor-only copy when data is degraded
   - one report-failed mission and one clean-pass mission tell the same story across mission detail, support, and live ops when the release touched event/report flows

## Promotion to Production

1. Confirm staging smoke passed.
2. Promote the same revision to `four-wall-api`.
3. Wait for production `/healthz` to return `200`.
4. Promote the same revision to `four-wall-web`.
5. Re-run `.github/workflows/smoke-beta.yml` against production values.
6. Re-check self-serve signup or invite acceptance if the release touched auth flows.
7. If viewer smoke credentials are configured, confirm the viewer deployed smoke also passed.
8. Re-check the same overview / mission-delivery / billing manual flows on production before closing the deploy.
9. Re-check the control-plane route/template/schedule/dispatch flows on production if the release touched the Phase 1 demo surface.
10. Re-check one mission detail page on production to confirm linked planning metadata still renders after dispatch if the release touched control-plane surfaces.
11. Re-check team invite lifecycle on production if the release touched team surfaces.
12. If the release touched internal ops surfaces, confirm the same `Support` and `Live Ops` diagnostics on production before closing the deploy.
13. If the release touched event/report or internal-ops surfaces, confirm on production that:
   - clean-pass missions do not surface phantom anomaly warnings
   - report-failed missions generate a support item and a live-ops report blocker summary
14. If support handling changed, claim and resolve one support item in staging before promoting the same flow to production.

Use `docs/WEB_RELEASE_CHECKLIST.md` to record staging / production acceptance evidence.

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

## Evidence to Keep

- the commit SHA deployed
- staging smoke run URL
- production smoke run URL
- Render deploy IDs for staging and production
- any rollback event and the reason it was triggered
