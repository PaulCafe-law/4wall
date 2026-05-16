# Sprint 4 Device Health Gate Adjustment

## Context

During outdoor waypoint patrol validation, DJI MSDK reported `IN_NFZ_MAX_HEIGHT`
through `DeviceStatusManager.currentDJIDeviceStatus`. The app treated every
non-`NORMAL` device status as a blocking `Device health` preflight gate, which
blocked takeoff even though:

- `Fly zone` was not blocking.
- GPS and DJI Home Point were ready.
- The v1 waypoint mission altitude is fixed at 10m.
- DJI MSDK remains the final authority for fly-zone, altitude-limit, takeoff,
  upload, and mission-start rejection.

## Decision

Do not remove the `Device health` gate. It still blocks true hardware or system
health failures.

For `IN_NFZ_MAX_HEIGHT`, downgrade the status to a non-blocking diagnostic so
the operator can proceed when the dedicated `Fly zone` gate is clear. DJI MSDK
will still enforce actual altitude and fly-zone restrictions during takeoff,
mission upload, and mission execution.

## Safety Boundary

- Web and planner-server remain outside the flight-critical loop.
- Android remains the only runtime allowed to request takeoff and mission start.
- If DJI rejects takeoff/upload/start, the app must hold or fall back to RC.
- Unknown device health statuses remain blocking by default.
