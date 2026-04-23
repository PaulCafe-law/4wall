# Android Console Split And Manual Pilot

## Purpose

This document defines the Sprint 4 production Android console split for Mini 4 Pro patrol operations.

It replaces the old assumption that one shared operator console can serve:

- indoor no-GPS
- outdoor waypoint patrol
- inspection / branch / capture flows

The production beta now needs separate operator surfaces for indoor and outdoor work, while still keeping Android as the only flight-critical runtime.

## Product Decision

The production APK stays single-binary, but the operator UI is split into three execution paths:

- `Indoor Manual`
- `Outdoor Patrol`
- `Outdoor Manual Pilot`

These are **operator console modes**, not new planner route schemas.

The planner contract remains patrol-route oriented:

- `launchPoint`
- `orderedWaypoints[]`
- `implicitReturnToLaunch`
- `operatingProfile`

## Authority Boundaries

### Planner / web

- mission planning authority only
- no stick control
- no in-flight control arbitration
- route geometry remains internal-only

### Android

- only flight-critical runtime
- only place where manual-stick control is allowed
- only place where camera preview, photo, record, and gimbal pitch controls are surfaced

### DJI waypoint mission

- remains the main transit authority for `Outdoor Patrol`
- manual pilot does not replace or mutate the planned patrol route

## Console Modes

### Indoor Manual

Purpose:

- indoor no-GPS operator control
- no waypoint autonomy assumption

Required surfaces:

- mission summary
- connection / readiness
- live camera preview
- dual-stick control
- HOLD / LAND / TAKEOVER
- completion / export status

Must not show:

- waypoint progress
- RTH
- patrol-route start controls
- inspection / branch / capture tabs

### Outdoor Patrol

Purpose:

- planned autonomous patrol using DJI waypoint mission / KMZ

Required surfaces:

- mission summary
- route summary
- launch point
- waypoint count
- implicit return-to-launch
- connection / preflight
- upload mission
- takeoff
- hover ready
- waypoint progress
- RTH / landing / fallback

Must not show:

- inspection / branch / capture tabs
- simulator replay and test injection controls

### Outdoor Manual Pilot

Purpose:

- outdoor direct pilot control with live preview
- does not run waypoint mission

Required surfaces:

- mission summary
- connection / readiness
- live camera preview
- dual-stick control
- HOLD / LAND / TAKEOVER
- outdoor-only RTH when the current flight state allows it
- completion / export status

Must not show:

- waypoint progress as the main state
- inspection / branch / capture tabs

## Mission Setup Rules

Mission Setup now chooses an **execution path**, not just an operating profile.

Allowed selections:

- `Indoor Manual`
- `Outdoor Patrol`
- `Outdoor Manual Pilot`

The mission bundle still carries `plannedOperatingProfile`.

Android adds a local runtime selection:

- `selectedExecutionProfile`
- `executionMode`

Rules:

- selection is only editable in Mission Setup
- leaving Mission Setup locks the execution path
- changing the path requires returning to Mission Setup
- Android must expose both:
  - `plannedOperatingProfile`
  - `executedOperatingProfile`

## Manual Pilot Definition

`Manual Pilot` is an explicit operator control mode.

It is:

- Android-local only
- virtual-stick backed
- low-speed and conservative
- enabled and disabled explicitly

It is not:

- server control
- web control
- autonomous corridor following
- a replacement for outdoor waypoint patrol

### Manual Pilot v1 controls

Flight:

- forward / backward
- left / right
- up / down
- yaw

Camera:

- live preview
- start / stop recording
- take photo
- gimbal pitch

## Virtual Stick Guardrails

Manual Pilot uses virtual stick only in explicit operator direct-control mode.

Rules:

- low-speed limits apply
- enabling Manual Pilot explicitly enables virtual stick
- leaving Manual Pilot disables virtual stick immediately
- any uncertainty resolves to HOLD first
- virtual stick is never upgraded to outdoor autopatrol corridor following

## Production UI Cleanup

The following are removed from production operator UI:

- `巡檢拍攝`
- `前往巡檢拍攝點`
- `分支確認` as a permanent tab
- telemetry replay buttons
- obstacle injection buttons
- hard-stop injection buttons

These may remain available in debug/test harnesses, but not in production operator consoles.

## Ops / Telemetry Contract

Android execution projection must expose:

- `plannedOperatingProfile`
- `executedOperatingProfile`
- `executionMode`
- `cameraStreamState`
- `recordingState`

Web / ops surfaces must distinguish:

- indoor manual sessions
- outdoor patrol sessions
- outdoor manual-pilot sessions

## Safety Notes

- indoor v1 still does not promise indoor waypoint autonomy
- indoor v1 still does not expose RTH
- outdoor patrol still uses DJI waypoint mission as transit authority
- server and web remain outside the flight-critical loop
