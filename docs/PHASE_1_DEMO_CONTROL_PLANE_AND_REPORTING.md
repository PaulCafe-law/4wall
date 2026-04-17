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

## Scope

### Control Plane

- site map and area context
- route and route-template records
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

- `InspectionWaypoint`
- `InspectionRoute`
- `InspectionTemplate`
- `InspectionAlertRule`
- `InspectionSchedule`
- `DispatchRecord`

The productized control plane also expects these summary fields even when they are derived from existing JSON state:

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
- `DispatchRecord.acceptedAt`
- `DispatchRecord.closedAt`

### Event and Report Contracts

- `EvidenceArtifact`
- `InspectionEvent`
- `InspectionReportSummary`

### Internal Ops Contract Additions

- `SupportQueueItem.category` includes `report_generation_failed`
- `LiveFlightSummary.reportStatus`
- `LiveFlightSummary.reportGeneratedAt`
- `LiveFlightSummary.eventCount`
- `LiveFlightSummary.reportSummary`

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
- `POST /v1/missions/{missionId}/dispatch`

### Web Workspace Shape

The control plane is no longer presented as one undifferentiated form wall. Product presentation is split into:

- `/control-plane`
  - dashboard summary for site count, route/template coverage, schedule pressure, dispatch pressure, latest report, latest anomaly, and internal handoff state
- `/control-plane/routes`
  - route library and route creation workspace
- `/control-plane/templates`
  - template library and inspection policy workspace
- `/control-plane/schedules`
  - schedule board and execution-timing workspace
- `/control-plane/dispatch`
  - dispatch queue and assignment workspace

`Mission Detail` remains the control-plane/report convergence page, but is intentionally split into:

- planning context
- dispatch context
- execution and reporting context
- evidence and artifact delivery

### Event and Report

- `GET /v1/missions/{missionId}/events`
- `GET /v1/missions/{missionId}/report`
- `POST /v1/missions/{missionId}/analysis/reprocess` internal-only

### Guardrails

- no direct control endpoint is added
- no continuous stick-control API is added
- dispatch means mission assignment only
- analysis and report generation remain non-flight-critical planner-server jobs

## Demo Script

The minimum demo path is:

1. Select an existing site or create a site-map record
2. Open the control-plane dashboard and show current route/template/schedule/dispatch coverage
3. Open the route workspace and review the route preview and planning summary
4. Open the template workspace and review evidence/report policy
5. Open the schedule workspace and show execution timing and alert coverage
6. Open the dispatch workspace and assign a mission
7. Open the mission record
8. Show imagery-derived events and evidence
9. Open the generated report summary
10. Download the report artifact

The repeatable rehearsal path and evidence package now live in:

- `docs/PHASE_1_DEMO_REHEARSAL_SCRIPT.md`
- `docs/PHASE_1_DEMO_EVIDENCE_TEMPLATE.md`

## Acceptance

Phase 1 demo functionality is accepted when:

- the web UI can demonstrate the full route-to-report story without explanation gaps
- the control plane reads like a real product workspace instead of a stack of unrelated forms
- the data model is stable enough that later batches do not need to redesign route/schedule/event/report shapes
- control-plane and report surfaces stay outside the flight-critical boundary
- `Support` and `Live Ops` tell the same story as mission detail when report generation fails or produces a clean pass
- failure states remain explicit:
  - no event found
  - analysis failed
  - report generation failed
  - data unavailable / monitor-only
