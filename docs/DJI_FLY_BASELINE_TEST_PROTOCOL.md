# DJI Fly Baseline Test Protocol

## Purpose

Use this protocol when the 4Wall AI Android waypoint executor rejects or starts
a mission but the Mini 4 Pro does not enter waypoint flight.

This is not a replacement for the 4Wall AI app. It is a hardware and site
baseline that answers one question:

Can DJI's own app fly a simple waypoint mission on the same Mini 4 Pro, RC-N2,
phone, account, firmware, fly zone, GPS, and Home Point conditions?

Do not continue tuning WPML or MSDK start overloads until this baseline is known.

## Scope

This test is a diagnostic gate for Sprint 4 Outdoor Patrol only.

The operator manually creates and starts the waypoint route in DJI Fly. The
4Wall app, planner server, and desktop web app do not automate DJI Fly and do
not issue flight control during this baseline.

This protocol does not add web flight control, server stick control, or
virtual-stick waypoint following. Android remains the only flight-critical
runtime in the 4Wall product path.

## Preconditions

- Same Mini 4 Pro used for the failed 4Wall test.
- Same RC-N2 used for the failed 4Wall test.
- Same phone used for the failed 4Wall test.
- Same field location, or a safer open field with equivalent airspace status.
- DJI Fly is installed and logged in.
- Firmware and aircraft activation prompts are cleared.
- Battery, propellers, obstacle environment, and weather are safe for a short
  waypoint test.
- The 4Wall AI app is fully closed before opening DJI Fly.

## Native DJI Fly Baseline

Run this first. It tests the aircraft and DJI waypoint capability without our
app or our KMZ.

1. Close the 4Wall AI app.
2. Open DJI Fly.
3. Wait for GPS readiness and Home Point recording.
4. Manually create the simplest waypoint mission possible in DJI Fly:
   - 2 waypoints only.
   - Waypoint height: `50m`.
   - Flight speed: `2.5 m/s`.
   - No photo action.
   - No video action.
   - No gimbal action.
   - Finish action: return home / RTH.
5. Manually start the DJI Fly waypoint mission.
6. Observe whether the aircraft:
   - starts the waypoint task from the ground or current hover state,
   - climbs to mission height,
   - flies to waypoint 1,
   - flies to waypoint 2,
   - returns home or finishes according to DJI Fly configuration.

## Evidence To Capture

Capture these artifacts immediately after the run:

- Screenshot or video of DJI Fly waypoint settings.
- Screenshot or video of DJI Fly execution status.
- Whether the aircraft physically moved to waypoint 1.
- Any DJI Fly warning or rejection text.
- Firmware versions if DJI Fly shows an aircraft or RC compatibility warning.
- If DJI Fly offers export/share for the waypoint mission, export the KMZ.

If no KMZ export is available, screenshots and flight behavior are still enough
to decide the next branch.

## Interpretation

### DJI Fly Also Cannot Fly Waypoints

Stop changing 4Wall WPML and MSDK executor code.

The current blocker is likely outside our KMZ format:

- Mini 4 Pro firmware / aircraft capability.
- RC-N2 compatibility path.
- DJI account or activation state.
- Fly zone / authorization state.
- GPS or Home Point state.
- Site condition or DJI Fly safety gate.

Record the DJI Fly error and resolve that platform condition before returning to
4Wall waypoint execution.

### DJI Fly Flies Successfully

The aircraft, RC, account, firmware, fly zone, GPS, and Home Point path are good
enough for DJI waypoint flight.

The remaining blocker is in the 4Wall path:

- Android WPMZ model generation.
- Server WPML generation.
- MSDK upload/start sequence.
- A mismatch between DJI Fly's mission shape and our generated mission shape.

The next diagnostic should compare or replay a DJI Fly golden KMZ if one can be
exported.

### DJI Fly Exports A KMZ

Treat that file as the highest-value baseline artifact.

Next steps:

1. Inspect `wpmz/template.kml` and `wpmz/waylines.wpml`.
2. Compare namespace, `missionConfig`, `droneInfo`, `payloadInfo`, waypoint
   placemarks, speed, height, action groups, and finish action against the
   Android-generated `android_wpmz` file.
3. Replay the DJI Fly KMZ through the same Android MSDK executor lab.

If DJI Fly's own KMZ also fails through MSDK upload/start, escalate the risk to
the Mini 4 Pro + RC-N2 + MSDK waypoint executor support path.

If DJI Fly's KMZ starts through MSDK, align our Android WPMZ/server WPML output
to the DJI Fly shape before another field attempt.

## Stop Conditions

Stop the baseline and do not continue the field run if:

- DJI Fly reports a blocking fly-zone or authorization error.
- Home Point is not recorded.
- GPS is not stable.
- The route is near people, vehicles, buildings, trees, or power lines.
- The operator cannot maintain VLOS.
- Any unexpected autonomous behavior occurs.

## Result Template

Record the result in the field notes:

```text
Date/time:
Location:
Aircraft:
RC:
Phone:
DJI Fly version:
Aircraft firmware:
RC firmware:
GPS / satellites:
Home Point recorded: yes/no
Waypoint count:
Height:
Speed:
Actions disabled: yes/no
Finish action:
DJI Fly started mission: yes/no
Aircraft flew to waypoint 1: yes/no
Aircraft flew to waypoint 2: yes/no
Returned home / finished: yes/no
Warnings or errors:
KMZ exported: yes/no
Notes:
```
