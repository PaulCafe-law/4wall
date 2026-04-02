# Product Gap Matrix

| Subsystem | Current State | Beta Target | Gap | Blocking Risk | Sprint | Gate |
|---|---|---|---|---|---|---|
| Android runtime | Demo reducer, fake adapters, localized operator console | Dual-mode runtime with prod DJI wiring, tested failsafe gates, offline-safe bundle lifecycle | Real hardware integration, bundle validation, auth/networking, blackbox export | Unsafe takeoff or unsafe autonomy if left as demo-only | 1, 3, 4 | Sprint 1, 3, 4 |
| DJI integration | Fake adapters only | Real MSDK V5 adapter set with simulator and preflight hooks | SDK wiring, lifecycle, mission control, stream/perception listeners | Hardware blocked, compile/runtime mismatch, unsupported assumptions | 1 | Sprint 1 |
| Shared schema | Implicit Android/server contracts only | Versioned `shared-schemas/` contract for mission bundle and mission metadata | No shared source of truth today | Contract drift causes unsafe parsing and invalid takeoff decisions | 1, 2, 3 | Sprint 1 |
| Mission bundle lifecycle | Demo bundle in memory | Download, checksum verify, cache, rollback, version compare, takeoff gate | Full lifecycle missing | Invalid artifacts could reach flight flow | 3 | Sprint 3 |
| Auth | None | Local operator login with JWT access/refresh and protected artifacts | Auth stack and token lifecycle missing | Artifact access and operator identity not controlled | 2, 3 | Sprint 2, 3 |
| Storage | In-memory only | SQLite dev, Postgres prod path, local FS dev artifacts, S3-compatible prod path | No durable persistence or object storage abstraction | Mission/event data lost, artifacts not reproducible | 2 | Sprint 2 |
| Planning | FastAPI skeleton, mock/OSRM provider, simple corridor logic | Usable route provider abstraction, corridor generator, inspection viewpoint generation | Corridor output and persistence incomplete | Planner output insufficient for real mission bundle | 2 | Sprint 2 |
| CI/CD | None | GitHub Actions, Docker, Render deploy path, migration/test gates | Workflow and deploy config absent | Releases are manual and unrepeatable | 2 | Sprint 2 |
| Deploy | None | Render service definition, env contract, health checks, canary path | Deploy config missing | No beta environment or repeatable deployment | 2 | Release |
| Simulator | Demo state injection only | Simulator-backed harness for mission, hold, RTH, takeover flows | Real simulator wiring missing | Failsafe paths not verified before bench/field | 1, 4 | Sprint 1, 4 |
| Field validation | Demo checklist only | Bench-to-field protocol, emergency procedures, operator checklist | Real test protocol missing | Unsafe hardware validation process | 4 | Sprint 4 |

## Decision Notes

- Android remains the flight-critical runtime.
- Server remains planning-only and never enters the control loop.
- Waypoint mission owns main transit. Virtual stick only supports bounded local correction.
- Any uncertainty resolves to HOLD first.
