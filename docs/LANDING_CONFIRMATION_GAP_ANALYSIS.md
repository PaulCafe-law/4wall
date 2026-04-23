# Landing Confirmation Gap Analysis

## Date

2026-04-13

## Problem

The Android beta exposed a single `LAND` action, but the runtime mixed together two different situations:

- DJI explicitly requires landing confirmation
- the app's local perception warns that the landing zone is unsafe

Those are not the same authority. The first can use DJI MSDK `ConfirmLanding`. The second cannot.

This mismatch caused the observed field failure:

- the operator pressed `LAND`
- the app showed a local obstacle warning
- the operator then pressed an in-app "forced landing" action
- the aircraft did not actually descend
- the app still implied that landing was in progress

## Root Cause

The previous Sprint 4 landing flow had three issues:

1. It treated all landing warnings as if they could be solved with DJI `ConfirmLanding`.
2. It showed raw `ObstacleData(...)` in the operator UI instead of a short human-readable warning.
3. It accepted a successful landing callback as proof of descent, instead of checking whether the aircraft was actually going down.

## Product Decision

The landing flow is now defined as follows:

- `LAND` means `start auto landing`
- if DJI reports `landing confirmation required`, the app shows:
  - `繼續盤旋`
  - `確認繼續降落`
- if only local perception warns that landing is unsafe, the app shows:
  - `繼續盤旋`
  - `改用 RC 強制降落`
- `確認繼續降落` is formally defined as DJI MSDK `ConfirmLanding`
- `改用 RC 強制降落` does not call `ConfirmLanding`; it switches the session to RC-only recovery
- if `ConfirmLanding` is rejected, times out, or proves unreliable on the current `Mini 4 Pro + firmware` path, the session must fall back to `RC-only landing`

## ConfirmLanding Scope

`ConfirmLanding` only applies when DJI itself reports that landing confirmation is required.

It must not be used for local-perception-only warnings. In that case the app may only:

- continue hover
- direct the operator to switch to RC-only landing

The app must also verify real descent after `ConfirmLanding`. A successful callback alone is not enough to declare `降落中`.

## Authority Rules

### App-controlled flight

In app-controlled flight states, the app may:

- request takeoff
- request auto landing
- stop auto landing and return to hover
- confirm landing when DJI requires confirmation

### Manual Override

In `Manual Override`:

- the app must not send auto-landing or confirm-landing commands
- the operator must land with the RC
- the app becomes a safety / status display plus session-closure tool only

## Indoor No-GPS Implication

For `indoor_no_gps`:

- `RTH` remains unavailable
- terminal recovery actions are `HOLD`, `LAND`, and `TAKEOVER`
- if the operator chooses `TAKEOVER`, landing authority transfers to the RC immediately
- app-controlled landing remains valid only while the session is still app-controlled

## Required UI Changes

- operator-facing landing flow must be in Traditional Chinese
- `LAND` must no longer silently fail without explanation
- when landing confirmation is needed, the app must clearly explain:
  - why direct auto landing is blocked
  - whether the warning comes from DJI landing protection or app perception
  - what `繼續盤旋`, `確認繼續降落`, or `改用 RC 強制降落` will do
- raw `ObstacleData(...)` must stay in logs / blackbox, not the main operator UI
- `Manual Override` must show:
  - `請使用 RC 手動降落`
  - `已安全落地`

## Release Impact

Sprint 4 is not complete until:

- landing prompt source is split into DJI confirmation vs local perception warning
- `ConfirmLanding` is used only for the DJI-confirmation path
- local-perception-only landing falls back to RC-only recovery
- the runtime verifies actual descent before declaring `降落中`
- field docs match the shipped UI and authority model
