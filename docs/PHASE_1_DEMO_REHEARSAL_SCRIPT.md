# Phase 1 Demo Rehearsal Script

## Purpose

This document defines the exact rehearsal path for the Phase 1 government-demo slice.

Use it when preparing:

- plan-review demos
- internal rehearsal runs
- staging and production evidence capture after deploy

The goal is to make the complete product control-plane story repeatable without hidden operator knowledge.

After a successful run, record the output in:

- `docs/PHASE_1_DEMO_EVIDENCE_TEMPLATE.md`

## Pre-Run Preconditions

- `Beta Smoke` is green for the target environment.
- One `customer_admin` account can access:
  - `Control Plane`
  - `Sites`
  - `Missions`
  - `Mission Detail`
- One internal account can access:
  - Google Maps waypoint editor in `Control Plane > Routes`
  - `Support`
  - `Live Ops`
- At least one site exists.
- At least one route, template, schedule, and dispatch-capable mission exist for the selected site.

## Core Demo Story

Run the story in this order:

1. Open the `Control Plane` dashboard
2. Open the site workspace and show map context
3. Open the route workspace
4. Open the template workspace
5. Open the schedule workspace
6. Open the dispatch workspace
7. Open `Mission Detail`
8. Show event/evidence/report output
9. Show internal `Support` and `Live Ops` alignment

## Step-by-Step Rehearsal

### 1. Control Plane Dashboard

Show:

- site / route / template / schedule / dispatch coverage
- recent alerts
- recent execution summaries
- latest report summary
- latest anomaly summary or clean-pass fallback

Capture evidence:

- one screenshot of the control-plane dashboard cards
- one screenshot that includes recent alerts and recent execution summaries

### 2. Site Workspace

Show:

- selected site
- address and coordinates
- site-map version, zones, launch points, viewpoints
- internal-only launch-point and viewpoint editing on Google Maps
- active route/template coverage
- Google Maps map context if rehearsing with an internal account

Capture evidence:

- one screenshot of the site workspace

### 3. Route Workspace

Show:

- at least one route
- route version
- estimated duration
- preview polyline or route summary
- internal-only Google Maps waypoint editor
- at least one waypoint add/drag/edit interaction if rehearsing with an internal account

Capture evidence:

- one screenshot of the route workspace

### 4. Template Workspace

Show:

- at least one template
- inspection policy
- evidence policy
- report mode

Capture evidence:

- one screenshot of the template workspace

### 5. Schedule Workspace

Show:

- at least one schedule
- next run
- pause reason
- last outcome
- alert coverage

Capture evidence:

- one screenshot of the schedule workspace

### 6. Dispatch Workspace

Show:

- dispatch action on the selected mission
- linked route / template / schedule values
- dispatch target and assignee
- accepted / completed / failed transitions if available

Capture evidence:

- one screenshot of the dispatch queue
- one screenshot of the dispatch board

### 7. Mission Detail

Show:

- linked route / template / schedule / dispatch metadata
- execution summary
- delivery panel
- report summary
- evidence gallery or clean-pass state
- downloadable report artifact
- internal-only raw-contract debug surface only if you explicitly need to verify request/response

Capture evidence:

- one screenshot of the linked planning metadata
- one screenshot of the report/evidence section

### 8. Internal Alignment

For internal rehearsal only, show:

- `Support` item for report-generation failure when using `analysis_failed`
- `Support` item for `dispatch_blocked` if a dispatch handoff is intentionally left incomplete
- `Live Ops` report status, execution summary, event count, and summary

Capture evidence:

- one screenshot of `Support`
- one screenshot of `Live Ops`

## Required Variants

Rehearse both of these mission outcomes:

### Event-Backed Report

- run normal analysis
- show event count > 0
- show evidence artifacts
- show downloadable report

### Clean-Pass Report

- run `no_findings`
- show event count = 0
- show no anomaly event
- show report summary as clean pass

### Failure Variant

- run `analysis_failed`
- show explicit failure reason
- confirm `Support` and `Live Ops` surface the failure consistently

## Evidence Package

Keep the following artifacts after rehearsal:

- environment name
- commit SHA
- one `Control Plane` dashboard screenshot
- one site workspace screenshot
- one route workspace screenshot
- one template workspace screenshot
- one schedule workspace screenshot
- one dispatch queue screenshot
- one dispatch board screenshot
- one `Mission Detail` screenshot for normal findings
- one `Mission Detail` screenshot for clean pass
- one `Support` screenshot for report failure
- one `Live Ops` screenshot for report failure
- one downloaded HTML report artifact

Record those references in:

- `docs/PHASE_1_DEMO_EVIDENCE_TEMPLATE.md`

## Exit Criteria

The rehearsal is complete only if:

- the walkthrough can be performed without verbal gap-filling
- customer roles never see waypoint editing controls or raw contract JSON
- the selected mission shows consistent planning metadata, report state, and evidence
- the clean-pass and failure variants both render correctly
- internal ops surfaces agree with mission detail on report-failed state
