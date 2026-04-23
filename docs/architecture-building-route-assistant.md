# Building Route Assistant Architecture

## Product Definition

This product is a Mini 4 Pro route assistant for VLOS operations. The Sprint 4 primary path is outdoor GPS patrol using `launchPoint + orderedWaypoints + implicitReturnToLaunch`, while `indoor_no_gps` remains a separate conservative operating profile.

The customer-facing platform now has two non-flight-equivalent desktop surfaces:

- `web-app`: customer and ops planning, live monitoring, support, billing, and audit portal
- `Site Control Station`: a Windows control console deployed at the site for low-latency operator interaction

When headquarters needs to operate from a computer, it does so by remote access into the Site Control Station. The web app itself remains outside the active flight-control loop.

## Non-Negotiable Constraints

- Android owns the flight-critical runtime.
- The Site Control Station may present flight controls, but Android still arbitrates safety and DJI link ownership.
- The planner server is planning-only and never participates in the active control loop.
- The web app may request high-level control intents and show live status, but it never issues continuous flight control.
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
| Patrol route generator    |------->| Mission bundle verifier          |
| MissionMeta generator     |bundle  | Preflight gate policy            |
| Artifact persistence      |        | Flight reducer + safety policy   |
| KMZ generator             |        | Waypoint / simulator adapters    |
| Event/telemetry ingest    |        | Camera / perception adapters     |
| Legacy inspection compat  |        | Virtual stick guardrails         |
+---------------------------+        | Operator UI + blackbox export    |
                                     +----------------+-----------------+
                                                      |
                                                      v
                                            +------------------------+
                                            | DJI Mobile SDK / FW    |
                                            | aircraft, RC, camera   |
                                            +------------------------+

                    +----------------------------------+
                    | Site Control Station             |
                    | local Windows ops console        |
                    |                                  |
                    | live map / live video / alerts   |
                    | mission-level controls           |
                    | camera controls                  |
                    | manual flight controls           |
                    | operator identity + audit        |
                    +----------------+-----------------+
                                     ^
                                     |
                    +----------------+-----------------+
                    | Desktop Web App                  |
                    | customer + ops portal            |
                    |                                  |
                    | missions / sites / billing       |
                    | live monitoring                  |
                    | control intent requests          |
                    | support queue / audit            |
                    +----------------+-----------------+
                                     ^
                                     |
                            +--------+--------+
                            | AnyDesk MVP     |
                            | remote access   |
                            +-----------------+
```

## Shared Contract

Android and planner-server share versioned artifacts through `shared-schemas/`.

Required contract families:

- mission identity, version, and checksum
- patrol route geometry:
  - `launchPoint`
  - `orderedWaypoints`
  - `implicitReturnToLaunch`
- operating profile:
  - `outdoor_gps_patrol`
  - `indoor_no_gps`
- speed/altitude hints and failsafe defaults
- artifact metadata for `mission.kmz` and `mission_meta.json`

See `docs/PATROL_ROUTE_PROFILE_ARCHITECTURE.md` for the Sprint 4 route model authority.

## Control Authority Model

```text
Planning authority
  planner-server:
    route -> wayline -> artifact generation

Monitoring authority
  web-app:
    mission monitoring
    site-scoped live visibility
    high-level control intent requests
    support and audit views

Interactive control authority
  Site Control Station:
    local low-latency map + video
    mission-level commands
    camera controls
    manual flight controls

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

Remote access authority
  AnyDesk MVP:
    remote screen + keyboard/mouse only
    not a safety boundary
    not a control arbiter

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
8. Obstacle or safety anomaly
   -> slow / hold / bounded nudge only
9. Mission complete
   -> Android starts landing flow
10. Resume, HOLD, RTH, LAND, or TAKEOVER per profile policy
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
- Unknown route or aircraft state cannot advance the aircraft forward.
- Lost frame stream cannot silently continue a camera-dependent safety decision.
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

Web failure during flight
  -> monitoring loss only
  -> no change to local flight safety behavior

AnyDesk session loss during remote operation
  -> Site Control Station loses remote operator input
  -> Android bridge revokes remote lease or enters HOLD / RTH per policy

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
- `bridge`: live telemetry, video uplink, control lease enforcement, remote-control gating
- `domain.safety`: preflight and in-flight safety policy
- `domain.statemachine`: reducer, guards, flight state
- `dji`: interface boundary with fake and real implementations
- `feature.*`: pilot-facing screens and UI state models

### Planner Server

- `api`: routes and DTO validation
- `auth`: operator login and refresh
- `db`: SQLModel models and Alembic migrations
- `providers`: route-provider abstraction
- `planning`: patrol route and wayline generation
- `artifacts`: `mission_meta.json` and KMZ generation
- `storage`: local filesystem or S3-compatible storage abstraction
- `live-ops`: flight session summaries, support queue, control intent log

### Desktop Web App

- `customer`: sites, missions, billing, team, artifact download
- `live ops`: map/video/status monitoring and control intent requests
- `support`: failure queue, alert timeline, audit views

### Site Control Station

- local low-latency operator console
- local mission and camera controls
- guarded manual flight controls
- remote-access-aware operator handoff

## Release Focus

This architecture is intentionally conservative. The beta is complete only when the prod path is safe, verifiable, and repeatable, not merely when the demo path looks convincing.
