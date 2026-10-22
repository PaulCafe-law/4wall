# Official website at the hostname root

Date: 2026-10-22
Status: Production cutover and anonymous browser/HTTP verification complete.

## Request and scope

The user wants `https://www.4wall.io` itself to show the public official website,
without an `/official` path. The management login remains at
`https://platform.4wall.io/`, as verified in the preceding migration.
The English official page will be `https://www.4wall.io/en`.

This is a Sprint 4 web deployment change limited to `web-app/` and `docs/`.
Checkpoint: `codex/checkpoint-official-root-20261022` at `2c3d426`.
Unrelated local work is excluded. No backend or Android behavior changes.

## Root cause and gaps

1. nginx currently redirects every non-platform hostname root to `/official`.
2. React routes only render the official pages at `/official` and `/official/en`.
3. Language links, prerendered canonical/hreflang/social metadata, and crawler
   files still refer to the `/official` paths.
4. Render currently treats `4wall.io` as the primary domain and redirects
   `www.4wall.io` to it. This pairing must be reversed so the requested `www`
   hostname remains visible. The existing DNS records already target Render;
   recheck the provider's verification requirements before changing them.

## Intended behavior

- `www.4wall.io/` serves the existing Chinese official page directly with HTTP
  200. It stays at `/` after hydration. No visual or copy redesign is included.
- `www.4wall.io/en` serves the existing English page directly. Language links
  use `/` and `/en`; anchors continue to refer to the visible official page.
- Both `4wall.io` and `www.4wall.io` render official root routes at the app
  layer, while Render makes `www.4wall.io` the canonical public hostname.
- Existing production `/official` and `/official/en` links redirect to the
  canonical root and `/en`, preserving query parameters and browser fragments.
- Existing legacy platform paths retain their canonical platform redirects.
  The platform root remains the login form; auth, cookies, CORS, and API config
  remain unchanged. Local and staging app routing retain their behavior.
- Canonical, hreflang, Open Graph, structured data, sitemap, robots, and the
  public Markdown/LLM links identify `https://www.4wall.io/` and `/en`.
- Public assets and health checks remain reachable. Platform HTML remains
  excluded from search indexing; public pages remain indexable.

## Deployment and rollback

Build and verify the actual nginx image, web tests/build, and independent code
and deployment-security review before shipping. Deploy the web image first,
with both public hostnames able to serve the root to avoid redirect loops.
Then reverse Render's paired-domain preference to `www`, verify certificates
and DNS, and check the resulting public URL in the browser.

Previous live web image:
`paul953206/4wall-web:e97d183-prod`, immutable digest
`sha256:380cd43d292665f70a3daa7d073394012c4cd805dbaff7830f8df6390c904128`.
Rollback restores that image and the previous apex-primary domain pairing.
Platform DNS and API configuration require no changes.

## Acceptance

- Public root and `/en` return prerendered content and stay at their requested
  routes after JavaScript loads; canonical metadata matches the new URLs.
- Old official aliases preserve query and fragment and do not loop.
- Navbar language and management links navigate correctly.
- `platform.4wall.io/` still displays its login form without `/login`.
- Real nginx host/path tests, web tests, production build, CI, and review pass.
- Production HTTP and anonymous browser checks verify the final hostname.
  The user does not require actual-account login testing.

## Verification record

- Web lint, type checking, and production build passed. All 268 tests in 51
  files passed, including the new public root routes and locale metadata checks.
- Actual production nginx image: configuration validation passed and 185
  hostname/path/query/header checks passed. Platform root and legacy login
  redirects remain correct; platform robots disallows all paths.
- Render re-verified the existing apex/www pair and issued both certificates;
  DNS records did not need modification.
- Independent code/deployment review found no unresolved issue. Domain pairing
  reversal uses Render's remove/re-add workflow. Existing browser-cached 301
  redirects are a deployment consideration, so verify the existing Chrome
  session as well as new HTTP requests after the switch.

## Production result

- Source revision: `fe393627516ac6227ccb0e49b38c90e6950a3b6d`.
- Published image: `paul953206/4wall-web:fe39362-prod`, pinned in Render as
  `sha256:f59de1c248da96a895ff529f554f24fbf66bccc6a474294b557d16d1efbb143d`.
- Render deployment `dep-dbcosr6q1p3s73cqp8d0` succeeded and became Live after
  starting at 2026-10-22 12:17:48 Asia/Taipei. Both source-branch and PR CI
  passed before this deployment, including browser end-to-end tests.
- Render now pairs `4wall.io` as a redirect to primary `www.4wall.io`.
  Both domains are Verified with Certificate Issued. Existing DNS records
  were retained; the platform domain and API configuration were unchanged.
  The remove/re-add operation briefly required certificate reissuance.
- Independent fresh HTTPS verification at 12:20:22 Asia/Taipei found zero
  failures: public root and `/en` returned 200 with matching canonical URLs;
  apex and old official aliases resolved in one or two redirects with encoded
  query strings preserved. Seven referenced JS/CSS/image assets returned 200.
- Chrome verified root-page hydration, English navigation and locale metadata,
  and the old apex `/official/en` URL retaining query and `#services` at
  `https://www.4wall.io/en`. The existing profile initially encountered its
  cached old www-to-apex 301; reloading the page restored normal navigation.
  Subsequent root visits and language switching worked. No cookies or history
  were cleared. Returning visitors with that cached redirect may need reload.
- `https://platform.4wall.io/` still shows the login form directly. Its HTML
  remains noindex and its robots file disallows all paths. Actual-account login
  was not requested and was not performed.
