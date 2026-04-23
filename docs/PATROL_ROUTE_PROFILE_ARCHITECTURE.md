# Patrol Route Operating Profiles

## Purpose

This document defines the Sprint 4 route and execution model for Mini 4 Pro patrol missions under DJI MSDK.

It replaces the old assumption that all missions are building-inspection flows with mandatory inspection viewpoints.

## Product Decision

The product now has two operating profiles:

- `outdoor_gps_patrol`
  - primary v1 product path
  - uses `launchPoint + orderedWaypoints + implicitReturnToLaunch`
  - main transit authority is DJI waypoint mission / KMZ
  - product narrative may describe full auto takeoff -> patrol -> return -> landing
  - implementation must still preserve DJI landing confirmation and RC-only fallback
- `indoor_no_gps`
  - retained as a separate profile
  - does not enter the outdoor waypoint-autonomy flow
  - only conservative autonomy is allowed:
    - `HOLD`
    - `LAND`
    - `TAKEOVER`
  - if upload or mission start is not accepted on the current aircraft path, the session downgrades to `manual indoor only`

The production Android console is now further split by execution path:

- `Indoor Manual`
- `Outdoor Patrol`
- `Outdoor Manual Pilot`

See `docs/ANDROID_CONSOLE_SPLIT_AND_MANUAL_PILOT.md`.

## Route Model

The patrol route model is now:

- `launchPoint`
- `orderedWaypoints[]`
- `implicitReturnToLaunch: true`
- `operatingProfile`
- `defaultAltitudeMeters`
- `defaultSpeedMetersPerSecond`
- `failsafe`

`viewpoint` is no longer a required part of the outdoor patrol route schema.

Legacy inspection-specific geometry may remain optional for compatibility, but it is not the authority for v1 patrol execution.

## Authority Split

### Planner / server

- planning-only
- persists route geometry and artifacts
- generates `mission.kmz` and `mission_meta.json`
- never participates in the active control loop

### Android

- only flight-critical runtime
- verifies bundle and checksums
- evaluates preflight gates
- uploads and starts waypoint mission
- runs takeoff / hover / landing flow
- arbitrates HOLD / LAND / RTH / TAKEOVER
- owns any direct operator stick control via local manual-pilot mode

### Web / ops

- route authority and mission monitoring only
- no continuous stick control
- no in-flight command arbitration

## Execution Policy

### Outdoor GPS patrol

Nominal runtime flow:

1. mission bundle verified
2. preflight gates green
3. upload `mission.kmz`
4. takeoff
5. stable hover
6. start waypoint mission
7. DJI executes `L -> waypoint[1..N] -> L`
8. Android starts auto landing on mission completion

Patrol state machine should prioritize:

- `IDLE`
- `PRECHECK`
- `MISSION_READY`
- `TAKEOFF`
- `HOVER_READY`
- `TRANSIT`
- `HOLD`
- `MANUAL_OVERRIDE`
- `RTH`
- `LANDING`
- `COMPLETED`
- `ABORTED`

### Indoor no-GPS

Indoor remains distinct:

- GPS does not block takeoff
- `RTH` is unavailable
- mission upload and mission start are not assumed to be available
- if autonomy is rejected by the aircraft path, the session downgrades to `manual indoor only`

## Landing Policy

The product may present an automatic landing story, but the runtime must preserve the current safety behavior:

- mission complete -> Android calls `startAutoLanding()`
- if DJI requires confirmation -> app may use `ConfirmLanding`
- if confirmation is rejected, times out, or real descent is not observed -> fall back to RC-only landing
- local-perception-only warnings must never be treated as DJI confirmation authority

## Artifact Contract

The shared mission contract must expose:

- `launchPoint`
- `orderedWaypoints[]`
- `implicitReturnToLaunch`
- `operatingProfile`
- `defaultAltitudeMeters`
- `defaultSpeedMetersPerSecond`
- `failsafe`

`mission_meta.json` must expose:

- `waypointCount`
- `launchPoint`
- `implicitReturnToLaunch`
- `operatingProfile`
- `landingPolicy`

## Testing Implications

Outdoor acceptance:

- route payload does not require an explicit final waypoint back to launch
- KMZ execution path closes the loop back to launch
- app can distinguish `upload`, `takeoff`, `mission running`, `mission complete`, and `landing fallback`

Indoor acceptance:

- profile remains available
- indoor never misreports `RTH` as available
- mission start rejection downgrades to `manual indoor only`
