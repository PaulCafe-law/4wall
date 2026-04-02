# Flight Test Protocol

## Purpose

This protocol gates the first production-beta validation pass for the Mini 4 Pro building route assistant.

Rules:

- Android app remains the flight-critical loop.
- Server must not be part of the in-flight control loop.
- Any uncertainty resolves to `HOLD` first.
- After `HOLD`, only `Resume`, `RTH`, or `Takeover` are valid operator decisions.
- Virtual stick is limited to low-speed, short-duration local correction only.

## Test Sequence

1. Simulator dry run
   - Enable simulator in a clear test profile.
   - Replay `TRANSIT -> BRANCH_VERIFY -> HOLD -> RTH`.
   - Replay `TRANSIT -> APPROACH_VIEWPOINT -> VIEW_ALIGN -> CAPTURE`.
   - Confirm blackbox log and incident export are generated.

2. Bench test, props off
   - Verify app login, mission bundle sync, and preflight gating.
   - Confirm `TAKEOFF` stays blocked when any gate fails.
   - Confirm camera stream, RC link, GPS readiness, and device health surfaces are visible.

3. Bench test, simulator on aircraft
   - Verify waypoint mission load / upload / start / pause / stop.
   - Verify simulator state listener updates in the app.
   - Verify `HOLD`, `RTH`, and `Takeover` commands render the correct UI state.

4. Field test, low-risk hover
   - Open area, VLOS only, no facade approach yet.
   - Validate RC link recovery, GPS weak/lost handling, and battery warning visibility.
   - Stop immediately if any unexplained state transition occurs.

5. Controlled corridor segment
   - Fly a short waypoint corridor segment.
   - Exercise one branch confirm with manual override available.
   - Validate local avoid warning, hard stop, and operator comprehension of next-step text.

6. Inspection approach
   - Approach a single inspection viewpoint.
   - Require `Align View` before `Capture`.
   - Confirm capture completion ends in a safe operator decision state.

## Hard Stop Criteria

- Aircraft or RC disconnects unexpectedly.
- Mission bundle checksum or version validation fails.
- Camera frame stream is unavailable during an autonomy-dependent segment.
- Unexpected virtual stick use is observed outside the approved windows.
- App state, UI reason text, or exported incident logs disagree with observed aircraft behavior.

## Required Artifacts

- Mission bundle used in the test
- Blackbox log
- Incident export for any `HOLD`, `RTH`, `Takeover`, or abort
- Operator notes with exact UTC timestamps

## Pass Criteria

- No unexplained autonomous movement
- All preflight gates behave conservatively
- Every failsafe path is understandable by the operator on-device
- Blackbox and incident export capture the test session end-to-end
