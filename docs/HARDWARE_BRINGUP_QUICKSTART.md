# Hardware Bring-Up Quickstart

Use this quickstart when the phone and PC are on different networks and the phone will later be switched to a DJI controller by USB.

The workflow is split into two phases:

0. `PC <-> aircraft by USB` for optional `DJI Assistant 2` simulator visualization
1. `PC <-> phone by USB` for local planner-server access, login, and mission bundle download
2. `phone <-> RC-N2/N3` for props-off DJI bench validation using the cached, verified bundle

## Stage 0: Assistant 2 smoke test

Before touching the phone flow, try the external visual-observer stage:

- Install `DJI Assistant 2 (Consumer Drones Series)` on the Windows PC.
- Connect the aircraft to the PC over USB.
- Power on the RC and aircraft.
- Confirm Assistant 2 can detect the Mini 4 Pro.
- If a simulator page is available:
  - seed a legal, open test coordinate
  - enable path / trace rendering
  - keep Assistant 2 open as a passive observer for later simulator runs

If Assistant 2 does not expose simulator visualization for the current firmware/build, record that result and continue with the in-app MSDK simulator path.

Use this exact note if the current Mini 4 Pro flow matches the known outcome:

`Assistant 2 detects aircraft, but no simulator visualization page is available on April 9, 2026.`

Once that note is recorded, disconnect the aircraft from the PC and move on to the phone flow.

## Phase A: USB to PC, no controller attached yet

### 1. Prepare planner-server

Before the first `prodDebug` build, store the DJI app key in `android-app/local.properties` so it stays out of git:

```powershell
$localPropertiesPath = "D:\The Fourth Wall AI\codebase\android-app\local.properties"
Add-Content $localPropertiesPath "DJI_API_KEY=REPLACE_WITH_YOUR_DJI_APP_KEY"
```

`local.properties` is git-ignored. You can still override it per command with `-DjiApiKey ...` or `DJI_API_KEY=...` when needed.

Run the local planner-server in development mode:

```powershell
cd "D:\The Fourth Wall AI\codebase\planner-server"
$env:BUILDING_ROUTE_ENVIRONMENT="development"
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe .\scripts\create_operator.py --username fieldpilot --display-name "Field Pilot" --password "CHANGE_ME_NOW"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

In another shell, smoke test the server before touching the phone:

```powershell
cd "D:\The Fourth Wall AI\codebase\planner-server"
.\.venv\Scripts\python.exe .\scripts\smoke_test.py --base-url http://127.0.0.1:8000 --username fieldpilot --password CHANGE_ME_NOW
```

### 2. Connect the phone by USB

- Enable Developer Options and USB debugging on the phone.
- Accept the RSA trust prompt.
- Confirm `adb devices -l` shows the device.

### 3. Reverse the local planner-server into the phone and install `prodDebug`

Use the dedicated USB helper:

```powershell
cd "D:\The Fourth Wall AI\codebase\android-app"
.\scripts\usb-local-bringup.ps1
```

This helper does all of the following:

- checks `adb devices`
- runs `adb reverse tcp:8000 tcp:8000`
- builds `prodDebug` with `PLANNER_BASE_URL=http://127.0.0.1:8000`
- installs the APK to the connected phone

### 4. Verify the on-device prereqs

Before disconnecting the phone from the PC, verify:

- app launches
- `Simulator Verification` either:
  - observes simulator state, replays both required scenarios, and produces an incident export artifact
  - or explicitly reports `REQUEST_HANDLER_NOT_FOUND / FLIGHTCONTROLLER.StartSimulator`, which must be recorded as `Stage 1 unavailable`
- DJI SDK initializes
- login with `fieldpilot / CHANGE_ME_NOW` works
- mission planning succeeds
- `mission_meta.json` and `mission.kmz` download and checksum-verify
- the active local bundle is present

If any of those fail, stop here. Do not continue to the controller bench.

Use this exact note if the current Mini 4 Pro flow matches the known outcome:

`2026-04-09 Stage 1 unavailable: DJI MSDK returns REQUEST_HANDLER_NOT_FOUND for FLIGHTCONTROLLER.StartSimulator.`

## Phase B: Switch the phone to the DJI controller

### 5. Disconnect from the PC and reconnect to the RC

- Unplug the phone from the PC.
- Connect the phone to the DJI controller.
- Do not attempt any fresh mission planning or artifact download after switching to the controller unless you reconnect to the PC first.

### 6. Run props-off bench only

Validate all of the following:

- if Assistant 2 was available, the visual observer path agreed with the app during simulator runs
- if Stage 1 was unavailable, the session is treated as `props-off only`
- if Stage 1 was unavailable, the app may continue into `Connection Guide` and `Preflight` for bench checks only
- the app enters `Connection Guide` before `Preflight` in prod mode
- `Connection Guide` distinguishes controller USB, aircraft link, camera stream, GPS waiting, and DJI prerequisite states
- aircraft connected
- RC connected
- product type / firmware visible
- camera stream available
- GPS gate ready
- storage and device health clear
- the previously downloaded mission bundle still satisfies preflight
- `TAKEOFF` remains blocked whenever any gate fails
- `Upload and Takeoff` remains blocked for the whole session when Stage 1 is unavailable
- simulator / waypoint upload / `HOLD` / `RTH` / `Takeover` paths behave correctly

Fallback note:

- If direct attach still does not bring the aircraft online, it is acceptable to use `DJI Fly` once for pairing, activation, or firmware bootstrap, then close `DJI Fly` and return to this app for the operator flow.
- `DJI account` is diagnostic only in the Android operator flow. Do not require operators to bounce through `DJI Fly` on every session once the aircraft has already been bootstrapped.

## Stop Gate

This rollout ends at `props-off bench`.

If Stage 1 was unavailable, this rollout still ends at `props-off bench`. Do not interpret a successful bench or a reachable `Preflight` screen as permission to continue into prop-on.

Stop and report before any of these:

- prop-on
- hover test
- field movement

Because the current location is a no-fly zone, do not perform any prop-on or field flight from this environment.

## Failure Conditions

Do not continue if any of these fail:

- DJI SDK registration does not complete
- authenticated mission planning fails
- artifact checksum validation fails
- cached bundle does not satisfy preflight after switching to the RC
- unexplained state transition appears in the app
- blackbox or incident export does not capture the session
