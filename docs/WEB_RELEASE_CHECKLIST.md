# Web Release Checklist

This checklist is the single acceptance path for `planner-server` and `web-app` releases.

Use it together with:

- [web-beta-release-runbook.md](/D:/The%20Fourth%20Wall%20AI/codebase/docs/web-beta-release-runbook.md)
- [WEB_THREAD_ANDROID_HANDOFF.md](/D:/The%20Fourth%20Wall%20AI/codebase/docs/WEB_THREAD_ANDROID_HANDOFF.md)
- [WEB_THREAD_FAIL_CLOSED_BEHAVIOR.md](/D:/The%20Fourth%20Wall%20AI/codebase/docs/WEB_THREAD_FAIL_CLOSED_BEHAVIOR.md)

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
  - overview
  - mission list
  - mission detail and artifact download
  - billing
  - team
- If the release touches internal ops surfaces, validate:
  - `Support` loads
  - `Live Ops` stays internal-only
  - unavailable Android data remains fail-closed

## 3. Production Promotion

- Promote the same API revision to `four-wall-api`.
- Confirm production `/healthz` returns `200`.
- Promote the same web revision to `four-wall-web`.
- Re-run `.github/workflows/smoke-beta.yml` against production values.
- Validate the same core customer flows on production.

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
- any rollback event, trigger, and recovery deploy ID
