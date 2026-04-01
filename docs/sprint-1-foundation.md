# Sprint 1 Plan: Android Foundation

## Goal

Create a minimal compilable Android app skeleton with package structure, mission domain models, adapter abstractions, fake demo adapters, repositories, reducer baseline, and unit tests.

## Scope

- Bootstrap `android-app/`
- Add required package structure
- Define mission models and adapter interfaces
- Add fake/demo adapters
- Add reducer and safety policy primitives
- Add unit tests for models, fakes, reducer basics

## Deliverables

- Android Kotlin project compiles
- `MissionBundle`, `CorridorSegment`, `VerificationPoint`, `InspectionViewpoint`
- `WaypointMissionAdapter`, `VirtualStickAdapter`, `CameraStreamAdapter`, `PerceptionAdapter`
- `MissionRepository`, `FlightLogRepository`
- `FlightState`, `FlightEventType`, `FlightReducer`, `TransitionGuard`
- `SafetySupervisor`, `HoldPolicy`, `RthPolicy`
- fake adapter implementations
- unit tests

## Acceptance

- Demo mode boots without real DJI SDK
- Reducer handles conservative defaults
- Tests run locally

## Risks

- No existing repo or Gradle wrapper, so bootstrap risk is front-loaded
- DJI adapter must stay abstract to avoid fake and real coupling

## Not In Scope

- Full state machine implementation
- Real DJI SDK integration
- Planner server
