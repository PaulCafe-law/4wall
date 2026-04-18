# Phase 1 Demo Control Plane and Reporting

## Goal

This document defines the demo-ready vertical slice added to Phase 1.

The demo story is:

`site -> route/template -> schedule -> dispatch -> mission record -> imagery -> event -> evidence -> report`

The purpose is to show:

- a credible autonomous inspection control plane
- a credible event interpretation and report generation flow
- without moving `planner-server` or `web-app` into the flight-critical loop

## Batch Status

- Batch 1 locked the contracts, demo script, and release acceptance language.
- Batch 2 lands the first operable control-plane slice:
  - `/v1/inspection/routes`
  - `/v1/inspection/templates`
  - `/v1/inspection/schedules`
  - `/v1/missions/{missionId}/dispatch`
  - `/control-plane`
  - mission-detail linkage for route / template / schedule / dispatch metadata
- Batch 3 lands the event / evidence / report slice:
  - `GET /v1/missions/{missionId}/events`
  - `GET /v1/missions/{missionId}/report`
  - `POST /v1/missions/{missionId}/analysis/reprocess` internal-only
  - mission-detail evidence gallery, report summary, and report artifact download
  - mission-list and overview reporting summaries
- Batch 4 hardens the demo flow for rehearsal and internal operations:
  - mission-detail clean-pass and analysis-failed guidance
  - overview clean-pass fallback messaging when no anomaly summary exists
  - support queue report-generation-failed category
  - live-ops reporting summary with report status, generated timestamp, event count, and report summary
  - release and rehearsal docs aligned to support/live-ops verification for reporting failures
- Batch 5 turns the slice into a repeatable rehearsal path:
  - control-plane walkthrough guidance for site -> route -> schedule -> dispatch -> report
  - explicit evidence-capture prompts for the demo package
  - a dedicated Phase 1 rehearsal script for staging and production verification
- Batch A productizes the control-plane information architecture:
  - `/control-plane` becomes a dashboard instead of one long CRUD surface
  - dedicated workspaces for routes, templates, schedules, and dispatch
  - mission detail is reorganized into planning / dispatch / execution-report sections
  - route / template / schedule / dispatch DTOs expose product-style summary metadata needed for presentation and review
- Batch B formalizes site-map context and site-linked route reuse:
  - site records now carry `SiteMap`, `SiteZone`, `LaunchPoint`, and `InspectionViewpoint` metadata
  - `/sites/{siteId}` becomes the site-detail workspace for map context, launch points, viewpoints, and active routes/templates
  - route preview, route duration, and template policy summaries are exposed directly from the site workspace
- Batch C formalizes schedule and dispatch lifecycle handling:
  - schedules persist `nextRunAt`, `lastRunAt`, `pauseReason`, and `lastOutcome` instead of deriving them ad hoc
  - the schedule workspace becomes a lifecycle board with pause / resume / cancel / complete actions
  - dispatch records persist `acceptedAt` and `closedAt`, and gain a first-class dispatch board with assignment and status transitions
  - mission state now tracks dispatch progression more explicitly: `scheduled`, `dispatched`, `running`, `completed`, `failed`, and `report_ready`
- Batch D adds shared operational read models:
  - `/v1/control-plane/dashboard` becomes the single aggregate for route/template coverage, schedule pressure, dispatch pressure, latest report/event state, recent alerts, and recent execution summaries
  - `/v1/control-plane/alerts` becomes the control-plane alert center for telemetry stale, battery low, bridge alerts, report failures, mission failures, and dispatch blockers
  - `Mission Detail`, `Support`, and `Live Ops` now consume the same `executionSummary` language instead of inferring lifecycle state per page
- Batch E hardens the product presentation layer:
  - control-plane and mission-detail copy is normalized to a single Chinese product narrative
  - every control-plane workspace now includes screenshot and next-step guidance for rehearsal
  - the rehearsal script and evidence package are rewritten around the complete product control-plane story instead of the earlier CRUD demo slice
- Batch F turns route planning into an internal-only map authority:
  - the route workspace uses Google Maps as the internal planning surface instead of a text-only demo generator
  - `customer_admin` and `customer_viewer` see route summaries, preview coverage, and duration only
  - only internal users can add, drag, delete, and reclassify waypoint markers
  - `Mission Detail` moves raw request/response JSON out of the main narrative and into an internal-only debug surface
- Batch G turns site-map context into the same internal map-authority workflow:
  - launch points and inspection viewpoints are no longer treated as static labels only
  - internal users can add, drag, relabel, and remove `LaunchPoint` and `InspectionViewpoint` markers directly on Google Maps
  - customer roles still see site context and active route overlays, but cannot edit site geometry
  - site-map geometry remains the authority for launch/viewpoint context, while route waypoints remain a separate internal planning asset
- Batch H corrects the meaning of site zones:
  - a customer-provided site center is treated as a reference point only, not as an implied inspection boundary
  - the web tier no longer auto-generates a default `inspection_boundary` polygon around every new site
  - only internal-defined polygons are rendered as `SiteZone` overlays on the site map
  - legacy placeholder boundary boxes are filtered out at read time so older staging data does not keep showing a false inspection zone

## Scope

### Control Plane

- site map and area context
- explicit inspection boundary polygons only when internal has actually defined them
- internal-only launch point and inspection viewpoint editing on top of Google Maps
- route and route-template records
- internal-only waypoint editing on top of Google Maps
- inspection schedule
- alert rules
- mission record with planning / scheduled / dispatched / running / completed / failed context
- dispatch records and assignee / execution-target metadata

### Event and Report Generation

- imagery-linked anomaly events
- evidence screenshot artifacts
- textual event summary
- mission-level report summary
- downloadable report artifact

### Supporting Surfaces

- `Overview` as the demo dashboard
- `Missions` as mission/report index
- `Mission Detail` as the core event/evidence/report page
- `Support` and `Live Ops` as internal-only supporting surfaces
  - `Support` must surface report-generation failures as first-class triage items
  - `Live Ops` must expose report freshness/state without crossing into the flight loop

## Contract-First Additions

These contracts are locked in Batch 1 even if endpoint rollout happens in later batches.

### Overview Additions

- `scheduledMissionCount`
- `runningMissionCount`
- `failedMissionCount`
- `latestReportSummary`
- `latestEventSummary`
- `supportSummary`

### Mission Additions

- `reportStatus`
- `reportGeneratedAt`
- `eventCount`
- `latestReport`
- `events`
- optional linked `route`, `template`, `schedule`, and `dispatch`

### Control Plane Contracts

- `SiteMap`
- `SiteZone`
- `LaunchPoint`
- `InspectionViewpoint`
- `InspectionWaypoint`
- `InspectionRoute`
- `InspectionTemplate`
- `InspectionAlertRule`
- `InspectionSchedule`
- `DispatchRecord`

The productized control plane also expects these summary fields even when they are derived from existing JSON state:

- `Site.siteMap`
- `Site.activeRouteCount`
- `Site.activeTemplateCount`
- `Site.activeRoutes`
- `Site.activeTemplates`
- `InspectionRoute.version`
- `InspectionRoute.previewPolyline`
- `InspectionRoute.estimatedDurationSec`
- `InspectionTemplate.evidencePolicy`
- `InspectionTemplate.reportMode`
- `InspectionTemplate.reviewMode`
- `InspectionSchedule.nextRunAt`
- `InspectionSchedule.lastRunAt`
- `InspectionSchedule.pauseReason`
- `InspectionSchedule.lastOutcome`
- `InspectionSchedule.lastDispatchedAt`
- `DispatchRecord.acceptedAt`
- `DispatchRecord.closedAt`
- `DispatchRecord.lastUpdatedAt`
- `ControlPlaneDashboard`
- `AlertCenterItem`
- `MissionExecutionSummary`

The route editor also assumes this deploy-time contract on the web tier:

- `VITE_GOOGLE_MAPS_API_KEY`

The site workspace now assumes the same deploy-time contract because site geometry is edited on the same Google Maps surface:

- `VITE_GOOGLE_MAPS_API_KEY`

### Event and Report Contracts

- `EvidenceArtifact`
- `InspectionEvent`
- `InspectionReportSummary`

### Internal Ops Contract Additions

- `SupportQueueItem.category` includes `report_generation_failed`
- `SupportQueueItem.category` includes `dispatch_blocked`
- `LiveFlightSummary.reportStatus`
- `LiveFlightSummary.reportGeneratedAt`
- `LiveFlightSummary.eventCount`
- `LiveFlightSummary.reportSummary`
- `LiveFlightSummary.lastImageryAt`
- `LiveFlightSummary.executionSummary`

## Endpoint Rollout Shape

These endpoints are Phase 1 targets. Control-plane and event/report endpoints now both have a first usable slice.

### Control Plane

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
- `GET /v1/control-plane/dashboard`
- `GET /v1/control-plane/alerts`

### Web Workspace Shape

The control plane is no longer presented as one undifferentiated form wall. Product presentation is split into:

- `/control-plane`
  - dashboard summary for site count, route/template coverage, schedule pressure, dispatch pressure, latest report, latest anomaly, and internal handoff state
- `/sites/{siteId}`
  - site-detail workspace for map context, zones, launch points, viewpoints, and active route/template coverage
- `/control-plane/routes`
  - route library and internal-only waypoint editor on top of Google Maps
- `/control-plane/templates`
  - template library and inspection policy workspace
- `/control-plane/schedules`
  - schedule board and execution-timing workspace with pause / resume / cancel / complete actions
- `/control-plane/dispatch`
  - dispatch queue and assignment workspace with accepted / completed / failed handoff transitions

`Mission Detail` remains the control-plane/report convergence page, but is intentionally split into:

- planning context
- dispatch context
- execution and reporting context
- evidence and artifact delivery
- internal-only raw-contract debugging, collapsed by default and excluded from the customer-facing narrative

Batch C adds one more requirement to that convergence page:

- schedule lifecycle and dispatch lifecycle must agree with mission status without requiring the operator to cross-check raw JSON

Batch D adds another:

- mission detail must expose a dedicated execution summary block with phase, telemetry freshness, last telemetry, last imagery, report status, event count, and failure reason

### Event and Report

- `GET /v1/missions/{missionId}/events`
- `GET /v1/missions/{missionId}/report`
- `POST /v1/missions/{missionId}/analysis/reprocess` internal-only

### Guardrails

- no direct control endpoint is added
- no continuous stick-control API is added
- dispatch means mission assignment only
- analysis and report generation remain non-flight-critical planner-server jobs
- customer users do not receive waypoint authority; they provide site context and review results, while internal users remain the route authority

## Demo Script

The minimum demo path is:

1. Open the control-plane dashboard and show current route/template/schedule/dispatch coverage plus recent alerts
2. Open the site-detail workspace and show map context, launch points, viewpoints, and active route/template coverage
3. In the site-detail workspace, show internal-only launch point / viewpoint editing on Google Maps
4. Open the route workspace and review route preview, duration, versioned planning summary, and internal-only Google Maps waypoint editing
5. Open the template workspace and review inspection policy, evidence policy, and report mode
6. Open the schedule workspace and show next run, pause reason, last outcome, and alert coverage
7. Open the dispatch workspace and show assignment, execution target, accepted/closed timing, and mission linkage
8. Open the mission record
9. Show execution summary, imagery-derived events, and evidence
10. Open the generated report summary
11. Download the report artifact
12. Cross-check the same mission state in `Support` and `Live Ops`

The repeatable rehearsal path and evidence package now live in:

- `docs/PHASE_1_DEMO_REHEARSAL_SCRIPT.md`
- `docs/PHASE_1_DEMO_EVIDENCE_TEMPLATE.md`

## Acceptance

Phase 1 demo functionality is accepted when:

- the web UI can demonstrate the full route-to-report story without explanation gaps
- the control plane reads like a real product workspace instead of a stack of unrelated forms
- the control-plane dashboard, site workspace, route workspace, schedule workspace, and dispatch workspace each produce a screenshot that can stand on its own in a plan-review deck
- the route workspace can demonstrate internal-only waypoint editing on Google Maps without exposing editing controls to customer roles
- the site workspace can demonstrate internal-only launch point and inspection viewpoint editing on Google Maps without exposing geometry controls to customer roles
- the data model is stable enough that later batches do not need to redesign route/schedule/event/report shapes
- control-plane and report surfaces stay outside the flight-critical boundary
- `Support` and `Live Ops` tell the same story as mission detail when report generation fails or produces a clean pass
- schedule cards show next run, last run, pause reason, and last outcome without inferred placeholder values
- dispatch cards show assignee, execution target, accepted time, closed time, and current handoff state
- control-plane dashboard shows alert summary, recent alerts, and recent execution summaries without re-querying overview/support/live-ops separately
- mission detail reflects dispatch lifecycle transitions directly:
  - `queued` -> mission `scheduled`
  - `assigned` / `sent` -> mission `dispatched`
  - `accepted` -> mission `running`
  - `completed` -> mission `completed`
  - ready report after mission completion -> mission `report_ready`
- failure states remain explicit:
  - no event found
  - analysis failed
  - report generation failed
  - data unavailable / monitor-only
- mission detail is presentation-safe:
  - customer users never see raw request/response JSON
  - internal users can still inspect raw contract data through an explicit collapsed debug surface
