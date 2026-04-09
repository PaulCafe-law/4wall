# Product Gap Matrix

| Subsystem | Current State | Beta Target | Gap | Blocking Risk | Sprint | Gate |
|---|---|---|---|---|---|---|
| Android runtime | Demo reducer, fake adapters, localized operator console | Dual-mode runtime with prod DJI wiring, tested failsafe gates, offline-safe bundle lifecycle | Real hardware integration, bundle validation, auth/networking, blackbox export | Unsafe takeoff or unsafe autonomy if left as demo-only | 1, 3, 4 | Sprint 1, 3, 4 |
| DJI integration | Fake adapters only | Real MSDK V5 adapter set with simulator and preflight hooks | SDK wiring, lifecycle, mission control, stream/perception listeners | Hardware blocked, compile/runtime mismatch, unsupported assumptions | 1 | Sprint 1 |
| Shared schema | Implicit Android/server contracts only | Versioned `shared-schemas/` contract for mission bundle and mission metadata | No shared source of truth today | Contract drift causes unsafe parsing and invalid takeoff decisions | 1, 2, 3 | Sprint 1 |
| Mission bundle lifecycle | Demo bundle in memory | Download, checksum verify, cache, rollback, version compare, takeoff gate | Full lifecycle missing | Invalid artifacts could reach flight flow | 3 | Sprint 3 |
| Planner API foundation | FastAPI skeleton, mock/OSRM provider, simple corridor logic | Tenanted planning API, corridor generator, inspection viewpoint generation, authenticated artifact delivery | Tenancy-aware mission persistence and read APIs are incomplete | Web and Android clients cannot share a safe source of truth | 2, 3 | Sprint 2, 3 |
| Web app shell | No `web-app/` surface exists | Desktop-first single app with role-aware navigation and invite-only entry | Entire frontend stack is missing | No beta planning or customer console exists | 2, 3 | Sprint 3 |
| Auth and session | Local operator JWT flow only, tuned for Android bearer usage | Android bearer flow preserved, web cookie-based refresh flow added, invite-only acceptance path live | Web session flow, invite handling, rate limiting, and browser-safe token strategy are missing | Session theft, poor UX, or blocked beta onboarding | 2, 3 | Sprint 2, 3 |
| Organization and tenancy | No organizations, memberships, invites, or sites | `Organization`, `Membership`, `Invite`, and `Site` models with org-scoped reads/writes | Multi-role customer/internal data model does not exist | Cross-org data leakage or inability to support invited customers | 2 | Sprint 2 |
| Mission ops surface | Planning endpoint exists but no customer/internal mission console | Site-aware mission request, mission list/detail, artifact panel, and flight replay links | Planning output is not exposed through an operator/customer workflow | Customers cannot request or inspect work end to end | 3 | Sprint 3 |
| Billing | No billing model or UI | Manual invoice workflow, attachment metadata, due dates, status transitions, and payment notes | Invoicing and remittance operations are absent | Beta cannot bill or track payment state cleanly | 3 | Sprint 3 |
| Audit and compliance | No audit event model for web/admin actions | Auth, role, invite, invoice, and artifact publication events are audit-trailed | No immutable operator trail exists for sensitive actions | Security review and support workflows are weak | 2, 3 | Sprint 2, 3 |
| Storage | In-memory only | SQLite dev, Postgres prod path, local FS dev artifacts, S3-compatible prod path | No durable persistence or object storage abstraction | Mission/event data lost, artifacts not reproducible | 2 | Sprint 2 |
| CI/CD | Planner-server workflow only | GitHub Actions for backend and web builds, test gates, and deploy smoke checks | Web build/test path and cross-surface gating are absent | Releases are manual and unrepeatable | 2, 3 | Sprint 2, 3 |
| Deploy | Render service for API only | Render web service for API, Render static site for web app, staging/prod domains, health checks, canary path | Web deploy topology and environment contract are missing | No launch-ready beta environment or repeatable rollback exists | 2, 3 | Release |
| Security review | No documented web threat model | Threat model, org-isolation tests, rate limits, and artifact protection checks defined before implementation | Beta web surface could ship without clear trust boundaries | High-severity auth or tenant flaws arrive late | 0, 2, 3 | Stage 0, Sprint 2, Release |
| Simulator | Demo state injection only | Simulator-backed harness for mission, hold, RTH, takeover flows | Real simulator wiring missing | Failsafe paths not verified before bench/field | 1, 4 | Sprint 1, 4 |
| Field validation | Demo checklist only | Bench-to-field protocol, emergency procedures, operator checklist | Real test protocol missing | Unsafe hardware validation process | 4 | Sprint 4 |

## Decision Notes

- Android remains the flight-critical runtime.
- Server remains planning-only and never enters the control loop.
- Desktop web app is planning, operations, and customer surface only.
- Waypoint mission owns main transit. Virtual stick only supports bounded local correction.
- Billing is manual-invoice-first for beta. Hosted online checkout is deferred.
- Any uncertainty resolves to HOLD first.
