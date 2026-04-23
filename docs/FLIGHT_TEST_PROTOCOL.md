# Flight Test Protocol

## Purpose

This protocol gates the first production-beta validation pass for the Mini 4 Pro patrol-route assistant.

See `docs/INDOOR_NO_GPS_PRODUCT_MODE.md` for the official indoor no-GPS profile. That profile is distinct from the simulator-unavailable bench fallback.

If the current test location is a no-fly zone, the protocol stops after the props-off bench stages. Do not proceed to prop-on, hover, or field movement in that environment.

Rules:

- Android app remains the flight-critical loop.
- Server must not be part of the in-flight control loop.
- Any uncertainty resolves to `HOLD` first.
- After `HOLD`, only the approved profile-specific recovery actions are valid.
- Virtual stick is limited to low-speed, short-duration local correction only.

## Test Sequence

1. Assistant 2 visual observer smoke test
   - Connect Mini 4 Pro to `DJI Assistant 2 (Consumer Drones Series)` over USB.
   - Confirm the aircraft is detected.
   - If a simulator view is available, keep it open as a passive observer and enable path / trace rendering.
   - If the current firmware or Assistant 2 build does not expose simulator visualization, note that Stage 0 is unavailable and continue with the in-app MSDK simulator gate.
   - For the current Mini 4 Pro bench flow, use this note when applicable: `Assistant 2 detects aircraft, but no simulator visualization page is available on April 9, 2026.`

2. In-app MSDK simulator dry run
   - Enable simulator in a clear test profile.
   - Replay `TRANSIT -> HOLD -> RTH`.
   - Replay `TAKEOFF -> HOVER_READY -> TRANSIT`.
   - Confirm blackbox log and incident export are generated.
   - If the app returns `REQUEST_HANDLER_NOT_FOUND / FLIGHTCONTROLLER.StartSimulator`, mark Stage 1 unavailable, stop the simulator path, and downgrade the session to `props-off bench only`.
   - In that fallback, the app may continue into `Connection Guide` and `Preflight` for bench checks, but it must keep `Upload and Takeoff` blocked.

3. Bench test, props off
   - Verify app login, mission bundle sync, and preflight gating.
   - Confirm `TAKEOFF` stays blocked when any gate fails.
   - Confirm camera stream, RC link, GPS readiness, and device health surfaces are visible.
   - For `Indoor Manual` and `Outdoor Manual Pilot`, verify live preview, dual-stick enable / disable, photo, record, and gimbal pitch controls.

4. Bench test, simulator on aircraft
   - Verify waypoint mission load / upload / start / pause / stop.
   - Verify simulator state listener updates in the app.
   - Verify `HOLD`, `RTH`, and `Takeover` commands render the correct UI state.

5. Field test, low-risk hover
   - Open area, VLOS only, no facade approach yet.
   - Validate RC link recovery, GPS weak/lost handling, and battery warning visibility.
   - Stop immediately if any unexplained state transition occurs.

6. Controlled outdoor patrol segment
   - Fly a short waypoint patrol loop.
   - Validate `launch -> waypoint[1..N] -> launch` execution.
   - Validate local avoid warning, hard stop, and operator comprehension of next-step text.

7. Controlled manual-pilot segment
   - Enter `Outdoor Manual Pilot` in a low-risk open area.
   - Verify live preview remains visible while dual-stick control is active.
   - Verify forward / backward / left / right / up / down / yaw commands are low-speed and predictable.
   - Verify leaving Manual Pilot disables the virtual-stick stream immediately.

8. Mission-complete landing flow
   - Confirm mission-complete auto landing starts.
   - Confirm DJI landing confirmation, timeout, and RC fallback behavior are understandable to the operator.

## Hard Stop Criteria

- Aircraft or RC disconnects unexpectedly.
- Mission bundle checksum or version validation fails.
- Camera frame stream is unavailable during an autonomy-dependent segment.
- Unexpected virtual stick use is observed outside the approved windows.
- App state, UI reason text, or exported incident logs disagree with observed aircraft behavior.
- Stage 1 simulator enable returns `REQUEST_HANDLER_NOT_FOUND / FLIGHTCONTROLLER.StartSimulator` and the session attempts any `prop-on`, `hover`, outdoor patrol, or mission-complete landing step outside an explicitly reviewed indoor profile.
- The current location is a no-fly zone or otherwise unsuitable for prop-on testing.

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

## Simulator Unavailable Default

If either Stage 0 or Stage 1 is unavailable on the current hardware / firmware stack:

- record the dated operator note
- continue with `props-off bench` only
- allow `Connection Guide` and `Preflight` for bench verification only
- keep `Upload and Takeoff` blocked
- do not proceed to `prop-on`, `hover`, corridor, or inspection approach unless a reviewed indoor profile explicitly allows it

## Indoor No-GPS Product Mode

Indoor no-GPS is a separate reviewed operating profile. It is not a simulator waiver.

When the session is explicitly configured as `indoor_no_gps`:

- GPS remains visible but does not block takeoff
- `RTH` is unavailable
- emergency decisions are `HOLD`, `LAND`, or `TAKEOVER`
- RC manual takeoff / landing and app takeoff / landing are both valid test paths
- app landing must follow DJI landing-protection semantics:
  - `LAND` starts auto landing
  - if DJI requires confirmation, show `繼續盤旋` or `確認繼續降落`
  - if only local perception warns that the landing zone is unsafe, show `繼續盤旋` or `改用 RC 強制降落`
  - `確認繼續降落` is formally DJI MSDK `ConfirmLanding`
  - `改用 RC 強制降落` switches the session to RC-only recovery; it does not call `ConfirmLanding`
  - if `ConfirmLanding` callback succeeds but the app does not observe real descent, fall back to RC-only landing
  - if `ConfirmLanding` is unavailable or rejected, fall back to RC-only landing
- after `TAKEOVER`, landing authority is RC-only and the app must not offer app-controlled landing
- indoor autonomy may proceed only after the current aircraft path proves it can accept mission upload and mission start
- if upload or start is rejected, the session must downgrade to `manual indoor only`
