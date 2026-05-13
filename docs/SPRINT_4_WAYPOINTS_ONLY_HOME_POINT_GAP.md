# Sprint 4 Waypoints-Only Home Point Gap

## Decision

Sprint 4 patrol route planning now follows the DJI Fly-style operator model:

- The web app plans only ordered patrol waypoints: `1..N`.
- The route editor does not define a launch point.
- The aircraft launch / return reference is the DJI Home Point recorded by Android at takeoff time.
- Patrol waypoint altitude is fixed at `10m`.
- Patrol waypoint speed is fixed at `1.5m/s`.

## Why This Changes The Mainline

The previous Sprint 4 model stored a route-owned `L` and generated executable KMZ paths as:

`L -> waypoint[1..N] -> L`

That made the web route editor look like it knew the aircraft placement before a field operator arrived. For the Mini 4 Pro patrol flow, the safer and clearer v1 model is:

`current aircraft placement / DJI Home Point -> waypoint[1..N] -> DJI finishAction goHome`

The web and server remain planning / artifact surfaces only. They do not enter the flight-critical loop.

## Required Implementation Changes

- Web route editor must stop rendering and editing `L`.
- New route drafts must only contain ordered waypoints.
- Legacy route launch-point data may remain in storage, but v1 materialization ignores it.
- Backend materialization must accept routes without `launchPoint`.
- Mission bundle / meta must mark launch as runtime-derived through `launchPointSource = aircraft_home_point_at_takeoff`.
- KMZ must include only the ordered waypoint placemarks.
- KMZ height and speed fields must be fixed to `10m` and `1.5m/s`.
- Android must accept mission bundles with `launchPoint = null`.
- Android outdoor patrol preflight must treat DJI Home Point readiness as the launch / return gate.
- KMZ must set `finishAction = goHome` so the DJI waypoint mission returns to the runtime Home Point after the last waypoint.

## Safety Boundary

Waypoint execution and return-home remain under DJI MSDK authority. Android monitors the result and owns local landing / fallback actions through DJI MSDK. The server and web app do not issue stick control, return-home control, or landing control.
