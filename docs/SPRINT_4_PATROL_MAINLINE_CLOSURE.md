# Sprint 4 Patrol Mainline Closure

## Goal

Close the production patrol chain:

`Web route -> create flight task -> mission.kmz / mission_meta.json -> Android assigned bundle download -> DJI MSDK KMZ upload -> takeoff -> waypoint loop -> return to L -> Android landing`.

## Current Gap

- The control plane can create route-owned `L + ordered waypoints + implicit RTL` geometry.
- Android can authenticate, download artifacts, cache them, and call DJI MSDK upload / start / takeoff / landing adapters.
- The missing production bridge is that Android prod patrol still used a local default mission request, and the server KMZ artifact was only a placeholder zip.

## Implementation Contract

- Web route remains planning authority only. It never sends stick control and never enters the flight-critical loop.
- Route flight-task creation turns the selected route into a mission, an assigned dispatch, and mission artifacts. It must fail closed if route, mission, dispatch, or site ownership is inconsistent.
- Template and schedule records stay available for advanced operations, but they are not required for the v1 short-loop hardware path.
- `mission.kmz` must contain DJI WPML files:
  - `wpmz/template.kml`
  - `wpmz/waylines.wpml`
- The executable path is always `L -> waypoint[1..N] -> L`.
- The KMZ finish action is `noAction`. Android owns landing through `startAutoLanding()`, landing confirmation, timeout, and RC fallback.
- Android `Outdoor Patrol` downloads the assigned dispatch bundle. It no longer generates a prod patrol request from hard-coded coordinates.
- Android V1 prod is patrol-only for this closure. `Indoor Manual` and `Outdoor Manual Pilot` are not selectable production modes in this pass.

## Field Runbook

1. Internal user creates or edits a route in `/control-plane/routes`.
2. Internal user clicks `送到飛行 App` on the route.
3. Control plane creates the mission, assigns it to `fieldpilot`, and generates mission artifacts.
4. Field operator logs into Android.
5. Android downloads `/v1/operator/missions/active-bundle`.
6. Android verifies artifact checksums, schema, and KMZ structure.
7. Android uploads `mission.kmz` through DJI MSDK.
8. Operator performs app takeoff or confirms stable RC hover.
9. Android starts the waypoint mission.
10. DJI executes `L -> 1..N -> L`.
11. Android starts landing after mission completion and applies DJI confirmation / RC fallback rules.

## Acceptance

- Staging mission detail links route, dispatch, `mission.kmz`, and `mission_meta.json`.
- Unzipping `mission.kmz` shows valid XML at `wpmz/template.kml` and `wpmz/waylines.wpml`.
- Android prod patrol sync does not call `/v1/missions/plan`.
- A Mini 4 Pro bench run can upload the assigned KMZ without failing local KMZ validation.
- Field validation remains blocked until props-off bench and controlled short-loop protocol pass.
