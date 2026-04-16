# Product Gap Matrix

| Subsystem | Current State | Full Product Target | Gap | Blocking Risk | Phase |
|---|---|---|---|---|---|
| Customer account lifecycle | Invite-only auth and accepted-invite login exist | Self-serve signup, verification, reset, join/create org, invite lifecycle | No self-serve lifecycle yet | Product stays ops-assisted only | 2 |
| Organization and team admin | Customer team reads and internal org management exist | Full self-serve team management, seat/role controls, org settings | Team coordination is still light and invite lifecycle is incomplete | Customers stay dependent on ops | 1, 2 |
| Sites and mission request flow | Sites, missions, and planner form exist | Demo-ready inspection control plane with site maps, route/templates, schedules, alerts, and dispatch context | Workflow exists but there is no first-class control-plane model yet | The demo cannot show autonomous inspection planning as a coherent product surface | 1, 3 |
| Event interpretation and reporting | Artifacts and audit exist, but no event/report product flow exists | Mission-linked anomaly events, evidence artifacts, text summaries, and downloadable reports | No unified contract or mission-level report surface yet | The demo cannot reduce reviewer workload or explain inspection output | 1, 4 |
| Mission delivery | Artifact links and mission detail exist | Delivery summary, report state, evidence state, history, release notes, failure explanation | Delivery feels operational, not productized | Customers may not trust or understand output state | 1, 4 |
| Billing and subscriptions | Manual invoice flow exists | Hosted billing, subscription status, payment method, invoice settlement | Billing is still manual-first and not self-serve | Revenue operations do not scale | 2 |
| Notifications | Ad hoc UI cues only | In-app + email notification system | No durable reminder or exception model | Users miss important state changes | 2 |
| Live Ops | Internal-only monitoring and support surfaces exist | Stable internal ops console with session list, telemetry freshness, video metadata, lease state, and control timeline | Monitoring exists but is not yet a complete daily ops tool | Internal support stays fragmented | 1, 3 |
| Mission-level control intents | Request/ack model exists in architecture and internal beta | Formal internal-only mission-level control path with audit and fail-closed UI | Needs production-hardening and stronger incident context | Remote ops remains too fragile for daily use | 3 |
| Support operations | Internal support queue exists | Triage-oriented queue with mission, org, severity, next-step guidance, and analysis/report failure context | Queue is present but still too shallow | Slower response and inconsistent support | 1, 3 |
| Audit and compliance | Web/admin audit trail exists | Complete support-access, billing-mutation, and export-ready audit posture | Policy, retention, and export surfaces are incomplete | Trust and compliance posture stays incomplete | 3, 4 |
| Reliability and deploy safety | Render deploy, smoke, and rollback basics exist | Canary, health dashboard, alert routing, repeatable acceptance evidence | Current path works but is not yet operator-grade | Broken deploys take too long to detect or reverse | 1, 4 |
| Customer help and onboarding | Basic auth and page copy exist | Guided onboarding, empty states, help center, clearer customer language | Product still expects too much implicit knowledge | Activation and retention stay weak | 4 |

## Notes

- Android remains outside this matrix except where it provides upstream contracts for live ops.
- Manual flight control is not part of this product roadmap.
- Hosted billing is a Phase 2 dependency, not a Phase 1 blocker.

