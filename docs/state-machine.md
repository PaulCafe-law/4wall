# Flight State Machine

## Intent

The reducer is the single source of truth for mission progression and safety escalation. Mission progress never outranks safety.

## Core Stages

- `IDLE`
- `PRECHECK`
- `MISSION_READY`
- `TAKEOFF`
- `TRANSIT`
- `BRANCH_VERIFY`
- `LOCAL_AVOID`
- `APPROACH_VIEWPOINT`
- `VIEW_ALIGN`
- `CAPTURE`
- `HOLD`
- `MANUAL_OVERRIDE`
- `RTH`
- `LANDING`
- `COMPLETED`
- `ABORTED`

## Inputs

### Mission / Artifact

- `MISSION_SELECTED`
- `MISSION_BUNDLE_DOWNLOADED`
- `MISSION_BUNDLE_VERIFIED`
- `MISSION_BUNDLE_INVALID`
- `MISSION_UPLOADED`

### Flight Progress

- `PREFLIGHT_OK`
- `VERIFICATION_POINT_REACHED`
- `INSPECTION_ZONE_REACHED`
- `VIEW_ALIGN_OK`
- `VIEW_ALIGN_TIMEOUT`

### Safety / Health

- `CORRIDOR_DEVIATION_WARN`
- `CORRIDOR_DEVIATION_HARD`
- `OBSTACLE_WARN`
- `OBSTACLE_HARD_STOP`
- `FRAME_STREAM_DROPPED`
- `SEMANTIC_TIMEOUT`
- `BATTERY_CRITICAL`
- `GPS_LOST`
- `DEVICE_HEALTH_BLOCKING`
- `APP_HEALTH_BAD`

### Operator

- `USER_HOLD_REQUESTED`
- `USER_RTH_REQUESTED`
- `USER_TAKEOVER_REQUESTED`
- `USER_RESUME_REQUESTED`
- `BRANCH_VERIFY_LEFT`
- `BRANCH_VERIFY_RIGHT`
- `BRANCH_VERIFY_STRAIGHT`
- `BRANCH_VERIFY_UNKNOWN`
- `BRANCH_VERIFY_TIMEOUT`

## Preflight Gate Policy

`PREFLIGHT_OK` is emitted only when all required gates are green:

- aircraft connected
- RC connected
- camera stream available
- device storage above minimum threshold
- device health has no blocking issue
- fly-safe has no blocking issue
- GPS status at or above threshold
- mission bundle downloaded and verified

The preflight policy is reducer-backed domain logic, not UI booleans.

## Primary Transition Diagram

```text
IDLE
  -> MISSION_SELECTED -> PRECHECK

PRECHECK
  -> MISSION_BUNDLE_DOWNLOADED -> PRECHECK
  -> MISSION_BUNDLE_VERIFIED -> PRECHECK
  -> PREFLIGHT_OK -> MISSION_READY
  -> MISSION_BUNDLE_INVALID -> PRECHECK
  -> USER_TAKEOVER_REQUESTED -> MANUAL_OVERRIDE

MISSION_READY
  -> MISSION_UPLOADED -> TAKEOFF
  -> USER_HOLD_REQUESTED -> HOLD

TAKEOFF
  -> takeoff complete -> TRANSIT
  -> BATTERY_CRITICAL -> RTH
  -> USER_TAKEOVER_REQUESTED -> MANUAL_OVERRIDE

TRANSIT
  -> VERIFICATION_POINT_REACHED -> BRANCH_VERIFY
  -> INSPECTION_ZONE_REACHED -> APPROACH_VIEWPOINT
  -> OBSTACLE_WARN -> LOCAL_AVOID
  -> any uncertainty / blocker -> HOLD
  -> BATTERY_CRITICAL -> RTH
  -> USER_HOLD_REQUESTED -> HOLD
  -> USER_RTH_REQUESTED -> RTH
  -> USER_TAKEOVER_REQUESTED -> MANUAL_OVERRIDE

BRANCH_VERIFY
  -> BRANCH_VERIFY_LEFT/RIGHT/STRAIGHT -> TRANSIT
  -> BRANCH_VERIFY_UNKNOWN -> HOLD
  -> BRANCH_VERIFY_TIMEOUT -> HOLD
  -> FRAME_STREAM_DROPPED -> HOLD
  -> SEMANTIC_TIMEOUT -> HOLD

LOCAL_AVOID
  -> obstacle cleared -> TRANSIT
  -> OBSTACLE_HARD_STOP -> HOLD
  -> BATTERY_CRITICAL -> RTH

APPROACH_VIEWPOINT
  -> VIEW_ALIGN_OK -> VIEW_ALIGN
  -> VIEW_ALIGN_TIMEOUT -> HOLD
  -> USER_TAKEOVER_REQUESTED -> MANUAL_OVERRIDE

VIEW_ALIGN
  -> capture ready -> CAPTURE
  -> uncertainty -> HOLD

CAPTURE
  -> next viewpoint -> TRANSIT
  -> no remaining viewpoint -> HOLD

HOLD
  -> USER_RESUME_REQUESTED -> previous autonomous stage if guards pass
  -> USER_RTH_REQUESTED -> RTH
  -> USER_TAKEOVER_REQUESTED -> MANUAL_OVERRIDE

RTH
  -> arrival -> LANDING

LANDING
  -> touchdown -> COMPLETED

MANUAL_OVERRIDE
  -> operator lands -> COMPLETED
  -> operator aborts -> ABORTED
```

## Conservative Rules

- Semantic uncertainty or timeout -> `HOLD`
- Frame stream dropped during confirm or alignment -> `HOLD`
- Hard obstacle -> `HOLD`
- Hard corridor deviation -> `HOLD`
- GPS weak -> `HOLD`
- GPS lost -> `HOLD`
- RC signal degraded or lost -> `HOLD`
- Battery critical -> `RTH`
- Manual override request -> `MANUAL_OVERRIDE`

## HOLD Semantics

HOLD is the default uncertainty sink. Once in HOLD, the product only allows:

- `Resume`
- `RTH`
- `Takeover`

The UI must always show:

- why the aircraft stopped
- what the operator can do next

## Virtual Stick Guardrails

Virtual stick is only legal in:

- `LOCAL_AVOID`
- `APPROACH_VIEWPOINT`
- `VIEW_ALIGN`
- explicit operator-approved micro-adjust window

It is forbidden in:

- `TAKEOFF`
- `TRANSIT`
- `RTH`
- `LANDING`

## Failure Modes

| Trigger | Detection | State Impact | Operator Impact |
|---|---|---|---|
| Semantic timeout | model deadline exceeded | `HOLD` | sees timeout + next step |
| Frame stream dropped | camera stream health bad | `HOLD` | sees sensor degraded |
| GPS weak | DJI state / telemetry | `HOLD` | sees degraded navigation margin |
| GPS lost | DJI state / telemetry | `HOLD` | sees navigation degraded |
| RC signal degraded or lost | DJI telemetry | `HOLD` | sees link degraded and must choose next step |
| Battery critical | telemetry threshold | `RTH` | sees forced return |
| App health bad | watchdog | `HOLD` or `ABORTED` | sees app unsafe |
| Device health blocking | DJI diagnostic | preflight blocked or `HOLD` | sees specific blocker |

Blackbox rule:
- entering `HOLD`, `RTH`, `MANUAL_OVERRIDE`, `ABORTED`, or `COMPLETED` must be exportable as an incident artifact

## Test Targets

```text
Happy path:
IDLE -> PRECHECK -> MISSION_READY -> TAKEOFF -> TRANSIT
-> BRANCH_VERIFY -> TRANSIT -> APPROACH_VIEWPOINT -> VIEW_ALIGN
-> CAPTURE -> HOLD -> RTH -> LANDING -> COMPLETED

Artifact gate:
IDLE -> PRECHECK -> MISSION_BUNDLE_INVALID -> PRECHECK
TAKEOFF not allowed

Conservative path:
TRANSIT -> BRANCH_VERIFY -> BRANCH_VERIFY_TIMEOUT -> HOLD

Emergency path:
TRANSIT -> BATTERY_CRITICAL -> RTH -> LANDING

Operator takeover:
TRANSIT -> USER_TAKEOVER_REQUESTED -> MANUAL_OVERRIDE
```
