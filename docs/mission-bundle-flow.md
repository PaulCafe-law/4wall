# Mission Bundle Flow

## Objective

Make mission artifacts a verifiable contract between planner-server and Android so takeoff is impossible until the bundle is complete and trusted.

## Artifacts

- `mission_meta.json`
- `mission.kmz`

## Android Lifecycle

1. Operator authenticates.
2. App requests mission plan.
3. App downloads `mission_meta.json`.
4. App downloads `mission.kmz`.
5. App verifies schema version, checksum, and file presence.
6. App writes artifacts to cache atomically.
7. App promotes the bundle to active only after both artifacts validate.
8. Preflight policy reads the active bundle state.
9. TAKEOFF remains blocked unless the bundle is complete and verified.

## Verification Rules

- Both artifacts must exist.
- Both artifacts must match the mission/version pair.
- Checksum mismatch invalidates the bundle.
- Unknown major schema versions are rejected.
- Partial download never replaces the previously valid bundle.

## Failure Handling

- Download failure: retry with backoff.
- Corrupt artifact: delete temp file, keep last known good bundle.
- Checksum mismatch: block takeoff and surface the exact reason.
- Auth failure: pause new server-dependent actions, do not interrupt already safe local flight states.
