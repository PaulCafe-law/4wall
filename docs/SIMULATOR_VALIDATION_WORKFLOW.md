# Simulator Validation Workflow

This workflow adds a visual-observer stage ahead of the in-app MSDK simulator gate.

## Roles

- `DJI Assistant 2 (Consumer Drones Series)` is the external visual observer.
- The Android app remains the only primary operator console.
- `planner-server` is planning-only and never enters the flight-critical loop.

## Stage 0: Assistant 2 Visual Observer

Use this stage when the current aircraft / firmware / Assistant 2 combination exposes simulator visualization.

1. Install `DJI Assistant 2 (Consumer Drones Series)` on the Windows PC.
2. Connect the aircraft to the PC over USB.
3. Power on the RC and aircraft.
4. Confirm Assistant 2 detects the Mini 4 Pro.
5. If Assistant 2 exposes simulator controls:
   - open the simulator view
   - seed a legal, open test coordinate
   - enable path / trace rendering
6. Keep Assistant 2 open as a passive observer while the Android app drives simulator flows.

If the current firmware or build does not expose simulator visualization in Assistant 2, downgrade this stage to optional and continue with the in-app MSDK simulator gate.

For the current Mini 4 Pro bench workflow, close Stage 0 as soon as the absence is confirmed and record it in operator notes. Example record:

`Assistant 2 detects aircraft, but no simulator visualization page is available on April 9, 2026.`

After recording that note, disconnect the aircraft from the PC and continue with the phone-based flow.

## Stage 1: In-App MSDK Simulator Gate

Run this stage from the Android app before any direct aircraft bring-up:

1. Load and verify a mission bundle.
2. Open `Simulator Verification`.
3. Enable the in-app simulator.
4. Replay:
   - `TRANSIT -> BRANCH_VERIFY -> HOLD -> RTH`
   - `TRANSIT -> APPROACH_VIEWPOINT -> VIEW_ALIGN -> CAPTURE`
5. Confirm the app surfaces simulator state updates.
6. Confirm blackbox recording is armed and at least one simulator replay produces an incident export artifact.

If `Enable simulator` returns `REQUEST_HANDLER_NOT_FOUND / FLIGHTCONTROLLER.StartSimulator`, classify Stage 1 as unavailable immediately. Do not keep retrying `Enable simulator` and do not leave the workflow in a generic pending state.

Use this exact note when the current bench outcome matches the known result:

`2026-04-09 Stage 1 unavailable: DJI MSDK returns REQUEST_HANDLER_NOT_FOUND for FLIGHTCONTROLLER.StartSimulator.`

Once that note is recorded:

- stop the simulator gate
- do not treat replay cards as still actionable
- switch the session to `props-off bench only`
- allow the app to continue to `Connection Guide` and `Preflight` for bench checks only
- keep `Upload and Takeoff` / `prop-on` blocked until a separate fallback protocol is reviewed

If the team already knows the current `Mini 4 Pro` stack has no usable simulator path, the operator may explicitly choose `Skip Simulator -> Bench Only` from the app without pressing `Enable simulator` first. That shortcut is valid only for `props-off bench` and must keep `Upload and Takeoff` blocked.

## Exit Criteria

You may continue to `Connection Guide` only when:

- mission bundle is verified
- the app has observed simulator state updates
- both required simulator replays pass
- blackbox is armed and at least one incident export is observed

You may also continue to `Connection Guide` for `props-off bench only` when:

- mission bundle is verified
- Stage 1 is explicitly classified as unavailable because the app returned `REQUEST_HANDLER_NOT_FOUND / FLIGHTCONTROLLER.StartSimulator`
- the app keeps `Upload and Takeoff` blocked for the whole fallback session

## Failure Rules

Stop and fix before bench or field work if any of the following happen:

- Assistant 2 visual behavior disagrees with app state
- app simulator state never updates
- app reports `REQUEST_HANDLER_NOT_FOUND / FLIGHTCONTROLLER.StartSimulator`
- replay paths do not visit the expected reducer stages
- blackbox or incident export is unavailable
