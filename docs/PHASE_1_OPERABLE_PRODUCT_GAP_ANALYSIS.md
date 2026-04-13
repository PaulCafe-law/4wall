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

- customer team management must cover members, pending invites, and role visibility
- internal org view must keep cross-tenant support context without leaking customer-only language into the customer UI

### Internal Ops Workspaces

- `Support` must include mission context, org context, severity, and recommended next step
- `Live Ops` must stay internal-only and present clear monitor-only behavior when bridge data is unavailable

### Release Readiness

- staging and production acceptance must live in one release checklist
- smoke, deploy, rollback, and evidence collection must agree with the current Render model

## Subsystem Gaps

| Area | Current State | Phase 1 Target | Gap |
|---|---|---|---|
| Overview | Page exists, but still light as a true home screen | Useful customer and internal daily landing page | Missing task prioritization, reminders, and exception summarization |
| Mission delivery | Mission detail shows request/response and artifact links | Delivery-oriented artifact panel with clear publish state | Missing publication state, timestamps, and customer-facing failure explanation |
| Team management | Team read flows exist | Customer self-service team visibility and invite management | Missing stronger self-serve coordination cues and full invite lifecycle polish |
| Support queue | Internal-only queue exists | Mission-centered support workspace | Missing richer context, triage actions, and operator next-step language |
| Live Ops | Internal-only monitoring exists | Stable monitoring surface with explicit monitor-only degradation | Missing stronger empty, stale, and unavailable states tied to Android prerequisites |
| Release process | Docs and smoke exist across multiple files | One coherent release checklist and acceptance path | Missing single source of truth for release verification |

## Phase 1 Deliverables

- customer-facing overview improvements
- mission delivery / artifact publication state improvements
- team and org workflow polish
- support and live-ops usability hardening
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

