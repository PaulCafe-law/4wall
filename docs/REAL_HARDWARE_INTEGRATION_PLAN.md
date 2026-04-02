# Real Hardware Integration Plan

## Goal

Move from demo-only Android behavior to production-mode DJI MSDK integration for Mini 4 Pro, while preserving the fake/demo path.

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
| KMZ mission load / upload / execute | upload and execute on supported firmware | simulator then bench |
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
4. Validate simulator enable and basic transit / hold / RTH flows.
5. Validate KMZ mission metadata parsing and upload.
6. Validate limited virtual stick only in approved local-correction windows.
7. Validate camera stream and perception listeners.
8. Validate device health, fly-safe, and account preflight blockers.
9. Run tethered bench tests before any prop-on test.
10. Run controlled field protocol only after all bench gates are green.

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

## Bench-To-Field Flow

```text
compile -> register -> connect -> simulator -> tethered bench -> prop-off bench
-> prop-on controlled field -> supervised corridor rehearsal -> inspection beta
```
