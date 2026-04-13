# Full Product Roadmap

## Goal

Move from the current invite-only desktop beta to a complete product with two equal product lanes:

- customer-facing multi-tenant SaaS for contractors
- internal ops console for cross-customer support, monitoring, planning, and mission-level control intents

This roadmap preserves the current safety boundary:

- Android remains the only flight-critical runtime
- `planner-server` and `web-app` never enter the active flight-control loop
- remote ops in this product line stops at planning, monitoring, and mission-level control intents

## End State

The product is complete only when all of these are true:

- customers can self-serve account creation, organization setup, team management, sites, mission requests, artifact delivery, billing, and notifications
- internal users can inspect every customer, mission, alert, invoice exception, and audit trail from one ops console
- internal users can remotely plan waypoints and send mission-level control intents without taking ownership of manual flight control
- every live surface fails closed when telemetry, video, bridge health, or planner availability is stale or unavailable
- staging and production deploys are repeatable, observable, smoke-tested, and reversible

## Product Lanes

### Customer SaaS

- self-serve account lifecycle
- organization and team administration
- site and mission workflows
- artifact delivery and customer-facing failure explanations
- subscription, billing, and notifications

### Internal Ops

- cross-tenant mission and support visibility
- live ops monitoring
- support queue and incident handling
- mission-level remote control intents
- audit, compliance, and exception management

## Delivery Phases

### Phase 1: Operable Product Skeleton

Turn the current beta into a stable operational product.

- make `Overview` the real daily landing page for customers and internal users
- upgrade mission detail into a delivery surface with clearer artifact state and failure explanations
- complete customer team management and internal org support flows
- make `Support` and `Live Ops` useful operational workspaces, not placeholder lists
- unify release docs, smoke checks, staging/prod acceptance, and rollback evidence

### Phase 2: SaaS Core

Remove the dependence on invite-only and manual commercial operations.

- add signup, email verification, password reset, organization create/join, and invite resend/revoke
- introduce subscription and hosted billing flows
- add billing profile, payment method, tax/receipt profile, and notification preferences
- keep manual invoices only for enterprise or exception paths
- harden multi-tenant auth, rate limits, idempotency, and audit around self-serve entry points

### Phase 3: Internal Ops Console

Make the internal console a real daily driver.

- formalize live flight session list, telemetry freshness, video metadata, and lease state
- expand support queue with failed missions, telemetry stale, low battery, artifact failure, bridge alerts, and billing exceptions
- keep internal-only control intents limited to mission-level actions
- add cross-tenant remote planning workflows for waypoints, viewpoints, and planning inputs
- ensure every control and override path is audited and attached to an incident timeline

### Phase 4: Trust, Delivery, and Scale

Close the product gaps that separate a usable system from a complete one.

- add artifact history, delivery summary, release notes, and customer-visible failure explanations
- add mission, site, billing, and incident history exports
- add deploy canary, health dashboard, alert routing, and rollback criteria
- finalize role matrix, support-access policy, audit retention, and billing mutation controls
- polish onboarding, help content, empty states, and language separation between customer and internal surfaces

## Interfaces to Add or Formalize

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

### Mission Delivery

- artifact publication state
- artifact published timestamp
- artifact failure reason
- delivery summary for customer-facing mission views

### Live Ops

- flight session summary
- telemetry freshness and availability
- video channel metadata
- support alert feed
- control intent and acknowledgement timeline

### Android Contract

The Android thread remains the implementation owner, but this roadmap requires stable event contracts for:

- control lease updates
- video stream state
- bridge alerts
- control intent acknowledgements

## Acceptance Standard

The product is not accepted on UI polish alone. These flows must pass:

- customer SaaS: signup -> verify -> create org -> invite team -> create site -> create mission -> artifact published -> pay invoice
- customer isolation: `customer_viewer` stays read-only and cross-org access stays blocked
- internal ops: `ops` / `platform_admin` can inspect live status, support queue, and audit without cross-tenant leakage
- artifact integrity: advertised checksums match downloaded content and unauthorized access fails
- notifications: invite, artifact ready, mission failed, invoice due, and payment failure are deterministic
- failure handling: stale telemetry, missing video, bridge alerts, and planner outages degrade to unavailable or monitor-only states
- deploy: staging smoke, production smoke, canary, and rollback evidence are recorded for each release

## Explicit Non-Goals

- customer remote flight control
- browser-direct flight control
- manual flight control from `web-app`
- moving `planner-server` or `web-app` into the flight-critical loop
- treating AnyDesk or any remote desktop tool as the safety system

