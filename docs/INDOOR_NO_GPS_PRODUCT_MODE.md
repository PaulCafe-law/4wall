# Indoor No-GPS Product Mode

## Purpose

Define the official production-beta operating profile for indoor Mini 4 Pro use when GPS is unavailable or below the normal outdoor threshold.

This is a product mode, not a temporary waiver or a debug-only switch.

## Profiles

The Android app now distinguishes between two operating profiles:

- `outdoor_gps_required`
- `indoor_no_gps`

`outdoor_gps_required` remains the default profile for normal field use.

`indoor_no_gps` is intended for controlled indoor test sites where:

- GPS is weak or unavailable
- the RC remains part of the control chain
- the operator can maintain VLOS
- a clear takeoff and landing box is available

## Indoor No-GPS Rules

- GPS does not block takeoff in this profile.
- GPS remains visible as operator telemetry and diagnostic context.
- `RTH` is disabled in this profile.
- Battery critical escalates to `LANDING`.
- RC or link degradation escalates to `HOLD` or the aircraft's native failsafe path.
- `HOLD`, `LAND`, and `TAKEOVER` are the primary emergency decisions.
- Both launch styles are supported:
  - RC manual takeoff / landing
  - app takeoff / app landing
- App landing in this profile follows the DJI landing-protection flow:
  - `LAND` starts auto landing
  - if DJI requests confirmation, the app must show `繼續盤旋` or `強制降落`
  - `強制降落` is defined as DJI MSDK `ConfirmLanding`
- If `ConfirmLanding` is rejected or unreliable on the current aircraft / firmware path, the app must immediately fall back to RC-only landing.
- If RC manual takeoff is used, the app must require an explicit hover confirmation before autonomy can start.
- Indoor autonomy is allowed only after the current hardware path proves it can upload and start the waypoint mission.
- If upload or mission start is rejected on the current hardware / firmware stack, the app must downgrade the session to `manual indoor only`.
- If the operator enters `TAKEOVER`, landing authority transfers to the RC and the app must stop offering app-controlled landing.

## Required Operator Confirmations

Before indoor takeoff, the operator must explicitly confirm:

- this is an indoor no-GPS test site
- `RTH` is unavailable in this mode
- the takeoff / landing box is clear
- a manual observer is ready
- manual takeover is ready on the RC

These confirmations are part of the preflight contract, not a verbal side note.

## Safety Boundary

- The server remains planning-only.
- The Android app remains the flight-critical loop.
- No phone-only direct-control mode is assumed.
- RC-N2/N3 remains part of the supported control chain.
- Any uncertainty still resolves to `HOLD` first.
- Indoor autonomy must not be advertised unless the real aircraft path accepts upload and start.

## Test Order

1. Indoor connection guide and preflight
2. RC manual takeoff -> short hover -> landing
3. App takeoff -> short hover -> landing
4. `HOLD` / `TAKEOVER` / `LAND` validation
   - verify `LAND` can enter landing-confirmation UI
   - verify `繼續盤旋` returns to hover
   - verify `強制降落` maps to MSDK `ConfirmLanding`
   - if `ConfirmLanding` is unavailable, verify RC-only fallback text is shown
5. Indoor autonomy upload / start probe
6. Downgrade to `manual indoor only` immediately if the DJI path rejects autonomy
