# HQ Remote Control MVP Architecture

## Goal

Allow headquarters staff to monitor and, when policy allows, operate a site deployment from a computer without moving the web platform into the flight-critical loop.

This document describes the target architecture only. Delivery sequencing is governed by [SPRINT_4_LAUNCH_READINESS_AND_REMOTE_OPS_SEQUENCING.md](./SPRINT_4_LAUNCH_READINESS_AND_REMOTE_OPS_SEQUENCING.md), and the current release gate is still Sprint 4 launch readiness.

## Product Shape

The MVP is a four-part system:

1. `web-app`
   - customer and ops portal
   - mission planning, waypoint editing before flight, live monitoring, support, audit
2. `Site Control Station`
   - Windows console deployed at the customer site
   - the only desktop surface that may expose manual flight controls
3. `Android Bridge`
   - local DJI link owner and safety arbiter
   - telemetry/video uplink and control lease enforcement
4. `AnyDesk`
   - headquarters access into the Site Control Station
   - remote screen and input only

The first supported operator for this MVP is internal pilot / ops / support. Customer users may observe status and artifacts, but they do not receive remote flight-control authority in this phase.

## Control Boundary

- `web-app`
  - may display live telemetry, map position, video metadata, alerts, and control status
  - may request high-level control intents
  - may not issue continuous flight controls
- `Site Control Station`
  - may expose mission-level controls, camera controls, and manual flight controls
  - must route every control path through Android Bridge
- `Android Bridge`
  - validates link health, freshness, control lease, observer readiness, and safety policy
  - may downgrade to monitor-only, HOLD, or RTH
- `AnyDesk`
  - never decides whether control is safe
  - never bypasses control lease or safety gates

## MVP Remote Control Preconditions

Remote control may be enabled only when all of these are true:

- aircraft connected
- RC connected
- Android Bridge healthy
- Site Control Station healthy
- telemetry freshness within threshold
- video freshness within threshold
- network quality within threshold
- control lease granted
- on-site observer acknowledged

If any precondition fails, the system must:

- revoke remote control
- downgrade to monitor-only
- or enter `HOLD` / `RTH` according to bridge policy

## Event and Telemetry Conventions

The MVP reuses existing `FlightEvent` and `TelemetryBatch` storage.

### Telemetry sample shape

Existing telemetry batches remain the primary source for:

- position
- altitude
- speed
- battery
- flight state
- corridor deviation

### New bridge event conventions

The Android Bridge should emit these event types via existing `/v1/flights/{flightId}/events`:

- `CONTROL_LEASE_UPDATED`
  - payload:
    - `holder`: `local_operator` | `hq_remote` | `released`
    - `mode`: `monitor_only` | `remote_control_requested` | `remote_control_active`
    - `remoteControlEnabled`: boolean
    - `observerReady`: boolean
    - `heartbeatHealthy`: boolean
    - `expiresAt`: ISO timestamp or `null`
- `VIDEO_STREAM_STATE`
  - payload:
    - `available`: boolean
    - `streaming`: boolean
    - `viewerUrl`: string or `null`
    - `codec`: string or `null`
    - `latencyMs`: integer or `null`
    - `lastFrameAt`: ISO timestamp or `null`
- `BRIDGE_ALERT`
  - payload:
    - `severity`: `info` | `warning` | `critical`
    - `code`: string
    - `summary`: string
- `CONTROL_INTENT_ACKNOWLEDGED`
  - payload:
    - `requestId`: audit event id from the requested control intent
    - `status`: `accepted` | `rejected` | `superseded`
    - `reason`: string or `null`

## Control Intent Model

The web platform may request only high-level intents:

- `request_remote_control`
- `release_remote_control`
- `pause_mission`
- `resume_mission`
- `hold`
- `return_to_home`

These intents are stored and audited server-side, then acknowledged by the bridge. They are not direct flight commands.

## MVP Non-Goals

- browser-direct aircraft control
- server-issued stick control
- continuous remote manual control over the public web stack
- mid-flight global reroute from the web portal
- treating AnyDesk as the safety system
