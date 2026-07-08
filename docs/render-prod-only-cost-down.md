# Render prod-only cost-down

Date: 2026-06-08

This operation retires the always-on staging backend/database to reduce early-stage monthly cost while keeping production available.

## Decisions

- Keep production as the only remote environment for now.
- Upgrade `four-wall-web` to Starter to avoid free-tier cold starts.
- Keep `four-wall-api` and production Postgres active.
- Suspend `four-wall-api-staging`.
- Back up and delete `four-wall-db-staging`.
- Do not modify Android or any flight-critical runtime.

## Backup

- Backup directory: `D:\The Fourth Wall AI\ops-backups\staging-retired-20260608-195446`
- Staging DB dump: `staging-db-before-delete.dump`
- Secrets are not stored in this repository.

## Rollback

- Resume `four-wall-api-staging` if the staging API service is needed again.
- Recreate a Render Postgres database and restore `staging-db-before-delete.dump` if the staging database is needed again.
- Point the staging API database environment variable at the recreated database, then redeploy.

## Production verification

Verify after the Render changes:

- `https://four-wall-web.onrender.com/official`
- `https://four-wall-web.onrender.com/login`
- `https://four-wall-api.onrender.com/healthz`
- Authenticated smoke for missions, incidents, site map, and an artifact download.

## Execution record

- Checkpoint branch: `checkpoint/render-cost-down-prod-only-20260608-195446`
- `four-wall-web` was upgraded from Free to Starter.
- `four-wall-api-staging` was suspended.
- `four-wall-db-staging` was backed up and deleted.
- `four-wall-web-staging` remains active on Free, so it does not add the Starter compute cost.
- Production API health returned 200 with database status `ok`.
- Authenticated production API smoke returned 12 missions, 3 sites, and 2 incidents.
- A production KMZ artifact download returned 200.
