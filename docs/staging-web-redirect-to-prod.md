# Staging web redirect to production

Date: 2026-06-08

The long-running staging backend and staging database have been retired. To avoid a misleading staging UI that points at unavailable services, `four-wall-web-staging` now redirects to production.

## Behavior

- `https://four-wall-web-staging.onrender.com/*` redirects to `https://four-wall-web.onrender.com/*`.
- The staging web service remains on the free Render plan.
- No production API, database, Android, or flight-critical runtime is changed.

## Deployment

- Checkpoint branch: `checkpoint/staging-web-redirect-20260608-231029`
- Rollback image tag: `paul953206/4wall-web:staging-before-redirect-20260608-231029`
- Redirect image tag: `paul953206/4wall-web:staging`
- Redirect image digest: `sha256:8dd09bb8d59eb4d8980028512627945fedf75dfd3d6e7a2eeb4620dac02d0f68`
- Render deploy id: `dep-d8jdqn58nd3s73eg6jng`

## Verification

- `https://four-wall-web-staging.onrender.com/healthz` returns `redirect-ok`.
- `https://four-wall-web-staging.onrender.com/official?redirect-check=1` returns 302 to `https://four-wall-web.onrender.com/official?redirect-check=1`.
- `https://four-wall-web-staging.onrender.com/site-map?map=bri` follows to `https://four-wall-web.onrender.com/site-map?map=bri`.

## Rollback

Retag the rollback image back to `paul953206/4wall-web:staging`, push it, then redeploy `four-wall-web-staging`.
