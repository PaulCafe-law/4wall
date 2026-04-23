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
6. App writes both artifacts into a staging directory under app-local storage.
7. App promotes the staging directory to `active/` only after both artifacts validate.
8. App rewrites the local bundle manifest with the active file paths after promotion.
9. Preflight policy reads the active bundle state.
10. TAKEOFF remains blocked unless the bundle is complete and verified.

## Verification Rules

- Both artifacts must exist.
- Both artifacts must match the mission/version pair.
- Checksum mismatch invalidates the bundle.
- Expected checksums come from the authenticated plan response and artifact response headers.
- `mission_meta.json` must be downloaded and hashed from the raw response bytes. Re-serialization is not an acceptable verification source.
- Unknown major schema versions are rejected.
- Partial download never replaces the previously valid bundle.

## Failure Handling

- Download failure: retry with backoff.
- Corrupt artifact: discard staging bundle, keep last known good active bundle.
- Checksum mismatch: block takeoff and surface the exact reason.
- Auth failure: pause new server-dependent actions, do not interrupt already safe local flight states.
- Promotion failure: restore the previous active bundle from backup if replacement does not complete.
