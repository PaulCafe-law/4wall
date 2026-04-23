# Investor Demo Checklist

## Before Demo

- Android phone is charged and screen lock is disabled for the session
- `android-app` debug build is installed and launchable
- Demo operator knows the bottom rail controls: `HOLD`, `RTH`, `TAKEOVER`
- If using the planner server live, `planner-server` is running locally and reachable
- If not using the planner server live, confirm the app still has the bundled mock mission

## Demo Path

### 1. Mission Setup

- Show mission ID, segment count, verification points, and inspection viewpoints
- Tap `Load Mock Mission`
- Confirm the app moves into `Preflight`
- If asked about architecture, state that planning happened earlier and the server is out of the control loop

### 2. Preflight Checklist

- Point out checklist rows and explicit blockers
- Tap `Approve Preflight`
- Confirm upload CTA becomes available
- Tap `Upload + Start`

### 3. In-Flight Main

- Show state banner and telemetry strip
- Call out that `HOLD`, `RTH`, and `TAKEOVER` remain visible in the bottom rail
- Optional: tap `Replay` to show synthetic telemetry

### 4. Branch Confirm

- Tap `Branch Confirm`
- Show countdown and confidence line
- Choose one of:
  - `LEFT`, `STRAIGHT`, or `RIGHT` for happy path
  - `Timeout` to prove conservative hold behavior

### 5. Obstacle Example

- From `In-Flight Main`, tap `Obstacle Warn`
- Explain that bounded autonomy can only slow, hold, or nudge
- Optional: tap `Hard Stop` to move into hold-mode escalation

### 6. Inspection Capture

- Tap `Approach Inspection Viewpoint`
- Tap `Align View`
- Confirm `Capture` is only enabled after alignment
- Tap `Capture`

### 7. Emergency / Exit

- If in `HOLD`, explain that resume is intentionally unavailable
- Use bottom rail `RTH` if you want the recovery path
- In `Emergency`, tap `Mark RTH Arrived`, then `Complete Landing`
- Optional: use `TAKEOVER` to demonstrate manual authority

## Talk Track Reminders

- Say `bounded autonomy`, not `fully autonomous`
- Say `uncertainty goes to hold`
- Say `server planned earlier, phone and aircraft handle safety now`
- Say `local avoidance cannot invent a new route`

## Red Flags

- Do not imply the server is issuing live control commands
- Do not tap `Capture` before `Align View`
- Do not describe `Resume` as available from `HOLD`
- Do not claim branch confirmation is guaranteed; it is intentionally timeout-safe
