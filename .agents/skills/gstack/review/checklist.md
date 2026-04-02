# 4wall Review Checklist

## Architecture

- Android remains the flight-critical loop.
- Server does not issue real-time flight commands.
- Main transit uses waypoint mission, not virtual stick.
- Virtual stick is constrained to low-speed local correction only.

## Safety

- Any uncertainty path resolves to HOLD before any further action.
- Preflight blockers are reducer-backed policy, not UI-only flags.
- TAKEOFF is blocked until mission artifacts are fully present and verified.
- Emergency actions are explicit and prioritized: HOLD, RTH, TAKEOVER.

## Trust Boundaries

- Server artifacts are authenticated and verified.
- Mission bundle parsing rejects invalid or incompatible versions.
- Android remains safe when server connectivity drops in flight.

## State Machine

- Hold, RTH, and manual takeover transitions are conservative and test-covered.
- Branch confirm supports timeout fallback and human override.
- Failsafe paths do not silently resume autonomy.

## Backend

- Auth, storage, and persistence are abstracted.
- Artifact generation is versioned and checksumed.
- Telemetry and event ingestion are non-flight-critical.

## Suppressions

The following are deliberate product decisions and are not review findings by themselves:

- Server not in the flight-critical loop
- Demo flavor retained alongside prod flavor
- No SLAM
- No server-issued stick commands
