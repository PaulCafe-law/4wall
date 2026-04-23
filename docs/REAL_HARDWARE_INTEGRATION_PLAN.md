# Real Hardware Integration Plan

## Goal

Move from demo-only Android behavior to production-mode DJI MSDK integration for Mini 4 Pro, while preserving the fake/demo path and keeping indoor no-GPS as a separate conservative operating profile.

## Hardware Scope

- Aircraft: DJI Mini 4 Pro
- Controller: supported RC for MSDK V5 target bench device
- Mobile device: Android 8+ class device validated against the selected MSDK version

## Prerequisites

- DJI Mobile SDK V5 app key
- DJI developer account with the app registered
- DJI user account login path available on device
- Network package present for activation, account, and fly-safe functions
- Bench device with sufficient storage and supported Android version
- Controlled test environment before any prop-on test

## Supported Capability Targets

| Capability | Beta Expectation | Validation Method |
|---|---|---|
| SDK registration | App registers and exposes registration state | bench |
| Aircraft / RC link | connection state visible in app | bench |
| Product / firmware info | readable in preflight and diagnostics | bench |
| KMZ mission load / upload / execute | upload and execute outdoor patrol routes on supported firmware | simulator then bench |
| Camera stream callback | stream health and frames visible to app | bench |
| Perception snapshot | obstacle / perception data visible when available | bench |
| Virtual stick | limited enable / disable / send for bounded correction windows only | simulator then bench |
| Simulator | enable, disable, state callbacks, scripted flow replay | simulator |
| Account / fly-safe / device health | preflight hooks expose blocking issues | bench |

## Support Matrix Notes

- MSDK support exists for Mini 4 Pro in the V5 product list, but exact behavior must still be bench-validated against the real controller, aircraft firmware, and mobile device combination.
- Simulator coverage is useful but not sufficient for RC loss, fly-zone edge cases, obstacle sensing fidelity, or all camera/perception behaviors.

## Integration Sequence

1. Compile prod flavor with MSDK dependencies and manifest metadata.
2. Validate SDK registration and lifecycle callbacks on device.
3. Validate aircraft / RC connection state and product metadata.
4. Validate simulator enable and basic outdoor patrol transit / hold / RTH flows.
5. Validate patrol-route bundle parsing (`launchPoint + orderedWaypoints + implicitReturnToLaunch + operatingProfile`).
6. Validate KMZ mission metadata parsing and upload for `outdoor_gps_patrol`.
7. Validate indoor profile downgrade behavior (`manual indoor only`) when upload or start is rejected.
8. Validate limited virtual stick only in approved local-correction windows.
9. Validate camera stream and perception listeners.
10. Validate device health, fly-safe, and account preflight blockers.
11. Run tethered bench tests before any prop-on test.
12. Run controlled field protocol only after all bench gates are green.

## Operating Profiles

### Outdoor GPS patrol

- primary v1 path
- route model:
  - `launchPoint`
  - `orderedWaypoints[]`
  - `implicitReturnToLaunch: true`
- Android performs:
  - bundle verification
  - preflight gating
  - KMZ upload
  - takeoff
  - waypoint mission start
  - mission-complete landing flow

### Outdoor manual pilot

- outdoor direct operator control mode
- no waypoint mission start
- Android shows live preview and dual-stick manual pilot UI
- RTH remains available only when the current outdoor flight state permits it
- virtual stick is used only as explicit operator direct control, not as route-following authority

### Indoor no-GPS

- preserved as a distinct profile
- no assumption that waypoint autonomy is available
- `RTH` is unavailable
- if upload or start is rejected, downgrade to `manual indoor only`
- retain conservative recovery only:
  - `HOLD`
  - `LAND`
  - `TAKEOVER`
- Android shows live preview and dual-stick manual pilot UI

## Hard Stop Criteria Before Prop-On

- App key or activation not verified
- Aircraft or RC link unstable
- Mission bundle checksum or schema validation fails
- Camera stream unavailable
- Device storage below threshold
- Device health or fly-safe returns a blocking issue
- GPS status below configured threshold
- Virtual stick guardrails not proven in simulator or bench

## Virtual Stick Guardrails

- Never used for main corridor following
- Only used in local avoid, approach, align recovery, or explicit operator-approved micro-adjust windows
- Low-speed and short-duration only
- Disabled immediately on uncertainty, blocker, or mode mismatch

## Landing Policy

The product may describe full auto takeoff -> patrol -> return -> landing, but the runtime must preserve DJI landing confirmation semantics:

- mission complete -> Android calls `startAutoLanding()`
- if DJI requires confirmation -> app may use `ConfirmLanding`
- if confirmation is rejected, times out, or actual descent is not observed -> fall back to RC-only landing
- indoor and outdoor profiles share the same conservative landing fallback rule

## Bench-To-Field Flow

```text
compile -> register -> connect -> simulator -> tethered bench -> prop-off bench
-> prop-on controlled field -> supervised corridor rehearsal -> inspection beta
```
