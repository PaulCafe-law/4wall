# Person Presence Projection Gap Analysis

> Superseded for LINE by live-status v3: raw detections, geometry, images, identities, and tracks remain prohibited, while LINE may read only the bound `.31` camera's anonymous 0/N count when both capture and receive times are within 60 seconds. Factory Twin also ignores `offline_file` observations.

## Sprint Boundary

This change stays inside the Sprint 3/4 shared boundary: `planner-server/`, `web-app/`, and `docs/`.
Android, flight-control logic, LINE floorplan endpoints, Pi capture cadence, and the existing HMI OCR worker are out of scope.

## Checkpoint Exception

The worktree was already dirty before this sprint, mainly with HMI OCR and LINE floorplan related work. Creating a normal git checkpoint would mix unrelated user work into this sprint. The checkpoint for this implementation is therefore recorded here instead of a commit.

- Branch: `codex/hc600-hmi-ocr-gpt-summary`
- HEAD: `891f320`
- Initial status: dirty, including `planner-server/app/models.py`, `planner-server/app/routers/camera_ingest.py`, `planner-server/tests/test_camera_ingest.py`, `web-app/src/lib/types.ts`, Factory Twin files, LINE floorplan files, untracked HMI OCR worker files, and untracked docs/assets.
- Rule for this implementation: do not stage, commit, revert, delete, or overwrite unrelated existing changes.

## Goal

Add anonymous, single-frame person presence projection for the fixed factory overview camera. The 3090 worker reads the latest uploaded camera frame, detects people, projects each foot point into GLB world coordinates, submits the observation through the existing device-token ingest path, and the Factory Twin renders fresh anonymous live person markers.

This is not a tracking, identity, alerting, or control feature. P0 is the final product shape for this capability: anonymous in-frame presence only.

## Data Flow

```text
Pi camera agent
  -> existing camera frame upload
  -> GET /v1/camera-ingest/latest-frame/image with device token
  -> gpu-person-presence worker
  -> person detector + filters
  -> foot-point homography projection
  -> POST /v1/camera-ingest/person-observations
  -> latestPersonObservation on /v1/cameras
  -> Factory Twin live person markers
```

## Red Lines

- Do not expose person detections through LINE floorplan PNGs, LINE state JSON, or any unauthenticated route. The only LINE projection is the v3 fixed anonymous count response.
- Do not store face crops, person crops, names, identities, `trackId`, trajectory ids, or cross-frame matching data.
- Do not change the Pi capture loop or RTSP handling.
- Do not let the server or web app issue safety or control actions from person detections.
- Do not use Ultralytics packages or models in the worker because their default license path is AGPL/Enterprise.

## Implementation Gap

- Backend needs a person-observation table, device-token submit endpoint, latest observation serializer, and validation stricter than the current OCR observation payload.
- The GPU worker cannot reuse the HMI OCR frame source verbatim because it must preserve response metadata such as `X-Camera-Frame-Id` for de-duplication and backend frame association.
- Factory Twin already supports `source: 'sim' | 'live'`, but live people must be protected from GLB remapping, simulated movement, LINE chat UI, and demo dispatch mutation.
- Documentation must make the privacy and expiry semantics explicit: 0 people is a fresh observation, while missing or older-than-60-second observation is stale/no live marker.

## Acceptance

- Device-token submit accepts valid person observations, including 0-person frames, and rejects malformed geometry.
- `/v1/cameras` returns `latestPersonObservation` only under existing org-scoped web auth.
- Worker dry-run prints the exact `personObservation` payload without writing images outside local `runtime/`.
- Factory Twin renders only fresh `source=live` projected people; LINE receives only the separate anonymous v3 count and never receives geometry or simulation data.
- Existing HMI OCR, gauge, camera, and LINE floorplan behavior remains unchanged except for shared camera DTO expansion.
