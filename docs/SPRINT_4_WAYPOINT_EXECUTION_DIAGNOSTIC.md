# Sprint 4 Waypoint Execution Diagnostic

## Context

The outdoor patrol path depends on Android handing a DJI WPML/KMZ mission to the aircraft and then starting the DJI waypoint mission. The web app and planner server remain planning and artifact systems only; Android remains the only flight-critical runtime.

The current field symptom is:

- `App takeoff` succeeds.
- The aircraft reaches hover.
- `Start patrol` does not move the aircraft along the planned waypoints.

## 2026-05-15 Finding

The field log narrowed the latest hover-only failure to KMZ/WPML validation. Android successfully pushed `mission.kmz` to the aircraft, then DJI rejected `startMission` with:

`Failed to start task. Check whether the wayline file is correct`

The first generated WPML was too loose for DJI execution:

- `waylines.wpml` did not include the required `wpml:globalRTHHeight`.
- Wayline placemarks used `wpml:waypointTurnMode` directly instead of the required `wpml:waypointTurnParam` wrapper.
- Template placemarks used execution-only altitude fields instead of `wpml:height`.
- Zero-second hold points emitted `hover` actions with `wpml:hoverTime` equal to `0`, but DJI requires hover time to be greater than zero.

A second field run with a stricter generic WPML still failed with the same DJI error. Comparing against DJI Fly waypoint packages generated on the same Mini 4 Pro phone showed the aircraft-specific shape DJI accepts:

- WPML namespace is `http://www.uav.com/wpmz/1.0.2`, not `http://www.dji.com/wpmz/1.0.2`.
- `template.kml` contains mission config and `droneInfo`, but no waypoint placemarks.
- `waylines.wpml` contains the executable placemarks.
- Mini 4 Pro `droneInfo` is `droneEnumValue=68`, `droneSubEnumValue=0`.
- DJI Fly emits `distance=0`, `duration=0`, `globalTransitionalSpeed=2.5`, `autoFlightSpeed=2.5`, and `waypointSpeed=2.5` for the sampled Mini 4 Pro missions.
- Each waypoint includes the full heading param, continuity turn param, `useStraightLine`, and `waypointGimbalHeadingParam`.
- DJI Fly does not attach a `gimbalRotate` action to every waypoint. It resets gimbal pitch at the first waypoint, then uses `gimbalEvenlyRotate` action groups across waypoint segments.

The current generated field package still fails because it is not DJI Fly-shaped enough:

- It keeps v1 speed at `1.5 m/s`, while the Mini 4 Pro DJI Fly samples use `2.5 m/s`.
- It emits one `gimbalRotate` action group per waypoint.
- It omits `waypointGimbalHeadingParam`.
- It writes calculated distance/duration instead of DJI Fly's `0` placeholders.

This points to the KMZ/WPML artifact, not the Home Point transition. If the aircraft accepts the wayline, DJI is responsible for climbing from the current hover/Home Point context and flying to the first waypoint.

## 2026-05-16 Finding

The field run with the DJI Fly-shaped Mini 4 Pro package narrowed the failure one layer further:

- Android loaded the active KMZ from the private mission cache.
- DJI's native WPMZ parser accepted the file: `check=NoError`, `parsedWaylines=[0]`.
- `pushKMZFileToAircraft` reached `100` and returned success.
- `getAvailableWaylineIDs(mission-<sha>.kmz)` returned an empty list.
- Android then used the diagnostic fallback `startMission(missionFileName, [0])`.
- DJI rejected start with `Failed to start task. Check whether the wayline file is correct`.

This means the current package is not being rejected at Android-side XML parsing or upload. The failure is now at the MSDK aircraft start boundary.

The next fix removes the non-official fallback that guessed `[0]` when `getAvailableWaylineIDs` returned empty. In DJI MSDK, the one-argument `startMission(missionFileName)` path delegates to the operator with an empty wayline list, which means execute all waylines in the uploaded mission. That is safer than inventing an explicit wayline list after the SDK returned no available ids.

The diagnostic now records this as:

- `start=single-arg-all-waylines` when available ids are empty.
- `start=list-[...]` only when DJI returns explicit available ids.

The follow-up field run showed the one-argument start path still rejected at the aircraft boundary:

- `nativeValidation=check=NoError; parsedWaylines=[0]`
- `pushKMZFileToAircraft` completed successfully.
- `start=single-arg-all-waylines`
- DJI still returned `Failed to start task. Check whether the wayline file is correct`.

That run also confirmed the Android prod flow was steering the operator through an unsafe diagnostic shape for Mini 4 Pro waypoint missions: upload, separate App/RC takeoff to hover, then `startMission`. The next Android fix changes Outdoor Patrol to a DJI Fly-like sequence: upload from the ground, keep the state at `MISSION_READY`, then start the DJI waypoint mission directly from the ground. The DJI mission owns takeoff, climb, and transit to waypoint 1. App/RC takeoff remains for Manual Pilot, not Outdoor Patrol.

## Root Cause Gap

The Android waypoint adapter previously treated the DJI `startMission` command callback as proof that the mission was running. That callback only proves the start command returned. It does not prove the aircraft entered the DJI waypoint execution state.

For field validation, the app must distinguish:

- KMZ upload accepted.
- Start command accepted.
- DJI waypoint state actually entered `ENTER_WAYLINE` or `EXECUTING`.
- DJI returned `NOT_SUPPORTED`, `INTERRUPTED`, `DISCONNECTED`, or remained idle.

Without this distinction, the UI can show a patrol as started while the aircraft is still hovering.

## Fix Direction

Android must subscribe to DJI waypoint execution listeners before starting the mission:

- `WaypointMissionExecuteStateListener`
- `WaylineExecutingInfoListener`

`startMission()` should only return success after observing a running waypoint state. If DJI accepts the command but does not enter execution within the timeout, the app must fail closed and show the latest DJI state instead of advancing to patrol.

The server-side KMZ generator must emit Mini 4 Pro executable WPML, not only XML that parses structurally.

## Waypoint Diagnostic Run

Every outdoor patrol field run must now leave enough evidence to separate five boundaries:

1. Web route and task generation
2. Server KMZ/WPML artifact
3. Android active bundle cache
4. DJI MSDK upload/start command path
5. Aircraft waypoint execution state

The Android app logs and returns a compact diagnostic string for waypoint upload and start:

- `mission`
- uploaded KMZ filename
- KMZ SHA-256 short prefix
- KMZ byte size
- `getAvailableWaylineIDs(...)`
- selected `startMission` overload
- latest DJI waypoint execute state
- latest wayline executing info
- latest interrupt reason
- latest command error

The cache filename is checksum-scoped, for example `mission-<shortSha>.kmz`, so a previous aircraft/app cache named `mission.kmz` cannot be mistaken for the current staging package.

`getAvailableWaylineIDs(...)` returning an empty list is treated as a diagnostic anomaly. The Android adapter now uses DJI's one-argument `startMission(file)` path and records `start=single-arg-all-waylines`. It does not guess or synthesize a wayline id list.

## Server Artifact Gate

The planner server validates every generated KMZ before storage. The diagnostic gate unzips `mission.kmz` and checks:

- `wpmz/template.kml` exists.
- `wpmz/waylines.wpml` exists.
- WPML namespace is `http://www.uav.com/wpmz/1.0.2`.
- `template.kml` has no executable placemarks.
- `waylines.wpml` has at least one executable waypoint placemark.
- `waylineId=0` exists.
- Mini 4 Pro `droneInfo` is `droneEnumValue=68`, `droneSubEnumValue=0`.
- every waypoint has positive `executeHeight`.
- every waypoint speed is at least the DJI Fly observed Mini 4 Pro safe value `2.5 m/s`.
- action groups are present.

Invalid generated packages fail closed before the Android operator can download them.

## Next Field Procedure

Before another prop-on waypoint test:

1. Create a short route in the web app and send it to the flight app.
2. Sync the mission on Android and confirm the displayed/downloaded mission checksum changed.
3. Run props-off or safe bench upload.
4. Confirm the log contains `pushKMZFileToAircraft success`.
5. Confirm the log contains either non-empty `waylines=[0]` or `start=single-arg-all-waylines`.
6. Only proceed to outdoor ground-start if the app can report the exact KMZ checksum and start overload. Do not run a separate App/RC hover before starting Outdoor Patrol.

If the aircraft still hovers, capture:

- `adb logcat -d | findstr /i "DjiWaypointMission WaypointMission"`
- active KMZ from Android app private cache
- `wpmz/template.kml`
- `wpmz/waylines.wpml`
- `bundle_manifest.json`
- `mission_meta.json`
- app screenshot showing the start failure message

## DJI Fly Baseline

If the checksum-scoped package still fails with `Check whether the wayline file is correct`, run a baseline with a DJI Fly-generated Mini 4 Pro waypoint KMZ on the same phone, RC-N2, and aircraft:

- If the DJI Fly KMZ also fails through MSDK upload/start, escalate as a Mini 4 Pro + RC-N2 + MSDK waypoint support path risk.
- If the DJI Fly KMZ starts, the root cause remains in the planner-server WPML generator.

## Safety Boundary

This does not add web or server flight authority. It only tightens Android's local validation around the DJI waypoint mission lifecycle and corrects the server-generated mission artifact.

If DJI reports `NOT_SUPPORTED`, this is a product/aircraft capability blocker, not a UI issue. The patrol path must remain blocked until the supported DJI mission path is available.
