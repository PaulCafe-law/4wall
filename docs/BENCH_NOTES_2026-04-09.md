# Bench Notes 2026-04-09

## Simulator Path Result

- Aircraft: `DJI Mini 4 Pro`
- Firmware observed in app / Assistant 2: `01.00.1100`
- Date: `2026-04-09`

Recorded outcomes:

- `Stage 0 unavailable: Assistant 2 detects Mini 4 Pro but exposes no simulator page.`
- `Stage 1 unavailable: DJI MSDK returns REQUEST_HANDLER_NOT_FOUND for FLIGHTCONTROLLER.StartSimulator.`

## Operational Consequence

- The current test stack is `NO-GO` for `prop-on`.
- The remaining allowed work for this session is `props-off bench` only.
- The app may continue to `Connection Guide` and `Preflight` for bench checks only.
- `Upload and Takeoff` must remain blocked for the whole session.

## Bench Focus

- `Connection Guide -> Preflight`
- RC connected
- aircraft linked
- product / firmware visible
- camera stream available
- GPS state visible
- mission bundle verified
- DJI prerequisite status visible
- `TAKEOFF` blocked whenever any blocker remains
