# Building Route Assistant Architecture

## Product Definition

This product is a Mini 4 Pro building route assistant for VLOS operations. It follows road or pedestrian-network corridors to reach exterior building inspection viewpoints, verifies branches conservatively, and escalates uncertainty to HOLD before any other action.

## Non-Negotiable Constraints

- Android owns the flight-critical runtime.
- The planner server is planning-only and never participates in the active control loop.
- Main transit uses waypoint mission / KMZ.
- Virtual stick is limited to low-speed, short-duration local correction windows.
- Mobile on-device intelligence is limited to branch verify and landmark confirm.
- Local avoider outputs are limited to `SLOW_DOWN`, `HOLD`, `NUDGE_LEFT`, `NUDGE_RIGHT`.
- Any uncertainty resolves to `HOLD` first.
- No SLAM, no free-space planner, no server-issued stick commands.

## System Boundary

```text
+---------------------------+        +----------------------------------+
| Planner Server            |        | Android Pilot App                |
| planning-only             |        | flight-critical runtime          |
|                           |        |                                  |
| Auth                      |        | Auth/session cache               |
| Route provider            |        | Mission bundle cache             |
| Corridor generator        |------->| Mission bundle verifier          |
| Inspection viewpoint gen  |bundle  | Preflight gate policy            |
| MissionMeta generator     |        | Flight reducer + safety policy   |
| KMZ generator             |        | Waypoint / simulator adapters    |
| Artifact persistence      |        | Camera / perception adapters     |
| Event/telemetry ingest    |        | Virtual stick guardrails         |
+---------------------------+        | Operator UI + blackbox export    |
                                     +----------------+-----------------+
                                                      |
                                                      v
                                            +------------------------+
                                            | DJI Mobile SDK / FW    |
                                            | aircraft, RC, camera   |
                                            +------------------------+
```

## Shared Contract

Android and planner-server share versioned artifacts through `shared-schemas/`.

Required contract families:

- mission identity, version, and checksum
- corridor geometry, thresholds, and speed/altitude hints
- verification points and semantic expectations
- inspection viewpoints and framing intent
- failsafe defaults
- artifact metadata for `mission.kmz` and `mission_meta.json`

## Control Authority Model

```text
Planning authority
  planner-server:
    route -> corridor -> viewpoints -> artifact generation

Execution authority
  Android:
    auth/session cache
    mission artifact verification
    preflight gating
    mission upload
    state transitions
    local avoidance arbitration
    failsafe escalation

Aircraft authority
  DJI firmware / MSDK:
    waypoint execution
    simulator
    telemetry
    aircraft state
    camera / perception feeds
```

## Runtime Modes

- `demo` flavor: fake adapters, replay-friendly UI, safe local demo data
- `prod` flavor: real DJI adapters and hardware-backed preflight gates

Both modes share:

- reducer and state machine
- safety policies
- mission bundle parsing / validation
- operator-facing UI model

## Core Runtime Flow

```text
1. Operator logs in
2. Server plans a mission and persists artifacts
3. Android downloads mission artifacts
4. Android verifies schema version, checksum, and completeness
5. Preflight gate policy evaluates aircraft, RC, stream, storage, health, fly-safe, GPS, and bundle readiness
6. Android uploads KMZ waypoint mission
7. Takeoff and main transit execute through waypoint mission
8. Verification point reached
   -> on-device branch confirm
   -> timeout / uncertainty => HOLD
9. Obstacle or safety anomaly
   -> slow / hold / bounded nudge only
10. Viewpoint reached
    -> low-speed approach / alignment window
11. Capture
12. Resume, HOLD, RTH, or TAKEOVER per policy
```

## Preflight Gate Policy

Takeoff is blocked if any of these are true:

- aircraft disconnected
- RC disconnected
- camera stream unavailable
- device storage below threshold
- blocking device health issue
- blocking fly-safe or flight warning
- GPS status below configured threshold
- mission bundle missing, incomplete, or verification failed

Preflight policy lives in the domain layer and is testable independently of UI.

## Safety Invariants

- In-flight server loss cannot block local safety decisions.
- Invalid artifacts cannot reach takeoff.
- Unknown semantic results cannot advance the aircraft forward.
- Lost frame stream cannot silently continue branch confirmation.
- Virtual stick cannot become the main transit controller.
- User takeover wins over all autonomous behavior.

## Failure Containment

```text
Server failure before flight
  -> no verified bundle
  -> preflight blocked

Server failure during flight
  -> mission execution continues safely
  -> uploads become backlog

Perception uncertainty / semantic timeout / frame drop
  -> HOLD

Battery critical
  -> RTH

App health or adapter mismatch
  -> HOLD or ABORTED depending on phase
```

## Implementation Layers

### Android

- `app`: application wiring, flavor-specific bindings
- `data`: bundle cache, auth/session, repositories
- `domain.safety`: preflight and in-flight safety policy
- `domain.statemachine`: reducer, guards, flight state
- `dji`: interface boundary with fake and real implementations
- `feature.*`: pilot-facing screens and UI state models

### Planner Server

- `api`: routes and DTO validation
- `auth`: operator login and refresh
- `db`: SQLModel models and Alembic migrations
- `providers`: route-provider abstraction
- `planning`: corridor and viewpoint generation
- `artifacts`: `mission_meta.json` and KMZ generation
- `storage`: local filesystem or S3-compatible storage abstraction

## Release Focus

This architecture is intentionally conservative. The beta is complete only when the prod path is safe, verifiable, and repeatable, not merely when the demo path looks convincing.
