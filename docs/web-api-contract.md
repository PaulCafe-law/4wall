# Desktop Web API Contract

## Design Rules

- Android APIs and artifact flows remain valid. This contract extends the planner server for the desktop web beta.
- The web app is invite-only and org-scoped.
- Android keeps bearer-token auth behavior.
- The web app uses:
  - short-lived access tokens in memory
  - rotating refresh tokens in an HttpOnly cookie
  - same-site app/api deployment so browser auth stays same-site
- Artifact downloads remain authenticated and must also enforce org-scoped authorization.
- Phase 1 demo additions are contract-first. DTOs and endpoint shape are locked before every route is fully implemented.
- Control-plane APIs stop at planning, scheduling, dispatch, and reporting metadata. They do not own active flight control.

## Session Model

### Access Token

- Returned in login and refresh responses
- TTL: 15 minutes
- Stored in memory only
- Sent as `Authorization: Bearer <accessToken>`

### Refresh Token

- Rotated on every refresh
- Stored in `HttpOnly`, `Secure`, `SameSite=Strict` cookie
- Cookie name: `fw_refresh`
- Only used by web session endpoints

### Session Endpoints

- `POST /v1/web/session/login`
- `POST /v1/web/session/refresh`
- `POST /v1/web/session/logout`
- `GET /v1/web/session/me`

## Roles

| Role | Scope | Can Read | Can Write |
|---|---|---|---|
| `platform_admin` | global | all orgs, sites, missions, invoices, audit events | orgs, invites, memberships, invoices, audit-related operations |
| `ops` | org-scoped or internal support scope | assigned orgs, missions, artifacts, invoices, audit events | sites, mission support actions, invoices |
| `customer_admin` | org-scoped | own org sites, missions, artifacts, invoices, members | own org sites, mission requests, invite acceptance support actions |
| `customer_viewer` | org-scoped | own org sites, missions, artifacts, invoices | no write access |

## Organizations and Invites

These endpoints are required to make invite-only beta onboarding usable.

### GET /v1/organizations

- internal only
- lists orgs with member and site counts

### POST /v1/organizations

- internal only
- creates a new org

### GET /v1/organizations/{organizationId}

- internal only
- returns org profile, members, pending invites, and recent missions

### PATCH /v1/organizations/{organizationId}

- internal only
- updates org metadata and support flags

### GET /v1/organizations/{organizationId}/members

- internal or org admin
- returns active members and pending invites

### POST /v1/organizations/{organizationId}/invites

- internal or org admin
- creates an invite

#### Request

```json
{
  "email": "ops@example.com",
  "role": "customer_admin",
  "displayName": "Tower A Ops"
}
```

### POST /v1/invites/accept

- public invite acceptance endpoint

#### Request

```json
{
  "inviteToken": "inv_tok_123",
  "password": "strong-password",
  "displayName": "Tower A Ops"
}
```

### POST /v1/invites/{inviteId}/revoke

- internal or org admin
- invalidates an unused invite

## Web Session Endpoints

### POST /v1/web/session/login

#### Request

```json
{
  "email": "ops@example.com",
  "password": "secret"
}
```

#### 200 Response

```json
{
  "accessToken": "jwt-access",
  "tokenType": "bearer",
  "expiresInSeconds": 900,
  "user": {
    "userId": "usr_123",
    "email": "ops@example.com",
    "displayName": "Tower A Ops",
    "role": "customer_admin",
    "organizationId": "org_123"
  }
}
```

Response also sets the `fw_refresh` cookie.

### POST /v1/web/session/refresh

- rotates the refresh cookie
- returns the same shape as login

### POST /v1/web/session/logout

- clears the refresh cookie
- invalidates the current refresh token record

### GET /v1/web/session/me

- returns the authenticated web session user and current org summary

## Sites

### GET /v1/sites

- returns sites visible to the caller
- query params:
  - `organizationId` internal only
  - `status`
  - `search`

### POST /v1/sites

- internal, `ops`, or `customer_admin`

#### Request

```json
{
  "organizationId": "org_123",
  "name": "Tower A",
  "externalRef": "tower-a",
  "address": "Taipei City ...",
  "location": {
    "lat": 25.03391,
    "lng": 121.56452
  },
  "notes": "North facade first"
}
```

### GET /v1/sites/{siteId}

- returns site profile plus:
  - `siteMap`
  - `activeRouteCount`
  - `activeTemplateCount`
  - `activeRoutes`
  - `activeTemplates`

### PATCH /v1/sites/{siteId}

- internal, `ops`, or `customer_admin`

#### Site Map Contract Additions

`Site` is no longer just an address-book record. The productized control plane expects every site response to support:

- `siteMap.baseMapType`
- `siteMap.center`
- `siteMap.zoom`
- `siteMap.version`
- `siteMap.zones[]`
- `siteMap.launchPoints[]`
- `siteMap.viewpoints[]`
- `activeRouteCount`
- `activeTemplateCount`
- `activeRoutes[]`
- `activeTemplates[]`

`SiteZone` should support:

- `zoneId`
- `label`
- `kind`
- `polygon`
- `note`
- `isActive`

`LaunchPoint` should support:

- `launchPointId`
- `label`
- `kind`
- `lat`
- `lng`
- `headingDeg`
- `altitudeM`
- `isActive`

`InspectionViewpoint` should support:

- `viewpointId`
- `label`
- `purpose`
- `lat`
- `lng`
- `headingDeg`
- `altitudeM`
- `distanceToFacadeM`
- `isActive`

## Missions

### GET /v1/missions

- query params:
  - `organizationId` internal only
  - `siteId`
  - `status`
  - `requestedBy`
  - `cursor`

### GET /v1/missions/{missionId}

- returns mission summary, planning status, artifact metadata, and recent flight uploads
- Phase 1 demo rollout extends this detail shape with:
  - route / template / schedule / dispatch metadata
  - event count
  - latest event summary
  - report status and latest report summary

### POST /v1/missions/plan

This extends the existing planner API with tenant and requester context.

#### Request

```json
{
  "organizationId": "org_123",
  "siteId": "site_123",
  "missionName": "tower-a-prod-beta",
  "requestedByUserId": "usr_123",
  "origin": {
    "lat": 25.03391,
    "lng": 121.56452
  },
  "targetBuilding": {
    "buildingId": "tower-a",
    "label": "Tower A"
  },
  "routingMode": "road_network_following",
  "corridorPolicy": {
    "defaultHalfWidthM": 8.0,
    "maxHalfWidthM": 12.0,
    "branchConfirmRadiusM": 18.0
  },
  "flightProfile": {
    "defaultAltitudeM": 35.0,
    "defaultSpeedMps": 4.0,
    "maxApproachSpeedMps": 1.0
  },
  "demoMode": false
}
```

#### Additional Response Fields

```json
{
  "missionId": "msn_20260402_001",
  "organizationId": "org_123",
  "siteId": "site_123",
  "requestedByUserId": "usr_123",
  "status": "ready"
}
```

Allowed statuses:

- `draft`
- `planning`
- `ready`
- `failed`
- `archived`

### Phase 1 Demo Additions

These endpoints are part of the Phase 1 demo rollout. The control-plane slice is available from Batch 2. The first event/report slice is available from Batch 3. Batch C formalizes stored schedule and dispatch lifecycle state instead of relying on inferred timestamps and placeholder outcomes. Batch D adds first-class alert-center and execution-summary read models so control-plane, mission detail, support, and live ops do not infer state independently.

#### Control Plane

- `GET /v1/inspection/routes`
- `POST /v1/inspection/routes`
- `PATCH /v1/inspection/routes/{routeId}`
- `GET /v1/inspection/templates`
- `POST /v1/inspection/templates`
- `PATCH /v1/inspection/templates/{templateId}`
- `GET /v1/inspection/schedules`
- `POST /v1/inspection/schedules`
- `PATCH /v1/inspection/schedules/{scheduleId}`
- `GET /v1/inspection/dispatch`
- `POST /v1/missions/{missionId}/dispatch`
- `PATCH /v1/inspection/dispatch/{dispatchId}`

These endpoints manage:

- site-linked route and template records
- schedule definitions
- alert configuration
- mission-level dispatch metadata and handoff state
- persisted schedule lifecycle fields

They do not send any real-time control command to Android or the aircraft.

The productized control-plane slice also expects:

- site summary fields:
  - `siteMap`
  - `activeRouteCount`
  - `activeTemplateCount`
  - `activeRoutes`
  - `activeTemplates`
- route summary fields:
  - `version`
  - `previewPolyline`
  - `estimatedDurationSec`
- template summary fields:
  - `evidencePolicy`
  - `reportMode`
  - `reviewMode`
- schedule summary fields:
  - `nextRunAt`
  - `lastRunAt`
  - `pauseReason`
  - `lastOutcome`
  - `lastDispatchedAt`
- dispatch summary fields:
  - `acceptedAt`
  - `closedAt`
  - `lastUpdatedAt`
  - `status`
  - `assignee`
  - `executionTarget`

Batch C also makes these lifecycle rules explicit:

- schedule states remain:
  - `scheduled`
  - `paused`
  - `cancelled`
  - `completed`
- dispatch states become:
  - `queued`
  - `assigned`
  - `sent`
  - `accepted`
  - `completed`
  - `failed`
- mission status aligns with dispatch and reporting progression:
  - `queued` dispatch -> mission `scheduled`
  - `assigned` / `sent` dispatch -> mission `dispatched`
  - `accepted` dispatch -> mission `running`
  - `completed` dispatch -> mission `completed`
  - ready report after completion -> mission `report_ready`
  - failed dispatch or failed reporting -> mission `failed`

The current slice also extends `GET /v1/missions/{missionId}` so mission detail can expose linked route / template / schedule / dispatch metadata for demo playback.

#### Control-Plane Web Workspaces

The web surface is intentionally split into product workspaces:

- `/control-plane`
  - dashboard summary for sites, routes, schedules, dispatch pressure, latest report, and latest anomalies
- `/sites/{siteId}`
  - site-detail workspace for map context, zones, launch points, viewpoints, and active route/template coverage
- `/control-plane/routes`
  - route library and route-creation workspace
- `/control-plane/templates`
  - template library and inspection-policy workspace
- `/control-plane/schedules`
  - schedule board and alert-coverage workspace with pause / resume / cancel / complete actions
- `/control-plane/dispatch`
  - dispatch queue and assignment workspace with handoff note, assignee, execution target, and status transitions
- `/v1/control-plane/dashboard`
  - dashboard aggregate for site coverage, route/template counts, schedule pressure, dispatch pressure, latest report/event state, recent alerts, and recent execution summaries
- `/v1/control-plane/alerts`
  - alert-center feed for mission failure, telemetry stale, low battery, bridge alerts, report failures, and dispatch blockers

`/missions/{missionId}` remains the convergence page for:

- planning
- dispatch
- execution status
- event interpretation
- evidence
- report delivery

Batch C requires mission detail to show schedule and dispatch lifecycle context without falling back to raw JSON:

- schedule next run
- schedule last run
- schedule pause reason
- dispatch accepted time
- dispatch closed time
- mission lifecycle state aligned with dispatch/report progress

Batch D adds one more convergence requirement:

- mission detail must expose an explicit `executionSummary` block with `phase`, `telemetryFreshness`, `lastTelemetryAt`, `lastImageryAt`, `reportStatus`, `eventCount`, and `failureReason`

#### Event and Report Generation

- `GET /v1/missions/{missionId}/events`
- `GET /v1/missions/{missionId}/report`
- `POST /v1/missions/{missionId}/analysis/reprocess` internal-only

These endpoints manage:

- mission-linked event summaries
- evidence artifacts
- report summary and download artifact
- internal-only reprocessing / regeneration requests

The current Batch 3 implementation is deterministic and demo-oriented:

- `mode="normal"` creates demo findings, evidence artifacts, and an HTML report
- `mode="no_findings"` creates a clean report with zero events
- `mode="analysis_failed"` records a failed report state without evidence artifacts

### Internal Ops Reporting Alignment

Internal-only support and live-ops surfaces must also consume the reporting state without becoming flight-control surfaces.

- `SupportQueueItem.category` includes `report_generation_failed`
- `SupportQueueItem.category` includes `dispatch_blocked`
- `SupportQueueItem.summary` may carry the latest report failure summary
- `LiveFlightSummary.reportStatus` mirrors the latest mission report state
- `LiveFlightSummary.reportGeneratedAt` records the latest generated timestamp
- `LiveFlightSummary.eventCount` reports the latest mission event count
- `LiveFlightSummary.reportSummary` carries the latest report summary for monitor-only triage
- `LiveFlightSummary.lastImageryAt` mirrors the latest evidence-side artifact activity
- `LiveFlightSummary.executionSummary` mirrors the mission execution read model

### Control-Plane Dashboard Contract

`GET /v1/control-plane/dashboard` should formally support:

- `siteCount`
- `activeRouteCount`
- `activeTemplateCount`
- `scheduledMissionCount`
- `dispatchPendingCount`
- `runningMissionCount`
- `failedMissionCount`
- `latestReportSummary`
- `latestEventSummary`
- `alertSummary`
- `recentAlerts`
- `recentExecutionSummaries`

`GET /v1/control-plane/alerts` returns `AlertCenterItem[]`, where each item includes:

- `alertId`
- `category`
- `severity`
- `organizationId`
- `organizationName`
- `missionId`
- `missionName`
- `siteId`
- `siteName`
- `title`
- `summary`
- `recommendedNextStep`
- `status`
- `lastObservedAt`

These additions are read-only diagnostics. They do not create any direct control path.

### Mission Contract Additions

`MissionSummary` and `MissionDetail` should formally support:

- `reportStatus`
- `reportGeneratedAt`
- `eventCount`
- `latestReport`
- `events`
- linked `route`, `template`, `schedule`, and `dispatch` metadata
- `executionSummary`

`MissionExecutionSummary` formally includes:

- `missionId`
- `phase`
- `telemetryFreshness`
- `lastTelemetryAt`
- `lastImageryAt`
- `reportStatus`
- `eventCount`
- `failureReason`

### Overview Contract Additions

`GET /v1/web/overview` should formally support:

- `scheduledMissionCount`
- `runningMissionCount`
- `failedMissionCount`
- `latestReportSummary`
- `latestEventSummary`
- `supportSummary`

## Flight Data Read APIs

### GET /v1/flights/{flightId}/events

- internal or same-org support viewers only
- returns stored event batches for replay and support

### GET /v1/flights/{flightId}/telemetry

- internal or same-org support viewers only
- returns paginated telemetry batches for blackbox-style reconstruction

## Billing

Beta billing is manual-invoice-first. No payment provider callbacks are required for launch.

### GET /v1/billing/invoices

- internal users can filter across orgs
- customer roles only see invoices from their own org
- query params:
  - `organizationId`
  - `status`
  - `dueBefore`

Allowed statuses:

- `draft`
- `issued`
- `invoice_due`
- `paid`
- `overdue`
- `void`

### POST /v1/billing/invoices

- internal only

#### Request

```json
{
  "organizationId": "org_123",
  "invoiceNumber": "TW-2026-0001",
  "currency": "TWD",
  "subtotal": 12000,
  "tax": 600,
  "total": 12600,
  "dueDate": "2026-05-01",
  "paymentInstructions": "Wire transfer",
  "attachmentRefs": [
    "inv_2026_0001.pdf"
  ],
  "notes": "Beta launch package"
}
```

### PATCH /v1/billing/invoices/{invoiceId}

- internal only
- supports status transition, payment note, receipt ref, and void reason updates

## Audit

### GET /v1/audit-log

- internal only
- query params:
  - `organizationId`
  - `actorUserId`
  - `action`
  - `cursor`

Required audited actions:

- login success/failure
- refresh/logout
- invite issue, revoke, accept
- membership or role change
- site create/update
- mission create/status change
- artifact publish
- invoice create/status change

## Compatibility Rules

- Existing Android endpoints remain supported.
- Existing artifact URLs remain supported but now require org-aware authorization for web-visible missions.
- New web-specific endpoints must not require Android changes to keep flight-critical work decoupled.
