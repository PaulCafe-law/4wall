# Production Parity Promotion - 2026-06-08

## Goal

Promote the current Render staging state to production so production matches the
validated staging web/API/data surface. This is an operations sprint only:
Android and flight-critical runtime are out of scope.

## Current Facts

- `four-wall-web-staging`, `four-wall-web`, `four-wall-api-staging`, and
  `four-wall-api` are image-backed Render Web Services in the dashboard.
- `render.yaml` still describes the web services as static sites. Treat the
  live Render dashboard state as authoritative for this promotion.
- Production and staging currently use different Docker image digests for both
  web and API services.
- Production and staging use separate Render Postgres databases:
  `four-wall-db-prod` and `four-wall-db-staging`.
- GitHub PR #81 is still open from the local view, but promotion source is the
  live staging image/data state rather than `origin/main`.

## Promotion Scope

- Build the production web image from the staging-matching source with
  production `VITE_API_BASE_URL` and `VITE_APP_ENVIRONMENT`. Do not retag the
  staging web image directly because Vite bakes the API origin into the bundle.
- Retag the currently deployed staging API image to the production API image tag
  and redeploy `four-wall-api`.
- Back up production Postgres before restoring the staging database into the
  production database.
- Copy staging S3/artifact objects into the production artifact bucket so DB
  references continue to resolve.
- Keep production-specific Render environment variables, domains, secrets,
  database URL, artifact bucket, and LINE settings.

## Safety Notes

- Production data will be overwritten. The pre-promotion production DB dump and
  artifact manifest are the rollback sources.
- Do not point production services at staging databases, staging artifact
  buckets, or staging public origins.
- Do not modify `android-app/` or any server/web code path that participates in
  flight-critical control.

## Rollback

1. Retag the captured previous production Docker image digests back to the
   production tags and redeploy Render services.
2. Restore the production database from the pre-promotion dump.
3. Use the pre-promotion artifact manifest to identify copied artifact objects
   if artifact cleanup is required.

## 2026-06-08 Execution Record

- Backup directory: `D:\The Fourth Wall AI\ops-backups\prod-staging-parity-20260608-074630`.
- Docker rollback tag pushed for both images: `prod-before-20260608-074630`.
- Web production image was rebuilt with production API origin and pushed as:
  - `paul953206/4wall-web:3323347-prod-20260608-074630`
  - `paul953206/4wall-web:prod`
- API staging image was promoted and pushed as:
  - `paul953206/4wall-api:staging-promoted-20260608-074630`
  - `paul953206/4wall-api:prod`
- Production DB backup: `prod-before.dump`.
- Staging DB restore source: `staging-source.dump`.
- Artifact copy: 36 staging `missionartifact.storage_key` objects copied into
  the production artifact bucket.
- Render deploys triggered:
  - API production: `dep-d8j0r0u7r5hc73dched0`
  - Web production: `dep-d8j0s148aovs738qfil0`
- Verification:
  - Production API `/healthz` returned `200` with DB dependency `ok`.
  - Production `/official` rendered the public official site in browser.
  - Production web bundle contains `https://four-wall-api.onrender.com` and
    does not contain the staging API origin.
  - Authenticated API smoke with the staging platform account returned
    12 missions, 3 sites, and 2 incidents.
  - Mission KMZ artifact download returned `200` with KMZ content type.

Note: the first artifact sync script run partially populated the production
bucket before the BOM-prefixed artifact key was corrected. The reliable
pre-promotion cleanup reference is `prod-db-artifact-keys-before.txt`, which
records the two artifact keys referenced by production DB before restore.
