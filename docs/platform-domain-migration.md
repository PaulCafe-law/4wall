# Platform domain migration

Date: 2026-10-22
Status: Production cutover complete; root login page and legacy redirects verified.

## Scope and gap analysis

The user selected `https://platform.4wall.io` as the management platform entry.
`https://4wall.io` remains the public official website. This is a Sprint 4 web
deployment change; allowed source changes are limited to `web-app/` and `docs/`.
Checkpoint: `codex/checkpoint-platform-domain-20261022` at `c4f073e`.
Existing unrelated local changes are excluded.

Live Render services were inspected on 2026-10-22:

- Web: `four-wall-web`, `srv-d8bhtlml51nc7399sef0`, image
  `paul953206/4wall-web:c4f073e-prod`.
- API: `four-wall-api`, `srv-d7chueu7r5hc73esq5pg`, image
  `paul953206/4wall-api:6ddaedd`.
- DNS provider: Porkbun. The apex ALIAS, `www` CNAME, and new `platform` CNAME
  target `four-wall-web.onrender.com` (TTL 600).
- Render included custom-domain usage is now 2 of 2; the new domain fits that quota.

Gaps identified before the migration:

1. Every hostname root redirects to `/official`.
2. The official page uses client-side `/login` links, which bypass an nginx
   redirect after hydration.
3. The API accepts a single configured app origin for CORS and session mutations.
4. Existing invite, LINE, and deep links must retain their paths and query strings.

## Intended behavior

- `platform.4wall.io/` displays the login form directly for anonymous users,
  keeping the address at the hostname root. The user clarified on 2026-10-22
  that the visible URL must not become `/login`. Existing authenticated sessions
  retain their dashboard behavior.
- `/login` on the canonical host and old production hosts redirects to the
  canonical root, preserving login query parameters. React navigation to
  `/login` on the canonical host also resolves to the root.
- Official-site login links navigate to `https://platform.4wall.io`.
- Other platform routes on `4wall.io`, `www.4wall.io`, and
  `four-wall-web.onrender.com` temporarily redirect (302, no-store) to the new
  origin while preserving the original path and query string.
- Public official pages, assets, crawler files, and `/healthz` stay available.
- Localhost and staging routing remain unchanged.
- API origin becomes exactly `https://platform.4wall.io`; no wildcard origins,
  credential transfer, cookie-domain expansion, or authentication changes.
- Users may need to sign in again on the new hostname.

## Execution order

1. Add the custom domain to the existing Render web service and a Porkbun CNAME
   `platform` -> `four-wall-web.onrender.com` (TTL 600).
2. Verify DNS and HTTPS before directing existing users to the new origin.
3. Implement and review the web routing and official login-link changes. Build
   and test the image, including real nginx host/path/query behavior.
4. Record the old API origin and relevant LINE allowlist; update them during
   cutover, retaining unrelated settings and the existing API image.
5. Deploy the tested web image. Validate public pages, old-link redirects, new
   platform routes, CORS/session-origin rejection, login and refresh where an
   authorized test session is available.

## Rollback

Restore the recorded API origin and LINE host allowlist and the web image
`paul953206/4wall-web:c4f073e-prod`. Keep the added DNS/custom-domain binding while
investigating; no existing records or services need deletion. Temporary redirects
must not be cached. Report any unverified authenticated behavior explicitly.

## Verification and execution record

- Render verified `platform.4wall.io` and issued its certificate. An HTTPS
  request to `https://platform.4wall.io/healthz` returned 200.
- Old API settings, recorded for rollback: `BUILDING_ROUTE_APP_ORIGIN` was
  `https://four-wall-web.onrender.com`; `LINE_NAVIGATION_ALLOWED_HOSTS` was
  `four-wall-web.onrender.com`. New values are `https://platform.4wall.io` and
  `platform.4wall.io`, respectively. `LINE_PUBLIC_BASE_URL` stays the API URL.
- Web lint passed; all 253 tests in 50 files passed; production build and
  type checking passed. The 13 focused route tests also passed after the root
  login change, covering role routing, LINE continuation, and session states.
- Backend session/auth/artifact checks: 14 passed. API and cross-organization
  artifact access checks: 6 passed.
- Independent diff/security review found no actionable findings. An additional
  15 focused origin, LINE URL, and cookie-attribute checks passed.
- Real nginx acceptance: 155 checks passed using
  `node web-app/scripts/verify-platform-routing.mjs http://127.0.0.1:18080`
  against the built image. This verifies legacy and canonical hosts, encoded
  query strings, public assets, and local/staging behavior.
- The release build pins its nginx runtime to the existing production image
  digest `sha256:70d57959f68b723501e9fff9589e1649f3e8be0adb50bc5a1bae6c45a462e646`.
  Only the web build and routing template are replaced; the API image remains
  `paul953206/4wall-api:6ddaedd`.
- The initial GitHub Web App CI runs passed, including lint, unit tests,
  end-to-end tests, and the production build: runs `39715562721` and
  `39715567030`. Final revision CI is tracked on PR #120 before merge.
- Final published web image: `paul953206/4wall-web:e97d183-prod`, source revision
  `e97d183b4ff1d52cf9549640d2f802b09d5b5706`, deployed by immutable digest
  `sha256:380cd43d292665f70a3daa7d073394012c4cd805dbaff7830f8df6390c904128`.
- Final Render web deployment `dep-dbco3obncjis73d3fivg` was live at 11:24:42
  Asia/Taipei. API deployment `dep-dbco0irrjlhs73e4p8kg` succeeded at
  approximately 11:18:28, retaining the existing API image digest beginning
  `2586684` and applying only the two documented environment changes.
- Final production HTTP checks: platform `/healthz` and `/` returned 200;
  `/login` returned 302 to `https://platform.4wall.io/`.
  `https://4wall.io/login?expired=1` returned 302 to
  `https://platform.4wall.io/?expired=1`. The old Render-host `/login` also
  redirects to the canonical root. The official root still redirects to
  `/official`; both language pages remain available with new platform links.
- Production API CORS preflight permits exactly `https://platform.4wall.io`
  with credentials. The old `https://four-wall-web.onrender.com` origin returns
  400 without `Access-Control-Allow-Origin`. An unapproved `https://evil.example`
  origin is rejected in the same way.
- Final anonymous browser check: the actual login form is displayed at
  `https://platform.4wall.io/`, and the address stays at `/` after session
  restoration. The old canonical `/login` reaches this root directly.
  Before the root correction, a dummy old `/line/link#flow=domain-check` link
  correctly entered the new-origin LINE login flow; final route tests cover
  its root-login continuation. No real LINE account linking was performed.
- The user explicitly requested the login-page URL change only and declined
  actual-account login testing. No passwords or session tokens are copied into
  this document.
