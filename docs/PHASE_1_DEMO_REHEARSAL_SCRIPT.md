# Phase 1 Demo Rehearsal Script

## Purpose

This document defines the exact rehearsal path for the Phase 1 government-demo slice.

Use it when preparing:

- plan-review demos
- internal rehearsal runs
- staging and production evidence capture after deploy

The goal is to make the route-to-report story repeatable without hidden operator knowledge.

## Pre-Run Preconditions

- `Beta Smoke` is green for the target environment.
- One `customer_admin` account can access:
  - `Overview`
  - `Control Plane`
  - `Missions`
  - `Mission Detail`
- One internal account can access:
  - `Support`
  - `Live Ops`
- At least one site exists.
- At least one mission can be used as the demo record.

## Core Demo Story

Run the story in this order:

1. Open `Overview`
2. Open `Control Plane`
3. Show site context
4. Show route, template, and schedule
5. Dispatch a mission record
6. Open `Mission Detail`
7. Show event/evidence/report output
8. Show internal `Support` and `Live Ops` alignment

## Step-by-Step Rehearsal

### 1. Overview

Show:

- scheduled / running / failed mission cards
- latest report summary
- latest anomaly summary or clean-pass fallback
- pending actions

Capture evidence:

- one screenshot of the dashboard cards

### 2. Control Plane Site Context

Show:

- selected site
- address and coordinates
- site notes

Capture evidence:

- one screenshot of the site context card

### 3. Route / Template / Schedule

Show:

- at least one route
- at least one template
- at least one schedule
- the route-to-report walkthrough panel

Capture evidence:

- one screenshot showing route, template, and schedule cards together

### 4. Dispatch

Show:

- dispatch action on the selected mission
- linked route / template / schedule values
- dispatch target and assignee

Capture evidence:

- one screenshot of the dispatch success state

### 5. Mission Detail

Show:

- linked route / template / schedule / dispatch metadata
- delivery panel
- report summary
- evidence gallery or clean-pass state
- downloadable report artifact

Capture evidence:

- one screenshot of the linked planning metadata
- one screenshot of the report/evidence section

### 6. Internal Alignment

For internal rehearsal only, show:

- `Support` item for report-generation failure when using `analysis_failed`
- `Live Ops` report status, event count, and summary

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
- one `Overview` screenshot
- one `Control Plane` screenshot
- one dispatch screenshot
- one `Mission Detail` screenshot for normal findings
- one `Mission Detail` screenshot for clean pass
- one `Support` screenshot for report failure
- one `Live Ops` screenshot for report failure
- one downloaded HTML report artifact

## Exit Criteria

The rehearsal is complete only if:

- the walkthrough can be performed without verbal gap-filling
- the selected mission shows consistent planning metadata, report state, and evidence
- the clean-pass and failure variants both render correctly
- internal ops surfaces agree with mission detail on report-failed state
