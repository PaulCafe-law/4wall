# Web Release Checklist

This checklist is the single acceptance path for `planner-server` and `web-app` releases.

Use it together with:

- [web-beta-release-runbook.md](/D:/The%20Fourth%20Wall%20AI/codebase/docs/web-beta-release-runbook.md)
- [WEB_THREAD_ANDROID_HANDOFF.md](/D:/The%20Fourth%20Wall%20AI/codebase/docs/WEB_THREAD_ANDROID_HANDOFF.md)
- [WEB_THREAD_FAIL_CLOSED_BEHAVIOR.md](/D:/The%20Fourth%20Wall%20AI/codebase/docs/WEB_THREAD_FAIL_CLOSED_BEHAVIOR.md)

Dual-role deployed smoke uses:

- `BETA_WEB_SMOKE_EMAIL`
- `BETA_WEB_SMOKE_PASSWORD`
- `BETA_WEB_SMOKE_ADMIN_EMAIL`
- `BETA_WEB_SMOKE_ADMIN_PASSWORD`
- `BETA_WEB_SMOKE_VIEWER_EMAIL`
- `BETA_WEB_SMOKE_VIEWER_PASSWORD`

Seeded data smoke remains the required baseline.
Admin smoke remains the required authenticated-shell baseline.
Viewer smoke should be enabled in each environment once a seeded `customer_viewer` account is available.

## 1. Pre-Deploy Gate

- Confirm the release scope is limited to `planner-server`, `web-app`, `docs`, deploy config, or other approved web-thread files.
- Confirm CI is green for the exact revision you intend to deploy.
- If the release touches `live-ops` or `support`, verify the Android contract is unchanged or already available.
- If Android is not yet emitting the required events, confirm the web surface still degrades to placeholder or monitor-only behavior.
- Record the commit SHA that will be promoted.

## 2. Staging Acceptance

- Deploy `four-wall-api-staging`.
- Confirm `/healthz` returns `200` and `"database": {"status": "ok"}`.
- Deploy `four-wall-web-staging`.
- Run `.github/workflows/smoke-beta.yml` against staging values.
- Validate these user flows on staging:
  - self-serve signup
  - login
  - invite acceptance
  - customer admin deployed smoke
  - customer viewer deployed smoke if viewer smoke credentials are configured
  - overview aggregate cards, including pending actions and recent deliveries
  - mission list with explicit delivery badges, publish time, and failure reason
  - mission detail and artifact download
  - billing, including due / overdue / paid / void clarity plus payment note / receipt ref rendering
  - team, including invite create / resend / revoke
  - organization settings update
  - member role update
  - member deactivate/reactivate
- If the release touches internal ops surfaces, validate:
  - `Support` loads with severity/category filters, mission/org/site context, last-observed timing, and recommended next step copy
  - `Live Ops` stays internal-only
  - telemetry freshness and video availability are visible in `Live Ops`
  - unavailable or stale Android data remains fail-closed and clearly presented as monitor-only

## 3. Production Promotion

- Promote the same API revision to `four-wall-api`.
- Confirm production `/healthz` returns `200`.
- Promote the same web revision to `four-wall-web`.
- Re-run `.github/workflows/smoke-beta.yml` against production values.
- Validate the same core customer flows on production.
- Reconfirm the explicit admin account can still open `/team`, resend an invite, and update organization settings after promotion.
- If internal ops surfaces changed, re-check the same `Support` and `Live Ops` monitor-only states on production.

## 4. Rollback Triggers

Rollback immediately if any of these occur:

- `/healthz` returns `503`
- login or refresh fails
- authenticated mission list smoke fails
- artifact download smoke fails
- org isolation or auth regression is detected
- `Live Ops` or `Support` exposes non-fail-closed behavior when Android data is missing

## 5. Evidence to Keep

- deployed commit SHA
- staging smoke run URL
- production smoke run URL
- Render deploy IDs for staging and production
- manual QA notes for customer and internal flows
- confirmation that explicit admin/viewer smoke accounts still match the environment after any secret rotation
- any rollback event, trigger, and recovery deploy ID
