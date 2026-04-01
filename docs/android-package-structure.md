# Android Package Structure

## Root Package

`com.yourorg.buildingdrone`

## Package Map

```text
com.yourorg.buildingdrone.app
  App bootstrap, dependency wiring, app-level config

com.yourorg.buildingdrone.core
  Shared primitives, Result wrappers, clocks, dispatchers, identifiers

com.yourorg.buildingdrone.data
  Mission parsing, repositories, fake/demo data sources

com.yourorg.buildingdrone.dji
  DJI Mobile SDK adapter boundary and fake adapters

com.yourorg.buildingdrone.domain.route
  Corridor tracking, progress, deviation thresholds

com.yourorg.buildingdrone.domain.avoid
  Local avoidance policy and output arbitration

com.yourorg.buildingdrone.domain.inspection
  Viewpoint approach, alignment readiness, capture intent

com.yourorg.buildingdrone.domain.semantic
  Branch verify and landmark confirm orchestration

com.yourorg.buildingdrone.domain.safety
  Safety supervisor, hold policy, RTH policy, health checks

com.yourorg.buildingdrone.domain.statemachine
  FlightState, FlightEventType, reducer, transition guards

com.yourorg.buildingdrone.feature.preflight
  Preflight screen state, checklist use cases, UI models

com.yourorg.buildingdrone.feature.mission
  Mission setup flow, bundle load, demo mode load

com.yourorg.buildingdrone.feature.transit
  In-flight main screen, telemetry strip, mission progress

com.yourorg.buildingdrone.feature.branchverify
  Branch confirm screen and state

com.yourorg.buildingdrone.feature.inspection
  Inspection capture screen and overlay state

com.yourorg.buildingdrone.feature.emergency
  Hold, RTH, takeover screen state and actions

com.yourorg.buildingdrone.ui
  Shared design primitives, theme, reusable components
```

## Dependency Direction

```text
feature -> domain -> data/dji/core
ui -> core
app -> all

Rules:
  feature packages do not talk directly to DJI SDK types
  domain packages do not depend on Compose or Android views
  dji package is the only place allowed to know concrete MSDK APIs
  fake adapters implement the same interfaces as real adapters
```

## Suggested Source Layout

```text
android-app/
  app/
    src/main/java/com/yourorg/buildingdrone/...
    src/test/java/com/yourorg/buildingdrone/...
```

## Inline Diagram Targets

Implementation should keep ASCII diagrams close to:

- reducer and transition guard code
- route corridor tracker
- safety supervisor
- complex fake telemetry replay scenarios in tests
