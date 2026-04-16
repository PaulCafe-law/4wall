# Phase 1 Operable Product Gap Analysis

## Goal

Phase 1 is the shortest path from the current beta to a product that can be repeatedly operated for real customers.

This phase does not attempt full self-serve SaaS or a complete internal remote-ops platform.
It finishes the operational skeleton so later phases can build on a stable base.

## Current State

The current `main` branch already has:

- invite-only web auth
- sites, missions, mission detail, artifacts, billing, team, audit
- internal-only `Live Ops` and `Support`
- basic release docs, Render topology, and smoke coverage
- a single `overview` aggregate read path for daily landing-page data
- mission list/detail delivery metadata with explicit `planning / ready / failed / published` states

The main remaining gaps are product usability and operational completeness, not foundational stack creation.

## Required Phase 1 Outcomes

### Customer Daily Workflow

- `Overview` must become the real home screen
- show pending missions, latest artifacts, overdue invoices, pending invites, and visible exceptions
- make it obvious what the customer should do next

### Mission Delivery Surface

- mission detail must distinguish `planning`, `ready`, `failed`, and `published`
- artifact publication state needs explicit timestamps and failure reasons
- artifact panel must feel like product delivery, not a debug dump

### Team and Organization Management

- customer team management must cover organization settings, members, pending invites, role management, and membership activation
- internal org view must keep cross-tenant support context without leaking customer-only language into the customer UI

### Internal Ops Workspaces

- `Support` must include mission context, org context, severity, and recommended next step
- `Support` should also expose last-observed timing and simple filters so triage is usable under load
- `Live Ops` must stay internal-only and present explicit telemetry freshness, video availability, and monitor-only behavior when bridge data is unavailable

### Release Readiness

- staging and production acceptance must live in one release checklist
- smoke, deploy, rollback, and evidence collection must agree with the current Render model

## Subsystem Gaps

| Area | Current State | Phase 1 Target | Gap |
|---|---|---|---|
| Overview | Backend aggregate and daily landing page now exist | Useful customer and internal daily landing page | Still needs deeper prioritization, reminders, and more polished empty states |
| Mission delivery | Mission list/detail now expose delivery state, publish time, and failure reason | Delivery-oriented artifact panel with clear publish state | Still missing artifact history, release notes, and customer-facing delivery summaries beyond the current mission |
| Team management | Team reads, invites, org rename, role management, member activation, invite resend, and clearer pending-invite state now exist | Customer self-service org settings, member role management, membership activation, and invite management | Still needs final polish on invite feedback loops and clearer customer guidance around role changes |
| Support queue | Internal-only queue includes mission/org/site context, severity, last-observed timing, and recommended next steps | Mission-centered support workspace | Still needs assignment state and handling workflow, not just triage context |
| Live Ops | Internal-only monitoring now exposes telemetry freshness, video availability, lease state, and control-intent history | Stable monitoring surface with explicit monitor-only degradation | Still needs richer incident history and stronger Android-backed freshness guarantees once the upstream contract hardens |
| Release process | Dual-role smoke and one checklist now exist | One coherent release checklist and acceptance path | Still depends on disciplined manual evidence capture after each deploy |

## Phase 1 Deliverables

- customer-facing overview improvements
- mission delivery / artifact publication state improvements
- team and org workflow polish, including member management
- support and live-ops usability hardening, including triage filters and monitor-only diagnostics
- unified release checklist and deployment evidence template

## Acceptance

Phase 1 is complete when:

- customers can start from overview, find work, and complete the mission-delivery flow without guidance
- internal users can triage support issues with enough mission/org context to act
- artifact states and failure explanations are understandable to non-engineers
- release validation can be executed from a single checklist without guessing which docs are authoritative

## Out of Scope for Phase 1

- open self-serve signup
- hosted payments as the primary billing flow
- customer remote control
- browser-direct flight control
- Site Control Station delivery

