# LINE Mobile 2D Floorplan P0

## Sprint Boundary

This Sprint 3 change is limited to `planner-server/`, `docs/`, and necessary backend tests. The web factory twin files are read-only coordinate and id references. Android, flight logic, and flight-critical control paths are out of scope.

## Checkpoint Note

The worktree was already dirty before this change, so a normal sprint git checkpoint would risk mixing unrelated user work. This document records the exception checkpoint used for this task:

- Branch: `codex/provision-multiple-factory-cameras`
- HEAD: `bb4f56a`
- Initial status: dirty, including existing `AGENTS.md`, `CLAUDE.md`, `docs/industrial-data-engine.md`, `planner-server/app/industrial_data_engine/providers.py`, `planner-server/tests/test_industrial_data_engine.py`, many `web-app/` files, and untracked docs/assets.
- Rule for this implementation: do not stage, commit, revert, or overwrite unrelated existing changes.

## Scope

P0 adds a LINE mobile 2D factory floorplan for Jingcheng only:

- Rich Menu actions: floorplan, machines, gauges, daily incidents.
- A LINE imagemap with the static factory map and live status dots.
- Machine tap fallback through LINE message action text such as `機台 m-hc600`.
- Machine detail Flex card with live gauge readings, latest public thumbnail if available, and today's incident count.
- One LINE group to one site binding through an administrator script.

Out of scope:

- LIFF.
- Multiple sites.
- Daily digest automation.
- Android or flight control changes.
- Presigned original image external links.

## Architecture

The implementation reuses the existing LINE router, LINE helper, camera ingest records, incidents, and artifact storage boundary.

Core data sources:

- `CameraDevice`: camera identity, site scope, heartbeat, and error state.
- `CameraGaugeReading`: live gauge values and status.
- `CameraFrame`: latest uploaded frame storage key for thumbnail presigning.
- `IncidentRecord`: unresolved and daily incidents.
- `LineGroupBinding`: explicit group-to-site authorization.
- `app/line_floorplan/layouts/jingcheng.json`: static layout facts from the factory twin mirror domain.

The layout JSON stores fixed machine and camera positions. It is not a simulator and must not read mock status, OEE, alarms, or person data from the web app. Live status must come only from planner-server production records.

The Jingcheng base map is derived from `web-app/public/factory-twin-assets/assets/factory.glb`, with the roof hidden and the GLB z-axis rotated horizontally for the LINE 1040x700 imagemap ratio. `jingcheng_glb_topdown_crop.png` is the checked-in source crop used by `scripts/render_line_floorplan_base.py`; `jingcheng_base_1040.png` is the regenerated LINE asset. Machine tap areas are aligned to the bound GLB nodes `C600001` through `C600007`, not to the old hand-drawn placeholder layout.

## Public Endpoint

LINE imagemap images are served by:

`GET /v1/line/floorplan/{site_slug}/{render_token}/{width}`

Rules:

- `site_slug` must be a registered layout slug. P0 supports only `jingcheng`.
- `width` must be one of `240`, `300`, `460`, `700`, `1040`.
- The response is `image/png`; the URL intentionally has no `.png` suffix.
- `render_token` is an HMAC token signed with `settings.auth_secret_key`.
- The token payload signs `siteSlug`, `groupId`, and `issuedAt`, and expires after 10 minutes.
- The endpoint keeps a 60 second in-memory cache and applies rate limiting.
- The PNG contains only the base map, camera status dots, machine status dots, and an Asia/Taipei timestamp. It must not contain screenshots, personal names, private identifiers, or internal URLs.

`LINE_PUBLIC_BASE_URL` must be configured for staging and production so imagemap payloads can point LINE servers at the public API origin.

## Status Rules

Machine status priority:

1. Red: there is an unresolved incident for the site and machine.
2. Yellow: the latest specified gauge reading is `degraded` or `failed`.
3. Green: every specified gauge has a non-expired latest reading with status `ok`.
4. Gray: no data or stale data.

Camera status:

- Green: active camera with heartbeat in the last 90 seconds and no last error.
- Red: inactive, stale heartbeat, or last error.
- Gray: no matching device data.

All daily calculations and rendered timestamps use `Asia/Taipei`.

## LINE Message Flow

Webhook HMAC verification remains mandatory.

Rich Menu postbacks:

- `action=floorplan`: reply with imagemap.
- `action=machines`: reply with machine carousel/list.
- `action=gauges`: reply with current gauge card.
- `action=daily_incidents`: reply with today's existing incident summary text.
- `action=report_machine_incident&machineId=...`: create one `pending_review` incident with `source=line`.

Imagemap tap areas use LINE message actions, not postbacks:

- `機台 m-hc600`

Text fallback:

- `廠區圖`
- `機台`
- `儀表`
- `異常`
- `機台 <id>`

Unbound groups receive only `此群組尚未綁定場域` except for `綁定 靚程`, which logs the group id and instructs an administrator to run the binding script. Direct user and room conversations do not receive site data.

All P0 interactions use `reply`. No new push path is introduced. Existing incident push remains controlled by `LINE_INCIDENT_NOTIFY_ENABLED` and `LINE_DEFAULT_GROUP_ID`.

## Binding Flow

`LineGroupBinding` stores:

- `group_id` unique.
- `source_type`.
- `organization_id`.
- `site_id`.
- `site_slug`.
- `is_active`.
- `created_at`.

Operators should:

1. Add the LINE bot to the duty group.
2. Type `綁定 靚程`.
3. Read the server log for `group_id` and `source_type`.
4. Run `planner-server/scripts/bind_line_group.py` with the group id, organization, and site.

The webhook never auto-binds a group. This prevents unknown groups from self-authorizing.

## Thumbnail Policy

Machine cards may include a thumbnail only through `storage.create_presigned_get_url` with `expires_in_seconds <= 600`. Local storage returns `None`; the card must degrade to `暫無可公開縮圖`.

P0 does not expose a presigned original image button. If an original image link is needed later, run a CSO security pass and document the accepted risk before enabling it.

## Security And Operations

Security review focus before shipping:

- The public PNG does not leak screenshots, people, internal URLs, or private identifiers.
- Render tokens expire and are bound to `siteSlug` and `groupId`.
- Rate limit and 60 second cache behavior are present.
- Presigned thumbnail TTL is no more than 600 seconds.
- Group binding is script-only and idempotent.
- Reply-first strategy is preserved; P0 does not add push fanout.

Render environment variables to configure:

- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_CHANNEL_SECRET`
- `LINE_WEBHOOK_ENABLED=true`
- `LINE_PUBLIC_BASE_URL=https://<api-origin>`
- Existing incident-only push vars remain separate: `LINE_DEFAULT_GROUP_ID`, `LINE_INCIDENT_NOTIFY_ENABLED`

## Verification

Expected local acceptance:

- `cd planner-server && python -m pytest tests -q`
- Dry-run rich menu setup prints the four postback actions.
- `python scripts/line_floorplan_dry_run.py` prints the four webhook reply payloads and the `m-hc600` machine detail card JSON without calling LINE or the database.
- Dry-run webhook payloads cover floorplan, machines, gauges, daily incidents, and machine detail.
- `GET /v1/line/floorplan/jingcheng/<token>/1040` returns PNG and a second request inside 60 seconds reports cache hit.
- Staging validates that the configured Jingcheng site id exists and real camera/gauge records appear in the card.

## P0.5 Deployment Hardening

P0.5 closes the deployment and operations gaps before adding the mobile live view.

Render API services must define `LINE_PUBLIC_BASE_URL` as a synced secret-like environment value:

- `four-wall-api-staging`: set to the staging API public origin, for example `https://staging-api.<domain>`.
- `four-wall-api`: set to the production API public origin, for example `https://api.<domain>`.

`LINE_PUBLIC_BASE_URL` is only the API origin used by LINE servers to fetch imagemap PNGs. The mobile web page uses `BUILDING_ROUTE_APP_ORIGIN`.

The planner-server Docker image installs `fonts-noto-cjk` so Pillow can render Chinese labels in Render. Font fallback should prefer Noto CJK on Linux and keep Windows/macOS local fallbacks for developer machines. If no CJK font is available, base image generation must use ASCII labels or fail clearly instead of writing square-glyph output.

The floorplan PNG endpoint is behind Render's proxy. Rate limiting should use `X-Forwarded-For` only outside development. In development and test, the limiter should use the direct client address so local callers cannot spoof identities with arbitrary headers.

Post-deploy smoke:

```bash
cd planner-server
BUILDING_ROUTE_AUTH_SECRET_KEY=<same-secret-as-target-env> \
python scripts/line_floorplan_smoke.py \
  --base-url https://<api-origin> \
  --group-id <bound-line-group-id>
```

The smoke script mints a render token locally, calls `/v1/line/floorplan/jingcheng/<token>/1040`, verifies `200`, `image/png`, PNG magic bytes, and verifies the second request reports `X-Line-Floorplan-Cache: hit`. It must not add a public token minting endpoint.

LINE may cache Flex thumbnail images after receiving a presigned URL. The backend still limits generated thumbnail URLs to 600 seconds or less; after expiration, a previously cached LINE client may briefly show the old thumbnail, while newly opened cards must receive a fresh short-lived URL. P0 does not expose original image links.

## P1 Mobile Live View

P1 adds a no-LIFF mobile web view opened from LINE. It does not add LINE Login and does not use browser login cookies.

LINE messages link to:

`<BUILDING_ROUTE_APP_ORIGIN>/m/floorplan/{siteSlug}?token=<liveview_token>`

The token is HMAC-signed with `BUILDING_ROUTE_AUTH_SECRET_KEY`:

- `purpose=liveview`
- `siteSlug`
- `groupId`
- `issuedAt`
- TTL 3600 seconds

The render-token verifier should accept current `purpose=render` tokens and legacy no-purpose render tokens for the existing 600 second TTL so cached LINE imagemaps do not break during rollout.

### P1 Data Flow

```text
LINE group
  -> webhook verifies x-line-signature
  -> active LineGroupBinding resolves group/site
  -> reply contains mobile URI with liveview token
  -> LINE in-app browser opens web-app public route
  -> web-app polls token-gated planner-server state endpoint
  -> web-app renders SVG and machine bottom sheet
```

### P1 API

`GET /v1/line/floorplan/{site_slug}/state?token=...`

Returns JSON for layout geometry, machine statuses, camera heartbeat statuses, today's unresolved incidents, latest gauges, and Asia/Taipei server time. Incident entries expose generated public labels such as `HC600-01 未結異常`, coordinates, machine reverse lookup, severity, status, and created time; they do not expose raw incident titles, reporter names, assignees, evidence, or storage keys. It must reuse the floorplan service query/view builders. It has a 5 second server-side cache, rate limit, and returns `403` for invalid or expired tokens without leaking whether a site exists.

`GET /v1/line/floorplan/{site_slug}/machine/{machine_id}?token=...`

Returns machine detail JSON using the same data as the Flex card, including latest gauges, trend, today's incident count, and a thumbnail URL only through `storage.create_presigned_get_url` with TTL <= 600. Local storage returns `thumbnailUrl: null`.

### P1 Threat Model

The liveview link can be forwarded outside the LINE group. Mitigations:

- Tokens expire after 60 minutes.
- Tokens are scoped to `siteSlug` and `groupId`.
- Endpoints check active `LineGroupBinding` before returning data.
- The mobile page does not call authenticated web APIs and does not require session cookies.
- Invalid tokens and unauthorized bindings return `403` without site existence details.
- State JSON must not include personal names, assignees, user IDs, or internal storage keys.

### P1 LINE Behavior

- `action=floorplan` replies with the P0 imagemap and one extra "Open live map" URI button message.
- Machine Flex cards include a "Live map" URI button with `focus=machine:<machineId>`.
- Existing incident push may add one liveview link line with `focus=incident:<incidentId>` only when `LINE_DEFAULT_GROUP_ID` has an active binding matching the incident site and organization.
- P1 does not add push fanout and does not add additional push messages.

### P1 Manual Setup

P1 requires no new LINE Developers console work. Keep the P0 setup:

- Webhook points to `/v1/line/webhook`.
- Channel token and secret are in Render env.
- Rich menu is created by `scripts/line_setup_rich_menu.py`.
- The bot is invited to the duty group.
- The group is bound by `scripts/bind_line_group.py`.

Additional Render env checks:

- `LINE_PUBLIC_BASE_URL` is the API public origin.
- `BUILDING_ROUTE_APP_ORIGIN` is the web app public origin.

No LIFF app, no LINE Login, and no new console registration are required.

### P1 Verification

- `cd planner-server && python -m pytest tests -q`
- `cd web-app && npm run test -- --run`
- `cd web-app && npm run build`
- On a 375 x 812 viewport, `/m/floorplan/jingcheng?token=<valid>` shows the SVG floorplan, live status dots, a machine bottom sheet, focus highlighting, and clear expired-token guidance.

Security review before shipping should focus on public endpoints, token scope/TTL/purpose, presigned thumbnail TTL, incident push content-only changes, reply-only strategy, and no PII in state JSON.
