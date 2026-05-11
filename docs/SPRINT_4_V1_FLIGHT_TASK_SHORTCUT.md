# Sprint 4 V1 Flight Task Shortcut

## Goal

The v1 product path is the shortest hardware-validation loop:

`Site -> Route(L + waypoint[1..N] + implicit return to L) -> create flight task -> mission.kmz / mission_meta.json -> Android fieldpilot sync -> DJI MSDK execution`.

This is intentionally narrower than the full control-plane operating model. Template, schedule, and full dispatch boards stay available for compatibility and future operations, but they must not block the v1 flight loop.

## Product Decision

- `Site` provides customer context and map anchoring.
- `Route` is the primary planning asset for v1 security patrol.
- `Mission` is the concrete flight attempt generated from a route.
- `DispatchRecord` remains the internal assignment record because Android active-bundle lookup is assignee based.
- `MissionArtifact` remains the delivery contract for `mission.kmz` and `mission_meta.json`.
- `fieldpilot` is the default Android operator assignee for the shortcut.

## Implementation Contract

- Add `POST /v1/control-plane/routes/{routeId}/flight-task`.
- The endpoint validates route/site/organization ownership.
- The endpoint creates a mission and an assigned dispatch for the route.
- The endpoint calls existing dispatch materialization, so DJI WPML KMZ generation stays in one backend path.
- Route launch point and at least one patrol waypoint are required.
- Template and schedule ids are left null in the generated dispatch.
- The UI uses the words `建立飛行任務` and `產生任務包`; it does not expose the internal term `materialize`.

## Safety Boundary

The shortcut only produces a mission bundle and assigns it to Android. It does not add web-side flight authority, browser manual flight, or server-issued stick control. Android remains the only flight-critical runtime.

## Acceptance

- Internal web user can create a route and click one button to generate a mission bundle for `fieldpilot`.
- Android `fieldpilot` can download that assigned bundle through `/v1/operator/missions/active-bundle`.
- `mission.kmz` remains DJI WPML KMZ with `wpmz/template.kml` and `wpmz/waylines.wpml`.
- Existing template, schedule, dispatch, report, support, and live-ops paths continue to work.
