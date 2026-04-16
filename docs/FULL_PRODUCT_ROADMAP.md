# Full Product Roadmap

## Goal

Move from the current beta to a complete product with two equal product lanes:

- customer-facing multi-tenant SaaS for contractors and reviewers
- internal ops console for cross-customer support, monitoring, planning, dispatch, and mission-level control intents

This roadmap preserves the current safety boundary:

- Android remains the only flight-critical runtime
- `planner-server` and `web-app` never enter the active flight-control loop
- remote ops in this product line stops at planning, monitoring, scheduling, dispatch, and mission-level control intents

## End State

The product is complete only when all of these are true:

- customers can self-serve account creation, organization setup, team management, sites, inspection routes, mission requests, report delivery, billing, and notifications
- internal users can inspect every customer, mission, alert, invoice exception, event, report, and audit trail from one ops console
- internal users can manage inspection control-plane data, dispatch work, and review generated events and reports without taking ownership of manual flight control
- every live surface fails closed when telemetry, video, bridge health, or planner availability is stale or unavailable
- staging and production deploys are repeatable, observable, smoke-tested, and reversible

## Product Lanes

### Customer SaaS

- self-serve account lifecycle
- organization and team administration
- site and inspection mission workflows
- event evidence, report delivery, and customer-facing failure explanations
- subscription, billing, and notifications

### Internal Ops

- cross-tenant mission, event, and support visibility
- inspection control plane for map, route, schedule, and dispatch management
- live ops monitoring
- support queue and incident handling
- mission-level remote control intents
- audit, compliance, and exception management

## Delivery Phases

### Phase 1: Demo-Ready Operable Product RC

Turn the current beta into a government-demo-ready vertical slice with two headline capabilities:

- an inspection control plane for site maps, routes, schedules, alerts, mission records, and dispatch
- an event interpretation and report generation system that turns mission imagery into anomaly events, evidence screenshots, summaries, and downloadable reports

Phase 1 also keeps the existing product skeleton usable:

- make `Overview` the real demo dashboard for customers and internal users
- upgrade mission detail into the core event / evidence / report surface
- keep customer team management, billing clarity, `Support`, and `Live Ops` operational enough to support the demo story
- unify release docs, smoke checks, staging/prod acceptance, and rollback evidence

### Phase 2: SaaS Core

Remove the dependence on invite-only and manual commercial operations.

- add signup, email verification, password reset, organization create/join, and invite resend/revoke polish
- introduce subscription and hosted billing flows
- add billing profile, payment method, tax/receipt profile, and notification preferences
- keep manual invoices only for enterprise or exception paths
- harden multi-tenant auth, rate limits, idempotency, and audit around self-serve entry points

### Phase 3: Internal Ops Console

Make the internal console a real daily driver.

- formalize live flight session list, telemetry freshness, video metadata, and lease state
- expand support queue with failed missions, telemetry stale, low battery, artifact failure, bridge alerts, analysis failures, and billing exceptions
- keep internal-only control intents limited to mission-level actions
- add cross-tenant remote planning workflows for waypoints, viewpoints, route templates, schedules, and dispatch inputs
- ensure every control, dispatch, and override path is audited and attached to an incident timeline

### Phase 4: Trust, Delivery, and Scale

Close the product gaps that separate a usable system from a complete one.

- add report and artifact history, delivery summaries, release notes, and customer-visible failure explanations
- add mission, site, billing, event, report, and incident history exports
- add deploy canary, health dashboard, alert routing, and rollback criteria
- finalize role matrix, support-access policy, audit retention, and billing mutation controls
- polish onboarding, help content, empty states, and language separation between customer and internal surfaces

## Interfaces to Add or Formalize

### Control Plane

- site map and area metadata
- inspection route and route-template contracts
- schedule definition and status
- alert configuration
- dispatch records and assignment metadata

### Event and Report Generation

- event summary, severity, and lifecycle status
- evidence artifact descriptors
- report summary and downloadable report artifact
- mission-level report status and event count

### Auth and Account

- signup
- email verification
- password reset
- organization create/join
- invite accept/revoke/resend

### Billing

- subscription status
- hosted checkout / billing portal handoff
- payment method summary
- invoice settlement state
- payment webhook processing

### Live Ops

- flight session summary
- telemetry freshness and availability
- video channel metadata
- support alert feed
- control intent and acknowledgement timeline

### Android Contract

The Android thread remains the implementation owner, but this roadmap requires stable upstream contracts for:

- control lease updates
- video stream state
- bridge alerts
- control intent acknowledgements
- mission imagery and execution metadata that can be associated with non-flight-critical event/report generation

## Acceptance Standard

The product is not accepted on UI polish alone. These flows must pass:

- demo path: site -> route/template -> schedule -> dispatch -> mission record -> imagery -> event generation -> evidence -> report download
- customer SaaS: signup -> create org -> invite team -> create site -> create mission -> receive report delivery
- customer isolation: `customer_viewer` stays read-only and cross-org access stays blocked
- internal ops: `ops` / `platform_admin` can inspect live status, support queue, reports, and audit without cross-tenant leakage
- artifact integrity: advertised checksums match downloaded content and unauthorized access fails
- notifications: invite, report ready, mission failed, invoice due, and payment failure are deterministic
- failure handling: stale telemetry, missing video, bridge alerts, analysis failures, and planner outages degrade to unavailable or monitor-only states
- deploy: staging smoke, production smoke, canary, and rollback evidence are recorded for each release

## Explicit Non-Goals

- customer remote flight control
- browser-direct flight control
- manual flight control from `web-app`
- moving `planner-server` or `web-app` into the flight-critical loop
- treating AnyDesk or any remote desktop tool as the safety system
