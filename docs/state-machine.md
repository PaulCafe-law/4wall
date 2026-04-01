# Flight State Machine

## Design Intent

The reducer is the single source of truth for autonomous mission progression. Conservative behavior wins over mission progress.

## States

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

## Events

- `MISSION_SELECTED`
- `MISSION_BUNDLE_DOWNLOADED`
- `MISSION_UPLOADED`
- `PREFLIGHT_OK`
- `CORRIDOR_DEVIATION_WARN`
- `CORRIDOR_DEVIATION_HARD`
- `VERIFICATION_POINT_REACHED`
- `INSPECTION_ZONE_REACHED`
- `OBSTACLE_WARN`
- `OBSTACLE_HARD_STOP`
- `BRANCH_VERIFY_LEFT`
- `BRANCH_VERIFY_RIGHT`
- `BRANCH_VERIFY_STRAIGHT`
- `BRANCH_VERIFY_UNKNOWN`
- `BRANCH_VERIFY_TIMEOUT`
- `VIEW_ALIGN_OK`
- `VIEW_ALIGN_TIMEOUT`
- `USER_HOLD_REQUESTED`
- `USER_RTH_REQUESTED`
- `USER_TAKEOVER_REQUESTED`
- `BATTERY_CRITICAL`
- `GPS_LOST`
- `APP_HEALTH_BAD`

## Conservative Rules

- Semantic timeout -> `HOLD`
- Frame stream dropped -> `HOLD`
- Battery critical -> `RTH`
- Manual override -> `MANUAL_OVERRIDE`
- Hard corridor deviation -> `HOLD`
- Hard obstacle -> `HOLD`

## Primary Transition Diagram

```text
IDLE
  -> MISSION_SELECTED -> PRECHECK

PRECHECK
  -> MISSION_BUNDLE_DOWNLOADED -> PRECHECK
  -> PREFLIGHT_OK -> MISSION_READY
  -> USER_TAKEOVER_REQUESTED -> MANUAL_OVERRIDE

MISSION_READY
  -> MISSION_UPLOADED -> TAKEOFF
  -> USER_HOLD_REQUESTED -> HOLD

TAKEOFF
  -> INSPECTION_ZONE_REACHED -> APPROACH_VIEWPOINT
  -> VERIFICATION_POINT_REACHED -> BRANCH_VERIFY
  -> CORRIDOR_DEVIATION_HARD -> HOLD
  -> BATTERY_CRITICAL -> RTH
  -> USER_TAKEOVER_REQUESTED -> MANUAL_OVERRIDE
  -> otherwise -> TRANSIT

TRANSIT
  -> VERIFICATION_POINT_REACHED -> BRANCH_VERIFY
  -> INSPECTION_ZONE_REACHED -> APPROACH_VIEWPOINT
  -> OBSTACLE_WARN -> LOCAL_AVOID
  -> OBSTACLE_HARD_STOP -> HOLD
  -> CORRIDOR_DEVIATION_HARD -> HOLD
  -> BATTERY_CRITICAL -> RTH
  -> USER_HOLD_REQUESTED -> HOLD
  -> USER_RTH_REQUESTED -> RTH
  -> USER_TAKEOVER_REQUESTED -> MANUAL_OVERRIDE

BRANCH_VERIFY
  -> BRANCH_VERIFY_LEFT -> TRANSIT
  -> BRANCH_VERIFY_RIGHT -> TRANSIT
  -> BRANCH_VERIFY_STRAIGHT -> TRANSIT
  -> BRANCH_VERIFY_UNKNOWN -> HOLD
  -> BRANCH_VERIFY_TIMEOUT -> HOLD

LOCAL_AVOID
  -> obstacle cleared -> TRANSIT
  -> OBSTACLE_HARD_STOP -> HOLD
  -> BATTERY_CRITICAL -> RTH

APPROACH_VIEWPOINT
  -> VIEW_ALIGN_OK -> CAPTURE
  -> VIEW_ALIGN_TIMEOUT -> HOLD
  -> USER_TAKEOVER_REQUESTED -> MANUAL_OVERRIDE

CAPTURE
  -> next viewpoint -> TRANSIT
  -> no more viewpoints -> HOLD

HOLD
  -> USER_RTH_REQUESTED -> RTH
  -> USER_TAKEOVER_REQUESTED -> MANUAL_OVERRIDE
  -> operator resume allowed -> TRANSIT or APPROACH_VIEWPOINT

RTH
  -> arrival -> LANDING

LANDING
  -> touchdown -> COMPLETED

MANUAL_OVERRIDE
  -> operator lands -> COMPLETED
  -> operator aborts -> ABORTED
```

## Transition Guard Principles

- Reducer never emits movement intent unless mission, aircraft, and safety preconditions are satisfied
- Guards own resumability checks from `HOLD`
- Branch verification can only resume to the mission branch that is explicitly confirmed
- `RTH` is terminal for autonomy in demo mode

## Output Policy

Reducer outputs are limited to:

- mission execution commands
- virtual stick micro-adjust commands
- UI intents
- safety escalation intents

Local avoider outputs are limited to:

- `SLOW_DOWN`
- `HOLD`
- `NUDGE_LEFT`
- `NUDGE_RIGHT`

## Failure Modes

| Trigger | Detection | State Impact | User Impact |
|---|---|---|---|
| Semantic timeout | mobile model deadline exceeded | `HOLD` | operator sees branch confirm timeout |
| Frame drop | camera stream health bad | `HOLD` | operator sees sensor degraded |
| GPS lost | telemetry / DJI state | `HOLD` then possible `RTH` inhibit notice | operator told autonomy degraded |
| Battery critical | telemetry threshold | `RTH` | operator sees forced return |
| App health bad | watchdog | `HOLD` or `ABORTED` based on phase | operator told app unsafe |

## Reducer ASCII Test Targets

```text
Happy path:
IDLE -> PRECHECK -> MISSION_READY -> TAKEOFF -> TRANSIT
-> BRANCH_VERIFY -> TRANSIT -> APPROACH_VIEWPOINT -> VIEW_ALIGN
-> CAPTURE -> HOLD -> RTH -> LANDING -> COMPLETED

Conservative path:
TRANSIT -> BRANCH_VERIFY -> BRANCH_VERIFY_TIMEOUT -> HOLD

Emergency path:
TRANSIT -> BATTERY_CRITICAL -> RTH -> LANDING

Operator takeover:
TRANSIT -> USER_TAKEOVER_REQUESTED -> MANUAL_OVERRIDE
```
