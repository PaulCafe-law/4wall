# Web Thread Android Handoff

## Purpose

This document defines what `web-app` and `planner-server` expect from Android without making Android implementation part of this thread.

The boundary is strict:

- this thread owns web, planner, docs, deploy, and smoke surfaces
- Android owns DJI integration, device runtime, and field behavior
- if Android is not ready, web must fail closed instead of inventing substitute control paths

## Required Upstream Contract

Android must publish the following data through existing server-facing interfaces before `Live Ops` can move beyond placeholder states.

### Flight Events

Expected event types:

- `CONTROL_LEASE_UPDATED`
- `VIDEO_STREAM_STATE`
- `BRIDGE_ALERT`
- `CONTROL_INTENT_ACKNOWLEDGED`

Minimum event shape:

- `eventId`
- `type`
- `timestamp`
- `payload`

### Telemetry

Web/planner expect telemetry batches to include:

- `timestamp`
- `lat`
- `lng`
- `altitudeM`
- `groundSpeedMps`
- `batteryPct`
- `flightState`
- `corridorDeviationM`

### Video State

`VIDEO_STREAM_STATE` payload should provide:

- `available`
- `streaming`
- `viewerUrl`
- `codec`
- `latencyMs`
- `lastFrameAt`

### Control Lease

`CONTROL_LEASE_UPDATED` payload should provide:

- `holder`
- `mode`
- `remoteControlEnabled`
- `observerReady`
- `heartbeatHealthy`
- `expiresAt`

### Control Intent Ack

`CONTROL_INTENT_ACKNOWLEDGED` audit or event payload should provide:

- `requestId`
- `status`
- `reason`

### Blackbox Metadata

When web or support surfaces reference incident follow-up, Android should make these identifiers available to operations staff out of band or via future metadata surfaces:

- `missionId`
- `flightId`
- incident timestamp
- failure reason
- export filename or retrieval reference

## Blocking Matrix

If Android does not provide a contract item, web/planner must behave as follows:

- missing telemetry: show no aircraft position, no stale extrapolation
- missing video state: show no embedded viewer and no fake "streaming" badge
- missing control lease: show monitor-only assumptions and no active remote control state
- missing control intent ack: keep request history in requested state only
- missing bridge alert events: support queue must not invent incident categories

## Ownership

Web thread owns:

- rendering placeholders and monitor-only states
- documenting missing prerequisites
- internal-only gating for `Live Ops` and `Support`

Android thread owns:

- actual event emission
- runtime safety policy
- field/operator-facing device behavior
