# HQ Remote Control MVP Gap Analysis

## Current State

The repo already has:

- mission planning and artifact generation
- invite-only customer web portal
- flight event ingestion
- telemetry batch ingestion
- Android-side upload path for flight events and telemetry
- customer/internal role separation

The repo does not yet have:

- a live monitoring product surface in `web-app`
- a control lease model
- a high-level control intent workflow
- a support queue derived from live flight state
- a Site Control Station product
- Android Bridge contracts for remote-control gating and video state uplink

## MVP Gaps

### Web App

Missing:

- `Live Ops` page
- support queue page
- control intent request UI
- flight status cards with telemetry, video state, and lease state
- mission-preflight waypoint editing workflow

### Planner Server

Missing:

- live flight summary API
- support queue API
- control intent log API
- flight detail API that materializes latest telemetry, video state, and control lease from existing event/telemetry records

### Android Bridge

Missing:

- explicit bridge interface for control lease
- explicit bridge interface for remote-control enable/disable
- explicit bridge interface for video channel status uplink
- explicit bridge interface for control intent acknowledgement

### Site Control Station

Missing entirely:

- product folder
- architecture
- UI shell
- local map/video/control surfaces
- AnyDesk runbook

## MVP Delivery Recommendation

### Phase 1

Ship inside this repo:

- docs
- planner-server live ops and support APIs
- web live ops and support UI
- Android Bridge interfaces and payload conventions

### Phase 2

Ship as a new product surface:

- Site Control Station Windows app
- local control UI
- AnyDesk operational SOP

## Release Sequencing Decision

This MVP is **post-Sprint-4 work**.

It is not part of the current launch-readiness gate. The release-critical path remains:

- simulator validation
- failsafe UI
- blackbox export
- field procedures
- launch-readiness verification

Use [SPRINT_4_LAUNCH_READINESS_AND_REMOTE_OPS_SEQUENCING.md](./SPRINT_4_LAUNCH_READINESS_AND_REMOTE_OPS_SEQUENCING.md) as the delivery-order source of truth.

## Hard Boundaries

These stay unchanged in MVP:

- Android remains flight-critical
- planner-server stays outside the active control loop
- web-app stays outside the active control loop
- AnyDesk is a transport layer, not a safety boundary
