# Sprint 4 Plan: UI, Demo Mode, QA

## Goal

Build operator-facing mission UI, wire demo mode, then run browser-style QA and performance checks where applicable.

## Scope

- 6 mission screens
- clear loading / empty / error / success / partial states
- demo mode events and replay
- visual polish pass against `docs/ui-mission-flow.md`

## Deliverables

- Mission Setup
- Preflight Checklist
- In-Flight Main
- Branch Confirm
- Inspection Capture
- Emergency / Hold / RTH
- demo controls and fake telemetry replay

## Acceptance

- Demo path can run without aircraft
- Risk states explain reason and next step
- UI keeps emergency actions obvious

## Risks

- Demo/debug controls can leak into primary UI if not isolated
- Generic dashboard drift must be actively prevented

## Not In Scope

- Desktop control station
- marketing site
- long-form analytics dashboards
