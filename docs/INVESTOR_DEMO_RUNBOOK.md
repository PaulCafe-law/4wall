# Investor Demo Runbook

## Goal

Show a believable, conservative operator workflow for a Mini 4 Pro building route assistant without implying unsupported autonomy.

## Setup

- Use the latest `demo` flavor APK for scripted demo mode.
- Keep `planner-server` available for product narrative, but do not claim it is in the flight loop.
- Have one prepared mission bundle and one known safety stop path.

## Demo Flow

1. Mission Setup
   - Show mission bundle status, artifact readiness, and next step.

2. Preflight Checklist
   - Emphasize that blocked gates prevent takeoff.
   - State explicitly that incomplete or invalid artifacts cannot launch.

3. In-Flight Main
   - Show corridor transit telemetry.
   - Mention backlog uploads are non-blocking and offline-safe.

4. Branch Confirm
   - Trigger a model uncertainty moment.
   - Show that human override is available and timeout goes to `HOLD`.

5. Inspection Capture
   - Require `Align View` before `Capture`.
   - Explain that virtual stick is limited to local correction only.

6. Emergency / Hold / RTH / Takeover
   - Trigger `HOLD`.
   - Read the `why stopped` and `next step` copy aloud.
   - Show `Resume`, `RTH`, and bottom-rail `TAKEOVER`.

## Talking Points

- Android app is the flight-critical runtime.
- Server plans routes and serves artifacts only.
- Any uncertainty resolves to `HOLD` first.
- This beta is designed to be understandable and interruptible by the operator.

## Do Not Claim

- Full SLAM
- Free-space autonomous steering
- Server-issued stick commands
- Continuous virtual stick corridor following
