# Field Checklist

## Before Leaving

- Charged aircraft, RC, and mobile device.
- DJI SDK / app key prerequisites confirmed; use `DJI Fly` only for one-time activation or firmware bootstrap when needed.
- Latest `Outdoor Patrol` mission bundle is downloaded and checksum-verified.
- If waypoint start is currently rejected by DJI, bring the DJI Fly baseline
  protocol: `docs/DJI_FLY_BASELINE_TEST_PROTOCOL.md`.
- Weather and local airspace reviewed.
- Android V1 operator flow is patrol-only; simulator, indoor manual, and outdoor manual-pilot product modes are not release gates.

## On Site

- Confirm VLOS route and safe observer position.
- Confirm takeoff / landing area is clear.
- Confirm the real-world route still matches the planned route.

## Before Prop-On

- Aircraft connected.
- RC connected.
- Camera stream available.
- Storage above minimum threshold.
- Device health clear.
- Fly zone clear.
- GPS ready.
- Mission bundle complete and verified for `Outdoor Patrol`.
- Operator understands `HOLD`, `RTH`, `LAND`, and RC takeover before takeoff.

## During Test

- Keep `HOLD / RTH / LAND / TAKEOVER` visible and understood.
- Record any mismatch between UI reason text and aircraft behavior.
- Stop immediately on unexplained autonomous action.
- Treat any prod virtual-stick behavior as a stop condition.

## After Landing

- Export incident report if any abnormal event occurred.
- Pull blackbox log for the planned patrol session.
- Confirm uploads or backlog state for the planned patrol session.
- Record operator notes before memory decays.
