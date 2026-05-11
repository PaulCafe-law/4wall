# Field Checklist

## Before Leaving

- Charged aircraft, RC, and mobile device
- `DJI Assistant 2` smoke test complete, or explicitly marked unavailable on the current firmware/build with a dated operator note
- In-app simulator verification complete, or explicitly marked unavailable with a dated operator note and `props-off only` acknowledged
- DJI SDK / app key prerequisites confirmed; use `DJI Fly` only for one-time activation or firmware bootstrap when needed
- If the session is `Outdoor Patrol`, the latest mission bundle is downloaded and checksum-verified
- If the session is `Indoor Manual` or `Outdoor Manual Pilot` with no verified bundle, note that the flight will run as `unplanned manual flight`
- Weather and local airspace reviewed
- If using the indoor product profile, review `docs/INDOOR_NO_GPS_PRODUCT_MODE.md`

## On Site

- Confirm VLOS route and safe observer position
- Confirm takeoff / landing area is clear
- Confirm the real-world route still matches the planned route or indoor test box

## Before Prop-On

- Simulator verification artifacts reviewed
- No active `Stage 0 unavailable` / `Stage 1 unavailable` stop gate unless a reviewed fallback protocol explicitly allows this flight
- If a reviewed fallback allows `props-off bench` with Stage 1 unavailable, `Connection Guide` and `Preflight` may still be used for bench checks, but `Upload and Takeoff` remains blocked
- Aircraft connected
- RC connected
- Camera stream available
- Storage above minimum threshold
- Device health clear
- Fly zone clear
- GPS ready unless the session is explicitly `indoor_no_gps` or `Outdoor Manual Pilot`
- Mission bundle complete and verified for `Outdoor Patrol`
- If no verified bundle is attached in a manual mode:
  - operator confirms this is an `unplanned manual flight`
  - operator understands there will be no server flight context
  - operator understands there will be no blackbox / incident export retention

For `indoor_no_gps` only:

- Indoor no-GPS profile explicitly selected in the app
- Operator acknowledged `RTH unavailable`
- Observer is ready
- Clear takeoff / landing box confirmed
- Manual takeover ready on the RC
- Indoor autonomy remains disabled until the current hardware path proves mission upload / start support

## During Test

- Keep `HOLD / LAND / TAKEOVER` visible and understood
- Record any mismatch between UI reason text and aircraft behavior
- Stop immediately on unexplained autonomous action

Indoor no-GPS note:

- `LAND` replaces `RTH` as the primary terminal recovery action
- if DJI requires landing confirmation, the operator must explicitly choose:
  - `繼續盤旋`
  - `確認繼續降落`
- if only local perception warns that the landing zone is unsafe, the operator must explicitly choose:
  - `繼續盤旋`
  - `改用 RC 強制降落`
- `確認繼續降落` means DJI MSDK `ConfirmLanding`
- `改用 RC 強制降落` means the app stops trying to land and transfers recovery to the RC
- if the app reports `ConfirmLanding` unavailable, rejected, or not followed by real descent, switch to RC manual landing immediately
- after `TAKEOVER`, landing authority is RC-only
- if indoor autonomy probe fails, end autonomy testing and continue only with manual indoor flight

## After Landing

- Export incident report if any abnormal event occurred in a planned-bundle session
- Pull blackbox log for planned-bundle sessions only
- Confirm uploads or backlog state for planned-bundle sessions only
- For `unplanned manual flight`, record operator notes immediately because there is no retained blackbox / incident export
- Record operator notes before memory decays
