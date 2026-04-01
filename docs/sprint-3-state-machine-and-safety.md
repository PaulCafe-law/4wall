# Sprint 3 Plan: State Machine And Safety

## Goal

Implement the full flight state machine and bounded local avoidance behavior described in `docs/state-machine.md`.

## Scope

- Full reducer transitions
- Transition guard logic
- Local avoider bounded outputs
- Failure mode tests
- ASCII diagrams in code and tests

## Deliverables

- all required states and events
- conservative handling for timeout, frame drop, battery, manual override
- transition tests
- failure-mode tests

## Acceptance

- Every documented state and event exists in code
- Reducer never advances on uncertainty
- Tests prove HOLD and RTH escalation paths

## Risks

- Reducer complexity can sprawl if UI or DJI concerns leak into domain
- Resume-from-hold paths need strict guards

## Not In Scope

- Advanced trajectory generation
- Real hardware validation
