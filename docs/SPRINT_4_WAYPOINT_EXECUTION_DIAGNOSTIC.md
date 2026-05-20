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

`getAvailableWaylineIDs(...)` returning an empty list is treated as a diagnostic anomaly. The Android adapter now uses the list overload with an empty wayline-id list and records `start=list-empty-all-waylines`. DJI's waypoint API treats an empty wayline-id list as "execute all waylines", which is closer to the documented API path than inventing `[0]` after the SDK reported no available ids.

The 2026-05-16 ground-start run still failed with `start=single-arg-all-waylines` and the same `Check whether the wayline file is correct` DJI error. Comparing the active `mission-6044580023f0.kmz` with a DJI Fly-generated Mini 4 Pro KMZ showed the WPML shape is effectively identical except for waypoint coordinates and `executeHeight` (`10m` in the generated package versus `50m` in the DJI Fly sample). The next diagnostic therefore tests the remaining documented start overload before changing the mission geometry again.

PR #66 merged the adapter diagnostics but missed the Android Outdoor Patrol state-machine change that keeps the aircraft on the ground before starting the DJI waypoint mission. PR #67 restores that missing behavior: uploading a patrol mission leaves the console in `MISSION_READY`, hides `App 起飛` / `RC 起飛後確認 hover`, and changes the primary action to `啟動航點任務`.

The next diagnostic step is Android-side WPMZ generation. The app now records
`source=android_wpmz` when it uploads a KMZ generated through DJI
`WPMZManager.generateKMZFile(...)` from the assigned mission bundle. This
separates "server hand-written WPML is invalid" from "Mini 4 Pro + RC-N2 +
MSDK waypoint executor cannot start this class of mission".

The adapter also follows the DJI sample's argument split: it calls
`getAvailableWaylineIDs(kmzPath)` with the full generated KMZ path, then calls
`startMission(fileName, waylineIds)` with the uploaded KMZ filename.

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
5. Confirm the log contains non-empty `waylines=[0]` or explicit `start=list-empty-all-waylines`.
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

If the checksum-scoped package still fails with `Check whether the wayline file is correct`, run the native DJI Fly baseline before changing more WPML fields.

Authority:

- `docs/DJI_FLY_BASELINE_TEST_PROTOCOL.md`

The first baseline is DJI Fly itself, not our Android app replaying a DJI Fly KMZ.
The operator manually creates and starts the DJI Fly waypoint route:

- same Mini 4 Pro
- same RC-N2
- same phone
- same account, firmware, fly zone, GPS, and Home Point conditions
- 2 waypoints
- `50m`
- `2.5 m/s`
- no photo / video / gimbal actions
- finish action: RTH

Interpretation:

- If DJI Fly itself cannot fly this route, stop tuning 4Wall KMZ generation. The blocker is likely aircraft, firmware, fly zone, account, Home Point, or site condition.
- If DJI Fly flies successfully, the hardware and site path are good enough. Continue debugging the 4Wall Android WPMZ / server WPML / MSDK executor path.
- If DJI Fly can export a KMZ, replay that golden KMZ through the same Android MSDK executor lab. If the DJI Fly KMZ also fails through MSDK upload/start, escalate as a Mini 4 Pro + RC-N2 + MSDK waypoint executor support risk. If it starts, align our generated WPMZ/WPML to the DJI Fly mission shape.

## Safety Boundary

This does not add web or server flight authority. It only tightens Android's local validation around the DJI waypoint mission lifecycle and corrects the server-generated mission artifact.

If DJI reports `NOT_SUPPORTED`, this is a product/aircraft capability blocker, not a UI issue. The patrol path must remain blocked until the supported DJI mission path is available.
