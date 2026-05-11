# Flight Test Protocol

## Purpose

This protocol gates the first production-beta validation pass for the Mini 4 Pro patrol-route assistant.

If the current test location is a no-fly zone, the protocol stops after the props-off bench stages. Do not proceed to prop-on, hover, or field movement in that environment.

Rules:

- Android app remains the flight-critical loop.
- Server must not be part of the in-flight control loop.
- Any uncertainty resolves to `HOLD` first.
- After `HOLD`, only `RTH`, `LAND`, or RC takeover are valid recovery actions.
- Virtual stick is not part of the Android V1 prod patrol flow.
- Simulator verification is not part of the Android V1 prod patrol flow.

## Test Sequence

1. Bench test, props off
   - Verify app login, mission bundle sync, and preflight gating.
   - Confirm prod Mission Setup exposes only `Outdoor Patrol`.
   - Confirm `TAKEOFF` stays blocked when any gate fails.
   - Confirm camera stream, RC link, GPS readiness, and device health surfaces are visible.
   - Confirm emergency `TAKEOVER` renders RC takeover / Emergency, not Android Manual Pilot.

2. Bench test, mission command path
   - Verify waypoint mission load / upload / start / pause / stop through the real adapter boundary.
   - Verify `HOLD`, `RTH`, `LAND`, and `TAKEOVER` commands render the correct UI state.
   - Verify planned patrol blackbox logging is active.

3. Field test, low-risk hover
   - Open area, VLOS only, no facade approach yet.
   - Validate RC link recovery, GPS weak/lost handling, and battery warning visibility.
   - Stop immediately if any unexplained state transition occurs.

4. Controlled outdoor patrol segment
   - Fly a short waypoint patrol loop.
   - Validate `launch -> waypoint[1..N] -> launch` execution.
   - Validate local avoid warning, hard stop, and operator comprehension of next-step text.

5. Mission-complete landing flow
   - Confirm mission-complete auto landing starts.
   - Confirm DJI landing confirmation, timeout, and RC fallback behavior are understandable to the operator.

## Hard Stop Criteria

- Aircraft or RC disconnects unexpectedly.
- Mission bundle checksum or version validation fails.
- Camera frame stream is unavailable during an autonomy-dependent segment.
- Any virtual stick use is observed in the Android V1 prod patrol flow.
- App state, UI reason text, or exported incident logs disagree with observed aircraft behavior.
- The current location is a no-fly zone or otherwise unsuitable for prop-on testing.

## Required Artifacts

- Mission bundle used in the test.
- Blackbox log.
- Incident export for any `HOLD`, `RTH`, `TAKEOVER`, or abort.
- Operator notes with exact UTC timestamps.

## Pass Criteria

- No unexplained autonomous movement.
- All preflight gates behave conservatively.
- Every failsafe path is understandable by the operator on-device.
- Planned-bundle sessions retain blackbox and incident export end-to-end.
- Prod UI exposes only the patrol flow; legacy manual and simulator paths are absent from the release gate.
