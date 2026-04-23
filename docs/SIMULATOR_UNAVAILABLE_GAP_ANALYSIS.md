# Simulator Unavailable Gap Analysis

## Current Finding

On `2026-04-09`, the current `Mini 4 Pro + firmware 01.00.1100 + DJI Assistant 2 + DJI MSDK` combination did not expose a usable simulator path.

Evidence:

- `Stage 0 unavailable`: `DJI Assistant 2 (Consumer Drones Series)` detected the aircraft but exposed no simulator visualization page.
- `Stage 1 unavailable`: the Android app received `REQUEST_HANDLER_NOT_FOUND / FLIGHTCONTROLLER.StartSimulator` when enabling the in-app MSDK simulator.

This condition must be treated as `unsupported`, not `pending`.

## Operator Notes

Record these exact notes when the current bench outcome matches the known result:

- `2026-04-09 Stage 0 unavailable: Assistant 2 detects Mini 4 Pro but exposes no simulator page.`
- `2026-04-09 Stage 1 unavailable: DJI MSDK returns REQUEST_HANDLER_NOT_FOUND for FLIGHTCONTROLLER.StartSimulator.`

## Supported vs Unsupported Paths

### Supported simulator path

Use the normal simulator gate only when both of the following are true:

- Assistant 2 exposes simulator visualization or the team has another approved external observer.
- The in-app MSDK simulator can be enabled and the app receives real simulator listener updates.

That path may continue through simulator replay validation and later simulator-on-aircraft stages.

### Unsupported simulator path

If either of the following is true:

- Assistant 2 detects the aircraft but exposes no simulator page.
- The app receives `REQUEST_HANDLER_NOT_FOUND / FLIGHTCONTROLLER.StartSimulator`.

Then classify the simulator path as unavailable and switch to the fallback posture below.

## Fallback Posture

When the simulator path is unavailable:

- Continue only with `props-off bench`.
- Allow the Android app to continue from `Simulator Verification` into `Connection Guide` and `Preflight` for bench-only checks.
- Allow the operator to select an explicit `Skip Simulator -> Bench Only` fallback when the hardware path is already known to have no usable simulator support.
- Use `DJI Fly` once if activation or firmware prompts block the app.
- Treat `DJI account` state as diagnostic context, not a recurring bench/preflight blocker.
- Require `Connection Guide` and `Preflight` to remain conservative.
- Require `TAKEOFF` and any `Upload and Takeoff` action to stay blocked for the whole fallback session.
- Keep `HOLD / RTH / Takeover` visible and understandable in the operator UI.
- Preserve blackbox, incident export when available, and operator notes.

This fallback is still a simulator fallback, not the indoor product mode. Indoor no-GPS product behavior is specified separately in `docs/INDOOR_NO_GPS_PRODUCT_MODE.md`.

## No-Go Rule

Simulator unavailability is a stop gate for `prop-on` unless a separate fallback protocol has been reviewed and explicitly approved.

Default rule:

- `props-off bench`: allowed
- `prop-on / hover / corridor / inspection approach`: not allowed

Exception:

- `indoor_no_gps` may allow prop-on only when the session is explicitly running under the indoor product profile and the app enforces the indoor-specific emergency semantics and autonomy downgrade rules.

## Required Follow-Up

- Keep the app UI explicit: unsupported simulator conditions must not look like a retryable pending state.
- Keep the app UI explicit that bench continuation is `props-off only`, not a simulator waiver.
- Keep the workflow docs aligned with the fallback posture.
- Review and approve any future `no simulator` prop-on waiver before field execution.
