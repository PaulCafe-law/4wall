# Building Route Assistant Architecture

## Goal

Deliver a demo for Mini 4 Pro that follows a road or pedestrian network as an aerial corridor, reaches exterior building inspection viewpoints, confirms branches conservatively, performs local avoidance with bounded authority, then auto-hovers for framing.

## Bootstrap Status

This workspace started greenfield. Current bootstrap status:

- Git repo: initialized locally
- Android app: minimal Kotlin app skeleton present under `android-app/`
- Planner server: FastAPI skeleton present under `planner-server/`
- Core docs: present under `docs/`

Chosen baseline stack for implementation:

- Android: Kotlin, single-app Gradle project, Jetpack Compose UI, coroutines, StateFlow
- Planner server: FastAPI, Pydantic, pytest
- Mission artifacts: JSON mission metadata plus KMZ generator abstraction

## Non-Negotiable Constraints

- Android app owns the flight-critical loop
- Server is planning-only, never in the active control loop
- Main transit uses waypoint mission
- Virtual stick is limited to low-speed, short-duration micro adjustments
- Mobile model is limited to branch verify and landmark confirm
- Local avoidance is limited to `SLOW_DOWN`, `HOLD`, `NUDGE_LEFT`, `NUDGE_RIGHT`
- Any uncertainty escalates to `HOLD`, then `RTH` or manual takeover
- No full SLAM in demo scope

## System Boundary

```text
+----------------------+        +---------------------------+
| Planner Server       |        | Android App               |
| planning only        |        | flight-critical runtime   |
|                      |        |                           |
| OSM / OSRM provider  |        | MissionRepository         |
| Corridor generator   |------->| Mission bundle parser     |
| MissionMeta builder  | bundle | Route corridor tracker    |
| KMZ generator        |        | Flight state machine      |
+----------------------+        | DJI mission adapter       |
                                | DJI virtual stick adapter |
                                | Camera / perception       |
                                | Safety supervisor         |
                                | Pilot UI                  |
                                +-------------+-------------+
                                              |
                                              v
                                    +-------------------+
                                    | DJI Mobile SDK    |
                                    | aircraft + camera |
                                    +-------------------+
```

## Control Authority Model

```text
Planning authority
  Server:
    route -> corridor -> mission bundle

Execution authority
  Android app:
    preflight gating
    mission upload
    state transitions
    branch verification timing
    local avoidance arbitration
    failsafe escalation

Aircraft authority
  DJI firmware / MSDK:
    waypoint execution
    telemetry
    aircraft state
```

## Core Runtime Flow

```text
1. Operator requests mission plan on server
2. Server returns mission bundle + mission artifacts
3. Android downloads and validates bundle
4. Preflight checks gate arming and upload
5. App uploads waypoint mission
6. Takeoff and transit on waypoint mission
7. Corridor tracker monitors deviation
8. Verification point reached
   -> branch confirm using mobile model
   -> if uncertain, HOLD
9. Obstacle signal appears
   -> local avoider may only slow, hold, or nudge
10. Inspection zone reached
    -> switch to low-speed approach / align
11. Capture
12. Exit to HOLD / COMPLETE / RTH based on policy
```

## Mission Bundle Contract

Mission bundle is the handoff boundary between planner and Android runtime.

Required payload families:

- Mission identity and version
- Corridor geometry and thresholds
- Verification points with semantic expectations
- Inspection viewpoints with framing intent
- Suggested altitude and speed per segment
- Failsafe defaults
- Artifact references for KMZ and mission meta

## Safety Invariants

- Server unavailability cannot block in-flight safety decisions
- Unknown semantic result cannot force forward motion
- Lost frame stream cannot silently continue branch confirmation
- Local avoidance cannot issue aggressive autonomous lateral behavior
- Battery critical bypasses feature logic and escalates to `RTH`
- User takeover wins over every autonomous branch

## Data Flow

```text
OSM / OSRM route
  -> densified polyline
  -> corridor segments
  -> verification points
  -> inspection viewpoints
  -> mission metadata
  -> KMZ abstraction
  -> Android mission bundle parser
  -> flight state machine + UI
```

## Failure Containment

```text
Server failure before flight
  -> no mission produced
  -> operator stays in Mission Setup / Preflight

Server failure during flight
  -> ignored for control
  -> event upload can retry later

Perception uncertainty
  -> HOLD

Telemetry degradation
  -> SafetySupervisor escalates

DJI adapter mismatch
  -> adapter returns capability/state error
  -> reducer transitions to HOLD or ABORTED
```

## Android Runtime Layers

- `data`: mission parsing, repositories, fake data sources
- `domain.route`: corridor tracking and mission progress logic
- `domain.semantic`: branch and landmark confirmation orchestration
- `domain.avoid`: bounded local avoidance policy
- `domain.safety`: hold and RTH policy, health supervision
- `domain.statemachine`: reducer, transition guards, event handling
- `dji`: adapter boundary for MSDK integration
- `feature.*`: screen-specific flows

## Planner Server Layers

- `api`: FastAPI routes and DTO validation
- `providers`: route provider abstraction
- `planning`: corridor generator and viewpoint synthesis
- `artifacts`: mission metadata and KMZ generator abstractions
- `tests`: DTO, provider, planner, artifact tests

## What Already Exists

At repo level, nothing reusable exists yet. Reuse will happen at the architecture level:

- Single source of truth for mission bundle schema
- Reducer-owned state transitions, no screen-local state machine forks
- Adapter boundaries for real DJI and fake demo implementations

## Not In Scope Here

See [not-in-scope.md](./not-in-scope.md) for explicit deferrals.
