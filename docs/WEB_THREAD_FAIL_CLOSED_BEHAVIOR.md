# Web Thread Fail-Closed Behavior

## Purpose

This document defines how web and planner surfaces must behave when Android-side live data or acknowledgements are missing, delayed, or unhealthy.

The rule is simple:

- no browser compensation
- no guessed aircraft state
- no server-issued continuous control
- if data is incomplete, the UI degrades to placeholder or monitor-only

## Default Mode

`Live Ops` is internal-only. Even for internal users, the page starts in monitor-only mode unless the server has fresh Android-originated data.

## Required Fail-Closed States

### No Flight Session

Show:

- empty state explaining that no active flight session is available

Do not show:

- synthetic flight cards
- stale aircraft location

### No Telemetry

Show:

- empty map state
- messaging that telemetry has not arrived yet

Do not show:

- guessed coordinates
- stale heading or speed badges presented as current

### Telemetry Stale

Show:

- critical support item
- alert badge on the flight summary

Do not do:

- auto-clear the alert without fresh telemetry

### No Video Viewer URL

Show:

- no embedded player
- copy explaining that the viewer URL is not available

Do not do:

- fabricate a viewer entry point

### No Control Lease

Show:

- `monitor_only` assumptions
- no active remote-control status

Do not do:

- imply that remote control is available

### No Control Intent Ack

Show:

- requested state only

Do not do:

- mark a request as accepted or rejected without Android-side acknowledgement

## Support Queue Behavior

Support items may only be generated from:

- failed mission records
- stale telemetry timestamps
- low battery telemetry
- explicit bridge alerts

Support must not infer hidden Android failures that were never reported upstream.

## Operator Messaging

Use copy that points users to the right next step:

- check Android bridge uplink
- verify observer readiness
- confirm site control station health
- review mission detail or artifact generation state

Do not tell users that the browser itself can recover flight control.
