# Demo Script

## Goal

Show a conservative, road-network-following building inspection flow that feels real without pretending full autonomy.

## Preconditions

- Aircraft and controller connected
- Demo-safe flight area cleared
- Mock or preplanned mission bundle ready
- Operator briefed on `HOLD`, `RTH`, and manual takeover

## Live Demo Timeline

```text
00:00  Mission Setup
00:30  Preflight passes
01:00  Mission uploaded
01:20  Takeoff
02:00  Transit on corridor
02:30  Branch confirm event
03:00  Obstacle warn or local avoid example
03:30  Viewpoint approach and align
04:00  Capture
04:30  Auto-hold
05:00  RTH or manual wrap
```

## Script

### 1. Mission Setup

- Show mission summary, corridor count, verification points, viewpoints
- Explicitly point out whether this run uses real or mock bundle

Narration:

`The phone has the full mission bundle locally. The server planned the route earlier, but it is not in the flight-critical loop now.`

### 2. Preflight

- Walk through checklist
- Show one warning and one blocker resolution if available

Narration:

`We do not arm if the app, aircraft, or mission health is ambiguous. Conservative gating comes first.`

### 3. Transit

- Start waypoint mission
- Keep In-Flight Main visible
- Call out corridor deviation indicator and fixed emergency actions

Narration:

`The main leg stays on waypoint mission. We only use low-speed micro-adjustments when the plan allows it.`

### 4. Branch Confirm

- Trigger verification point
- Show branch confirm screen
- Demonstrate left, right, or straight result

Narration:

`The mobile model does not fly the drone. It only helps confirm which branch to follow. If confidence drops or it times out, we hold.`

### 5. Local Avoid Example

- Trigger `OBSTACLE_WARN`
- Show limited avoider outputs

Narration:

`Local avoidance is intentionally bounded. It can slow, hold, or nudge. It cannot invent a new route.`

### 6. Inspection Capture

- Reach viewpoint
- Show align and capture readiness
- Capture photo

Narration:

`Once we reach the exterior viewpoint, the system settles into a stable hover and confirms framing before capture.`

### 7. Hold And Exit

- End in `HOLD`
- Optionally trigger `RTH`

Narration:

`Any uncertainty ends in hold first. Return-to-home or manual takeover are explicit operator decisions, except for battery-critical escalation.`

## Demo Variants

- Full happy path
- Branch verify timeout to HOLD
- Obstacle hard stop to HOLD
- Battery critical to RTH

## Failure Handling Lines

- `This is expected. The system is designed to stop when confidence drops.`
- `The app is proving bounded autonomy, not pretending full autonomy.`
- `The planner is out of the loop here. Safety is local to the phone and aircraft.`
