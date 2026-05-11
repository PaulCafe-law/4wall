# Mission Bundle Flow

## Objective

Make mission artifacts a verifiable contract between planner-server and Android for
all planned-bundle flows.

This still means takeoff is impossible until the bundle is complete and trusted for:

- `Outdoor Patrol`
- any manual session that intentionally chooses to operate with a verified planned bundle

It no longer means every prod flight requires a bundle.

`Indoor Manual` and `Outdoor Manual Pilot` may now run as
`unplanned manual flight` when no verified bundle is attached.

## Artifacts

- `mission_meta.json`
- `mission.kmz`

## Android Lifecycle

1. Operator authenticates.
2. If the selected execution path is `Outdoor Patrol`, the app downloads the assigned dispatch bundle.
3. App downloads `mission_meta.json`.
4. App downloads `mission.kmz`.
5. App verifies schema version, checksum, and file presence.
6. App writes both artifacts into a staging directory under app-local storage.
7. App promotes the staging directory to `active/` only after both artifacts validate.
8. App rewrites the local bundle manifest with the active file paths after promotion.
9. Preflight policy reads the active bundle state.
10. `Outdoor Patrol` TAKEOFF remains blocked unless the bundle is complete and verified.

For production patrol, Android uses `GET /v1/operator/missions/active-bundle`.
It does not call `/v1/missions/plan` or generate patrol coordinates locally.

For `unplanned manual flight`:

1. Operator authenticates.
2. Operator selects `Indoor Manual` or `Outdoor Manual Pilot`.
3. No mission bundle is required.
4. Connection Guide and Preflight proceed with the manual-mode policy.
5. No server flight context is created.
6. No event / telemetry backlog is enqueued.
7. No blackbox / incident export artifact is retained.

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

For manual modes without a verified bundle:

- bundle absence is not itself a takeoff failure
- bundle verification failure downgrades the session to `unplanned manual flight`
- Android must surface that the session is lower-audit and is not creating cloud or blackbox artifacts
