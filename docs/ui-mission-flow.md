# UI Mission Flow

## Design Direction

This app is a pilot console for field operations. It is not a dashboard.

- Portrait phone is the primary target.
- One-hand use matters more than dense telemetry.
- Mission progress is prominent, but emergency controls always outrank progress UI.
- `HOLD`, `RTH`, and `TAKEOVER` stay visible as fixed, oversized actions on in-flight screens.
- Every HOLD surface must explain `why it stopped` and `what to do next` above the fold.

## Screen Set

- Mission Setup
- Preflight Checklist
- In-Flight Main
- Branch Confirm
- Inspection Capture
- Emergency / Hold / RTH / Takeover

## Information Architecture

```text
Mission Setup
  1. mode badge (demo / prod)
  2. mission source and operator session
  3. artifact readiness
  4. mission summary
  5. continue CTA

Preflight Checklist
  1. aircraft / RC / stream / GPS readiness
  2. mission artifact validity
  3. health and fly-safe blockers
  4. upload / start CTA

In-Flight Main
  1. state banner
  2. emergency rail
  3. mission progress
  4. corridor / obstacle / branch cards
  5. telemetry strip

Branch Confirm
  1. live frame
  2. branch choices
  3. timeout and confidence
  4. manual override / hold actions

Inspection Capture
  1. viewpoint label
  2. framing and alignment state
  3. capture readiness
  4. hold action

Emergency / Hold / RTH / Takeover
  1. active reason
  2. next step
  3. stage-specific primary action (`Resume` / `Confirm RTH` / `Confirm Landing`)
  4. bottom rail `HOLD / RTH / TAKEOVER`
```

## Mission Flow

```text
Mission Setup
  -> authenticate and load mission
  -> verify artifacts
  -> Preflight Checklist
  -> Upload + Start
  -> In-Flight Main
     -> Branch Confirm at verification point
     -> Inspection Capture at viewpoint
     -> Emergency screen on HOLD / RTH / TAKEOVER paths
```

## Screen State Coverage

| Screen | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| Mission Setup | downloading artifacts, CTA disabled | no mission selected | auth failure or bundle download failure | bundle verified, ready for preflight | mission present but artifact incomplete |
| Preflight Checklist | probes running | no aircraft / RC | blocking gate failed with reason | all gates green, upload enabled | non-blocking warnings remain |
| In-Flight Main | telemetry connecting | no live telemetry yet | stream or adapter degraded | live mission progress | stale telemetry with last-updated time |
| Branch Confirm | frame analysis running | no frame | timeout or unknown result | explicit branch confirmed | frame available but low confidence |
| Inspection Capture | alignment settling | no viewpoint data | capture or camera failure | capture confirmed | alignment partial, capture blocked |
| Emergency | transition pending | n/a | requested action blocked | HOLD / RTH / TAKEOVER active and actionable | resume available but waiting for operator |

## Human Factors Rules

- Emergency actions never hide behind overflow menus.
- Branch confirm always supports human override.
- Timeout fallback is explicit, not silent.
- The UI never implies it is safe to resume without passing reducer guards.
- Demo mode is clearly labeled so it cannot be mistaken for real hardware state.
- `HOLD` must expose `why stopped` and `next step` above the fold before any telemetry detail.

## Demo And Prod

### Demo

- load mock mission
- inject telemetry and obstacle events
- replay reducer scenarios

### Prod

- show hardware connection state
- show preflight blockers sourced from policy
- hide demo injection affordances

## Reusable Patterns

- state banner
- emergency rail
- telemetry strip
- reason card
- checklist row
- artifact readiness card

## Not In Scope

- route editing on device
- fleet dashboard
- ornamental marketing UI
