# Not In Scope

## Explicit Deferrals

- Full SLAM or online dense mapping
  - Demo target is bounded corridor following, not open-world autonomy
- Cloud or server in the active flight-control loop
  - Violates flight-critical boundary and increases link risk
- Dynamic global replanning mid-flight
  - Demo only supports bounded local avoidance and operator escalation
- Autonomous free-space exploration around buildings
  - Out of scope for a road-network-following route assistant
- Multi-building batch inspection orchestration
  - Single-mission demo first
- Rich route editor on device
  - Server-side planning and mock mission loading are enough for demo
- Multi-drone or fleet management
  - Not needed for investor demo
- Post-flight analytics and reporting portal beyond basic audit/event views
  - Beta only needs mission status, artifacts, and operator-grade auditability
- Hosted online checkout as the beta launch gate
  - Manual invoices ship first so billing does not block launch
- Beyond visual line of sight autonomy
  - Not part of current safety posture
- Aggressive obstacle avoidance maneuvers
  - Avoider is intentionally limited to slow, hold, and small nudges

## Design Deferrals

- Final visual branding system
- Internationalization
- Tablet-specific optimized layout beyond safe fallback

## Engineering Deferrals

- Open self-serve signup and self-service organization provisioning
- Persistent offline sync queue for every telemetry sample
- DJI-specific KMZ correctness validation on hardware
- Hardware-in-the-loop integration suite
