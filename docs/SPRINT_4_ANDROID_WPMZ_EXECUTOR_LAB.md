# Sprint 4 Android WPMZ Executor Lab

## Purpose

The field blocker is now narrowed to DJI waypoint execution acceptance. The
server-generated `mission.kmz` uploads, but `startMission` is rejected by DJI
with:

```text
Failed to start task. Check whether the wayline file is correct
```

This lab changes the Android execution candidate, not the product boundary.
Web and planner-server still only provide waypoint geometry and mission context.
Android remains the only flight-critical runtime.

## Decision

Outdoor Patrol now tests an Android-generated KMZ candidate first:

1. Android reads the assigned mission bundle.
2. Android converts bundle waypoints into a DJI WPMZ SDK model.
3. Android calls `WPMZManager.generateKMZFile(...)`.
4. Android uploads the generated KMZ with `pushKMZFileToAircraft(...)`.
5. Android reads `getAvailableWaylineIDs(kmzPath)`, matching the DJI sample.
6. Android starts with `startMission(fileName, waylineIds)`, also matching the
   DJI sample.

The planner-server KMZ remains available as `server_kmz_candidate`, but it is no
longer the first artifact used for field waypoint execution in this diagnostic
path.

## Golden Baseline

The first WPMZ candidate intentionally uses conservative DJI-sample-like values:

- `finishAction = GO_HOME`
- `exitOnRCLostAction = GO_BACK`
- `flyToWaylineMode = SAFELY`
- `coordinateMode = WGS84`
- `altitudeMode = RELATIVE_TO_START_POINT`
- waypoint height = `50m`
- waypoint speed = `2.5 m/s`
- drone type = `WM260` (`68`)
- drone subtype = `0`

If this starts successfully on Mini 4 Pro, lower the product values later one at
a time. Do not change altitude, speed, route geometry, and start overload in the
same field run.

## Diagnostic Fields

The app must show and log:

- `kmzGenerationSource`
- `missionId`
- generated KMZ filename
- generated KMZ sha256
- generated KMZ size
- available wayline IDs
- start overload
- DJI execute state
- wayline progress
- interrupt reason

This is required so every hover/no-move result can be tied to one exact KMZ and
one exact MSDK start path.

## Interpretation

- If `android_wpmz` starts and enters `ENTER_WAYLINE` or `EXECUTING`, root cause
  is the planner-server hand-written WPML generator.
- If `android_wpmz` is rejected, run the native DJI Fly baseline in
  `docs/DJI_FLY_BASELINE_TEST_PROTOCOL.md` before changing more WPML fields.
- If DJI Fly itself cannot fly a simple 2-point route, stop tuning 4Wall code and
  resolve the aircraft / account / firmware / fly-zone / Home Point condition.
- If DJI Fly flies successfully and can export a KMZ, replay that DJI Fly golden
  KMZ through the same Android adapter.
- If DJI Fly golden KMZ is also rejected through MSDK upload/start, escalate the
  risk to the Mini 4 Pro + RC-N2 + MSDK executor support path instead of
  continuing to tune WPML fields.

## 2026-05-20 Field Result

The native DJI Fly baseline succeeded on the same Mini 4 Pro / RC-N2 field path.
That rules out the aircraft, controller, account, GPS/Home Point, fly zone, and
site conditions as the primary blocker.

The rejected Android-generated WPMZ candidate used the DJI WPMZ SDK namespace
`http://www.dji.com/wpmz/1.0.6`, wrote template placemarks, and emitted a
suspicious `efficiencyFlightModeEnable` value. DJI Fly's working package shape
uses `http://www.uav.com/wpmz/1.0.2`, keeps template waypoints out of
`template.kml`, and executes from `waylines.wpml`.

The next Android candidate therefore stops using the WPMZ SDK generated file as
the first field artifact. It writes a DJI Fly-shaped KMZ locally from the
assigned mission bundle and records `source=android_dji_fly_shape`.

Baseline values remain fixed until field acceptance:

- waypoint height: `50m`
- waypoint speed: `2.5 m/s`
- Mini 4 Pro drone enum: `68`
- Mini 4 Pro subtype: `0`
- finish action: `goHome`

## Safety Boundary

This lab does not add browser flight control and does not use virtual stick to
fake waypoint following. If DJI does not accept the waypoint mission, the app
fails closed and remains in HOLD / operator takeover.
