# Building Route Assistant

Mini 4 Pro investor-demo scaffold for a conservative building route assistant.

The repo is split into two runtime boundaries:

- `android-app/`: operator-facing Android app, flight-critical loop, demo UI, safety state machine
- `planner-server/`: planning-only FastAPI service that produces mission bundles and mock artifacts

## Safety Position

- The server plans, it does not fly.
- The Android app owns preflight gating, execution state, and fail-safe escalation.
- Uncertainty defaults to `HOLD`.
- `RTH` is reserved for battery-critical or explicit operator command.

## Current Status

- Core architecture, API, state machine, UI flow, and sprint docs are under `docs/`
- Android demo app compiles, runs unit tests, builds a debug APK, and exposes a 6-screen operator flow
- Planner server serves a mission-planning skeleton with in-memory artifacts and pytest coverage

## Repo Layout

```text
docs/
  architecture, API, state machine, UI flow, demo script, sprint plans

android-app/
  Kotlin Android app
  Jetpack Compose operator UI
  conservative state machine + fake DJI adapters

planner-server/
  FastAPI planner skeleton
  mock route provider
  mock KMZ + mission metadata artifacts
```

## Verification Commands

Android:

```powershell
Set-Location .\android-app
.\gradlew.bat --no-daemon testDebugUnitTest assembleDebug lintDebug
```

Planner server:

```powershell
Set-Location .\planner-server
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m pytest
```

Run the local planner server:

```powershell
Set-Location .\planner-server
.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload
```

## Demo Flow

1. Load the mock mission in `Mission Setup`
2. Review and approve `Preflight Checklist`
3. Upload and start from `Preflight`
4. Use `In-Flight Main` to trigger branch, obstacle, and inspection events
5. Use `Branch Confirm` to confirm, timeout, or escalate
6. Use `Inspection Capture` to align first, then capture
7. Use the bottom rail or `Emergency` screen for `HOLD`, `RTH`, and manual takeover

## Key Docs

- `docs/architecture-building-route-assistant.md`
- `docs/api-spec.md`
- `docs/state-machine.md`
- `docs/ui-mission-flow.md`
- `docs/demo-script.md`
- `docs/failsafe-table.md`
- `INVESTOR_DEMO_CHECKLIST.md`
