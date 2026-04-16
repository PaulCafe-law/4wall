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
- Batch 3 remains the event / evidence / report slice.

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

### Event and Report Contracts

- `EvidenceArtifact`
- `InspectionEvent`
- `InspectionReportSummary`

## Endpoint Rollout Shape

These endpoints are Phase 1 targets. Control-plane endpoints now have a first usable slice; event/report endpoints remain pending.

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
2. Open a route/template
3. Show schedule and alert rules
4. Dispatch a mission
5. Open the mission record
6. Show imagery-derived events and evidence
7. Open the generated report summary
8. Download the report artifact

## Acceptance

Phase 1 demo functionality is accepted when:

- the web UI can demonstrate the full route-to-report story without explanation gaps
- the data model is stable enough that later batches do not need to redesign route/schedule/event/report shapes
- control-plane and report surfaces stay outside the flight-critical boundary
- failure states remain explicit:
  - no event found
  - analysis failed
  - report generation failed
  - data unavailable / monitor-only
