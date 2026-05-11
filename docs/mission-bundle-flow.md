# Mission Bundle Flow

## Objective

Make mission artifacts a verifiable contract between planner-server and Android for Android V1 prod patrol.

Android V1 prod is patrol-only:

- Android does not plan routes.
- Android does not call `/v1/missions/plan` for prod patrol setup.
- Android downloads the assigned active bundle from `/v1/operator/missions/active-bundle`.
- Server and web surfaces never send stick commands and never enter the flight-critical loop.

## Artifacts

- `mission_meta.json`
- `mission.kmz`

## Android Lifecycle

1. Operator authenticates.
2. The app downloads the assigned `Outdoor Patrol` dispatch bundle.
3. App downloads `mission_meta.json`.
4. App downloads `mission.kmz`.
5. App verifies schema version, checksum, and file presence.
6. App writes both artifacts into a staging directory under app-local storage.
7. App promotes the staging directory to `active/` only after both artifacts validate.
8. App rewrites the local bundle manifest with the active file paths after promotion.
9. Connection Guide and Preflight read the active bundle state.
10. Upload, takeoff, and waypoint mission start remain blocked unless the bundle is complete and verified.

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
- Checksum mismatch: block upload/takeoff and surface the exact reason.
- Auth failure: pause new server-dependent actions, do not interrupt already safe local flight states.
- Promotion failure: restore the previous active bundle from backup if replacement does not complete.

Legacy/demo manual modes are retained only for compatibility and development. They are not part of the Android V1 prod mission-bundle flow.
