# Sprint 4 Launch Readiness and Remote Ops Sequencing

## Status

- Date: 2026-04-14
- Sprint boundary: Sprint 4
- Decision: **finish Sprint 4 launch gates first, then start internal-only Remote Ops MVP**

## Why This Sequencing Exists

The narrowest wedge that becomes a real product first is not headquarters remote control.

It is this:

- Android can run a mission safely inside the flight-critical boundary.
- Operators can understand failure states in real time.
- Incidents can be exported and reconstructed after the fact.
- Field procedures are explicit enough that a non-developer operator can actually follow them.

Remote Ops is useful. It is not the next release gate.

The current release gate remains the Sprint 4 definition in [PROD_READINESS_PLAN.md](./PROD_READINESS_PLAN.md):

- simulator
- failsafe UI
- blackbox export
- field docs
- launch-readiness verification

## Premises

1. Android remains the only flight-critical runtime.
2. `planner-server` and `web-app` stay outside the active control loop.
3. AnyDesk is only a remote desktop transport, not a safety boundary.
4. The first Remote Ops user is internal pilot / ops / support, not the customer.
5. Shipping Sprint 4 late because of Remote Ops work is the wrong trade.

## Approaches Considered

### Approach A: Sprint 4 First, Remote Ops Second

- Summary: finish launch-readiness gates, freeze remote ops to docs plus internal beta skeletons, then begin remote ops as a post-gate internal tool.
- Effort: medium
- Risk: low
- Pros:
  - Matches current sprint gate and repo policy.
  - Keeps safety, documentation, and field-readiness work on the critical path.
  - Prevents a control feature from becoming a hidden release dependency.
- Cons:
  - Headquarters remote-control workflow lands later.
  - Live Ops and AnyDesk operations stay partial during Sprint 4.

### Approach B: Dual Track

- Summary: continue Sprint 4 while also pushing Android bridge events and internal Live Ops work in parallel.
- Effort: large
- Risk: medium
- Pros:
  - Preserves momentum on internal remote operations.
  - Allows monitoring features to mature before the control station exists.
- Cons:
  - Splits attention across two high-risk workstreams.
  - Makes acceptance ambiguous if a remote ops task starts blocking Sprint 4.

### Approach C: Remote Ops First

- Summary: prioritize HQ monitoring and remote-control stack before launch-readiness closure.
- Effort: large
- Risk: high
- Pros:
  - Fastest path to a dramatic internal demo.
- Cons:
  - Directly conflicts with Sprint 4 gate sequencing.
  - Risks normalizing a remote-control story before field safety and blackbox workflows are finished.
  - Pulls `web-app` and `planner-server` toward the control loop boundary.

## Recommendation

Choose **Approach A**.

It is the only approach that respects the active sprint boundary, the release gates, and the safety model already locked in `AGENTS.md`.

## Milestone 1: Sprint 4 Launch Readiness

### Android deliverables

Finish the work that makes the field path safe and legible:

- operator-facing failsafe UI for `HOLD`, `RTH`, takeover, uplink loss, and risk explanation
- blackbox export with mission identity, event timeline, telemetry summary, and failure reasons
- simulator and replay-backed validation that covers emergency, hold, return-to-home, and takeover
- UI and reducer behavior that makes "uncertain means HOLD first" visible, not just documented

### Documentation and field operations

Lock the operator runbooks to shipped behavior:

- [FIELD_CHECKLIST.md](./FIELD_CHECKLIST.md)
- [EMERGENCY_PROCEDURES.md](./EMERGENCY_PROCEDURES.md)
- [FLIGHT_TEST_PROTOCOL.md](./FLIGHT_TEST_PROTOCOL.md)

Add a single launch-readiness checklist that maps directly to the Sprint 4 gate in [PROD_READINESS_PLAN.md](./PROD_READINESS_PLAN.md).

The intended audience is the field operator and observer, not the engineering team.

### Web and planner-server limits during this milestone

Allowed:

- visibility improvements needed for launch readiness
- task status clarity
- artifact and blackbox metadata visibility
- auditability improvements tied to release readiness

Not allowed:

- web-issued continuous control
- server-issued stick commands
- Site Control Station product work
- new customer-facing remote control product claims

### Milestone 1 exit criteria

Sprint 4 is done only when all of these are true:

- demo path runs without aircraft
- prod path is blocked until simulator verification passes
- `HOLD`, `RTH`, takeover, uplink loss, server loss, and web loss are explained and testable
- blackbox export is operator-usable and supports incident reconstruction
- field and emergency docs match the actual shipped flow
- staging and production web/api smoke still pass without altering Android safety boundaries

## Milestone 2: Internal Remote Ops MVP

This milestone starts **after** Sprint 4 is green.

### Product boundary

Remote Ops is internal-only:

- internal pilot
- internal ops
- internal support

Customer users may observe status and results. They do not own remote control.

### Delivery order

1. Android bridge emits real `CONTROL_LEASE_UPDATED`, `VIDEO_STREAM_STATE`, `BRIDGE_ALERT`, and `CONTROL_INTENT_ACKNOWLEDGED` events.
2. `planner-server` and `web-app` stabilize internal-only `Live Ops`, support queue, control lease state, and event timeline views.
3. A new Windows `Site Control Station` product is created for actual local desktop control, map/video surface, and emergency actions.
4. AnyDesk SOP, allowlist, 2FA, observer handoff, and lease policy are finalized last.

### Interface additions for Milestone 2

Expected post-Sprint-4 additions:

- `shared-schemas`: `FlightSession`, `TelemetrySample`, `VideoChannelDescriptor`, `ControlLease`, `ControlIntent`, `ControlAck`, `SafetyGateStatus`
- `planner-server`: internal-only flight session, telemetry, video metadata, support queue, and control lease APIs
- `web-app`: internal-only `Live Ops`, `Support`, control intent history, and lease state visibility
- `Site Control Station`: a separate product surface, not an expansion of the browser app

## AnyDesk Position

AnyDesk stays outside the product core:

- it is a third-party remote desktop layer
- it is not embedded into `web-app`
- it is not trusted as a safety boundary
- it does not bypass Android bridge lease or failsafe policy

If AnyDesk drops, remote control is revoked and the bridge returns to monitor-only or the configured local failsafe.

## Immediate Work Queue

Do these next, in order:

1. audit Sprint 4 Android gaps against actual code and tests
2. add the launch-readiness checklist doc and align field/emergency docs with the real UI flow
3. verify blackbox export shape and incident reconstruction path end to end
4. freeze remote ops to internal beta maintenance only until Sprint 4 is closed

## Risks to Watch

- The repo is currently on branch `codex/sprint-2-planner-server`, while the active work and gate are Sprint 4. That naming drift is not dangerous by itself, but it will confuse release and review conversations if it stays unaddressed.
- Remote Ops UI work can easily look harmless while quietly becoming a release dependency. Treat that as a scope regression.
- AnyDesk can create false confidence. If the bridge lease, freshness checks, and observer rules are not enforced, remote desktop access becomes an unsafe shortcut.
