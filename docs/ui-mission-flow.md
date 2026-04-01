# UI Mission Flow

## Design Direction

This app is an operator console, not a generic SaaS dashboard.

Design choices:

- Primary tone: field operations, calm but urgent when needed
- Visual hierarchy: mission progress first, safety actions second, diagnostics third
- Typography: `IBM Plex Sans` for UI, `IBM Plex Mono` for telemetry and codes
- Color roles:
  - safe: deep green
  - caution: amber
  - emergency: signal red
  - neutral surfaces: graphite / warm gray
- Buttons for `HOLD`, `RTH`, `TAKEOVER` stay fixed and oversized in all in-flight screens

## Screen Set

- Mission Setup
- Preflight Checklist
- In-Flight Main
- Branch Confirm
- Inspection Capture
- Emergency / Hold / RTH

## Information Architecture

```text
Mission Setup
  1. Mission source
  2. Mission summary
  3. Artifact readiness
  4. Demo mode controls

Preflight Checklist
  1. Aircraft + controller + app health
  2. Mission validity
  3. Safety gate results
  4. Arm / upload CTA

In-Flight Main
  1. State banner
  2. Emergency controls
  3. Mission progress
  4. Corridor / branch / obstacle cards
  5. Telemetry strip

Branch Confirm
  1. Live frame
  2. Candidate branch choices
  3. Timeout / confidence
  4. Hold / takeover CTA

Inspection Capture
  1. Framing overlay
  2. Capture readiness
  3. Current viewpoint checklist

Emergency / Hold / RTH
  1. Active reason
  2. Required operator action
  3. RTH / takeover / dismiss unavailable states
```

## Mission Flow

```text
Mission Setup
  -> load mock or planned mission
  -> open Preflight Checklist without auto-approving it
  -> approve checklist
  -> In-Flight Main
     -> Branch Confirm when verification point reached
     -> Inspection Capture when viewpoint reached
     -> Emergency screen whenever HOLD / RTH / takeover state is active
```

## Implemented Demo Controls

- Mission Setup:
  - `Load Mock Mission`
  - `Demo Replay`
  - `Open Preflight Checklist`
- Preflight Checklist:
  - `Approve Preflight`
  - `Upload + Start`
- In-Flight Main:
  - `Replay`
  - `Branch Confirm`
  - `Obstacle Warn`
  - `Hard Stop`
  - `Clear`
  - `Approach Inspection Viewpoint`
- Branch Confirm:
  - `LEFT`
  - `STRAIGHT`
  - `RIGHT`
  - `Timeout`
  - `Hold`
  - `Takeover`
- Inspection Capture:
  - `Align View`
  - `Capture` only after align succeeds
  - `Hold`
- Emergency:
  - primary action changes by state:
    - `Mark RTH Arrived`
    - `Complete Landing`
  - `Abort Manual` only during manual override

## Interaction State Coverage

| Feature | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| Mission Setup | fetching bundle spinner + disabled CTA | no mission loaded illustration + load mock action | download failed with retry | mission summary and continue CTA | bundle loaded but artifact missing |
| Preflight Checklist | checklist probes running | no aircraft connected | failed check with exact reason | all checks green, upload enabled | some non-blocking warnings |
| In-Flight Main | telemetry connecting | no live telemetry yet | stream degraded or adapter error | live mission progress | stale telemetry, last updated timestamp shown |
| Branch Confirm | model analyzing frame | no frame available | timeout / unknown result | explicit left/right/straight confirmation | frame available but low confidence |
| Inspection Capture | alignment settling | no viewpoint data | capture failed | capture confirmed | partial framing alignment |
| Emergency Screen | fail-safe action pending | n/a | action unavailable | hold / rth / takeover active and visible | RTH requested but blocked by condition |

## User Journey And Emotional Arc

| Step | User Does | User Feels | UI Must Do |
|---|---|---|---|
| 1 | Loads mission | cautious | show exactly what will fly and what is mock |
| 2 | Runs preflight | focused | surface blockers fast, no hidden checks |
| 3 | Starts mission | alert | keep emergency actions anchored and obvious |
| 4 | Sees branch confirm | high attention | simplify to one choice, one timer, one fallback |
| 5 | Reaches capture | relief | show framing confidence and capture status clearly |
| 6 | Sees hold or RTH | urgency | explain reason and next action in one screen |

## Responsive Rules

- Portrait phone is primary layout
- Tablets keep same priority order, but telemetry can move to side rail
- No hidden emergency controls behind overflow menus
- Minimum touch target size is 44dp
- Landscape mode keeps video and emergency controls visible together

## Accessibility Rules

- Screen reader labels for every mission state, risk badge, and emergency button
- Red state is never color-only, always paired with explicit text reason
- Important state transitions trigger accessibility announcement
- Timers show both countdown number and text state
- Demo mode badges are explicit to prevent operator confusion

## Demo Mode Design

Demo mode adds:

- load mock mission bundle
- start mock telemetry
- inject branch verify result
- inject obstacle warn / hard stop
- replay mission progress timeline

Demo controls live in screen-local action clusters, while the emergency rail remains globally visible and separate.

## What Already Exists

No existing design system or app UI exists in this repo. The first implementation should establish reusable patterns:

- state banner
- emergency action rail
- telemetry strip
- risk reason card
- checklist row

## Not In Scope

- map-heavy route editing on device
- post-flight analytics dashboard
- multi-mission operations center
- consumer-grade ornamental marketing UI
