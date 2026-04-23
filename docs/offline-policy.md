# Offline Policy

## Principle

The server is required for planning and artifact retrieval before flight, but not for the active flight-critical loop once the verified mission bundle is on-device.

## Rules

- All required mission artifacts must be downloaded and verified before takeoff.
- In-flight server loss must not interrupt waypoint execution, hold, RTH, or manual takeover.
- Event and telemetry uploads are best-effort and can be deferred.
- Auth expiry blocks new server-dependent actions, not safe local control.

## Upload Backlog

- Flight events and telemetry batches are queued locally on failure.
- The current beta implementation retries on the next enqueue/flush opportunity and preserves the queue on disk.
- WorkManager-based scheduled retry remains a hardening item, not a shipped guarantee in this sprint.
- Operator can export logs if upload remains blocked.

## Unsafe Conditions

- Missing or invalid mission bundle
- Unknown schema major version
- Checksum mismatch
- No local cache of required artifacts

Any unsafe condition blocks takeoff.
