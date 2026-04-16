# Phase 1 Demo-Ready Operable Product Gap Analysis

## Goal

Phase 1 is the shortest path from the current beta to a product that can be shown credibly in a government or plan-review demo.

This phase does not attempt full SaaS completeness or a production-grade internal remote-ops platform.
It delivers one demo-ready vertical slice with two headline capabilities:

- an inspection control plane
- an event interpretation and report generation system

## Current State

The current `main` branch already has:

- invite-aware web auth and self-serve signup
- sites, missions, mission detail, artifacts, billing, team, audit
- internal-only `Live Ops` and `Support`
- basic release docs, Render topology, and smoke coverage
- a single `overview` aggregate read path for daily landing-page data
- mission list/detail delivery metadata with explicit `planning / ready / failed / published` states
- a first control-plane slice with route, template, schedule, and dispatch records plus a `/control-plane` web surface
- mission detail linkage for route / template / schedule / dispatch metadata

The main gap is no longer basic web scaffolding. The main gap is that the product still lacks the demo-critical story:

`site -> route/template -> schedule -> dispatch -> imagery -> event -> evidence -> report`

## Required Phase 1 Outcomes

### Inspection Control Plane

- sites must behave like demo-ready site-map records, not just address books
- web must expose route and route-template concepts for inspection planning
- web must expose schedule, alert, and dispatch metadata without entering the flight loop
- mission records must clearly show planned, scheduled, dispatched, running, completed, and failed operational context

### Event Interpretation and Report Generation

- mission detail must show event count, report status, evidence, and report summary
- planner-server must own a non-flight-critical analysis/reporting contract
- report output must be visible on the web and downloadable as a mission artifact
- analysis failures must surface as explicit customer-facing and internal-facing states

### Demo Dashboard and Delivery Surface

- `Overview` must become a demo dashboard, not just a generic landing page
- it must show scheduled/running/failed work, latest events, latest report state, and support summary
- `Mission Detail` must become the core event / evidence / report surface

### Supporting Product Workflows

- team and organization flows must remain usable for demo operators and reviewers
- billing must stay clear enough to not distract from the demo narrative
- `Support` and `Live Ops` must stay internal-only and provide context around the new event/report flow

### Release Readiness

- staging and production acceptance must live in one release checklist
- smoke, deploy, rollback, and evidence collection must agree with the current Render model
- demo-specific manual verification must be written down before feature work lands

## Subsystem Gaps

| Area | Current State | Phase 1 Target | Gap |
|---|---|---|---|
| Overview | Overview aggregate and daily landing page exist | Demo dashboard for scheduled/running/failed missions, latest events, latest reports, and support state | Missing event/report summaries and stronger demo-oriented prioritization |
| Inspection control plane | Sites, mission request workflow, first-class route/template/schedule/dispatch models, and an initial `/control-plane` UI slice exist | Site-map, route/template, schedule, alert, mission-record, and dispatch surface | Still needs stronger map presentation, editing flows, and tighter demo guidance around route -> schedule -> dispatch progression |
| Mission delivery | Mission list/detail expose delivery state, publish time, failure reason, artifact metadata, customer-facing delivery copy, and explicit next-step guidance | Delivery-oriented event / evidence / report surface | Missing report status, event count, report artifacts, and evidence gallery |
| Event interpretation and reporting | Artifacts and audit exist, but there is no event/report product flow | Mission-linked anomaly events, evidence screenshots, summaries, and downloadable reports | No contract, no web surface, no demo-ready reporting pipeline |
| Team management | Team reads, invites, org rename, role management, member activation, invite resend, and clearer pending-invite state exist | Support demo operator setup and reviewer access cleanly | Still needs polish on invite feedback loops and guidance |
| Support queue | Internal-only queue includes mission/org/site context, severity, last-observed timing, recommended next steps, and handling workflow state | Triage surface that understands analysis/report failures as first-class cases | Needs new categories and cross-linking into report/event workflows |
| Live Ops | Internal-only monitoring exposes telemetry freshness, video availability, lease state, and control-intent history | Stable monitor-only surface that complements the demo | Still needs alignment with new dispatch/reporting story and stronger incident context |
| Release process | Dual-role smoke and one checklist exist | One coherent release and demo acceptance path | Still missing demo-specific manual evidence capture for route/schedule/report flows |

## Phase 1 Deliverables

- roadmap, gap analysis, and release docs rewritten around the control-plane + event/report demo story
- first-class contracts for route/template, schedule, dispatch, event, evidence, and report data
- overview and mission contract additions for event/report summaries
- control-plane UI/API slices for site map, route/template, schedule, and dispatch
- event/report UI/API slices for event list, evidence gallery, report summary, and report artifact download
- updated support/live-ops diagnostics aligned with event/report failures
- preserve existing Phase 1 product polish on setup guidance, billing reminders, and next-step UX where it supports the demo story

## Acceptance

Phase 1 is complete when:

- a demo operator can configure a site, route/template, schedule, and dispatch record from the web
- the control-plane slice can be rehearsed without hidden operator knowledge:
  - select a site
  - create route/template/schedule
  - dispatch a mission
  - open mission detail and confirm linked planning metadata
- a completed mission can show event count, evidence, summary, and downloadable report output
- overview, missions, mission detail, support, and live ops all tell the same story for one mission lifecycle
- customers and reviewers can understand the output without engineering translation
- release validation and demo rehearsal can be executed from a single checklist without guessing which docs are authoritative

## Out of Scope for Phase 1

- open SaaS completion beyond the current self-serve foundation
- hosted payments as the primary billing flow
- customer remote control
- browser-direct flight control
- Site Control Station delivery
- production-grade autonomous anomaly analysis beyond the demo-ready vertical slice
