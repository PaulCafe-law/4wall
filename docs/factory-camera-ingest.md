# Factory Camera Ingest

## Scope

Factory Camera Ingest is a planner-server capability for fixed industrial camera evidence and equipment-state analysis.

It is separate from Industrial Data Engine. Industrial Data Engine creates synthetic or reconstructed planning/training artifacts. Factory Camera Ingest receives real fixed-camera frames from a site and turns high-confidence equipment-state changes into Incident Center records.

This feature is not flight-critical:

- no Android dependency
- no aircraft control path
- no server-issued stick commands
- no browser compensation for missing camera data
- missing or uncertain analysis stays as observation or failed analysis, not a confirmed incident

## Field Topology

```text
PoE Camera 192.168.1.31
    |
    | RTSP, LAN only
    v
Pi 5 192.168.1.100
    |
    | HTTPS device token
    v
planner-server camera ingest API
    |
    | short-lived upload intent
    v
S3-compatible private object storage
    |
    v
equipment-state analysis worker
    |
    v
Incident Center
```

The camera remains LAN-only. The Pi owns the RTSP credentials and capture loop. The cloud never stores the camera password.

## Gap Analysis

- The current backend has artifact storage, tenant-scoped incidents, audit records, and S3-compatible storage, but no fixed-camera device identity or frame ingest.
- The existing Incident Center can represent camera-originated incidents, but camera frame evidence should not expose public R2/S3 URLs. First version stores protected frame references as text evidence.
- Direct camera-to-cloud upload is not appropriate because the camera should not hold cloud credentials and should not be internet-exposed.
- Pi-to-R2 with long-lived R2 credentials is also too broad. The safer path is device-token authentication to the API, then short-lived upload intent.
- The worker must be provider-driven. A disabled or failing provider records failure; it must not invent equipment state.

## API Contract

Device-authenticated endpoints:

- `GET /v1/camera-ingest/config`
- `POST /v1/camera-ingest/upload-intents`
- `PUT /v1/camera-ingest/frames/{frameId}/upload`
- `GET /v1/camera-ingest/frames/{frameId}`
- `POST /v1/camera-ingest/frames/{frameId}/complete`
- `POST /v1/camera-ingest/heartbeat`
- `POST /v1/camera-ingest/person-observations`

Web-authenticated endpoints:

- `GET /v1/cameras`
- `GET /v1/cameras/{cameraId}`
- `GET /v1/cameras/{cameraId}/watch-zones`
- `PATCH /v1/cameras/{cameraId}/watch-zones`

The local upload endpoint is used for development and tests. In production with S3-compatible storage, the intent may return a presigned object-storage URL.

## Pi Agent

The first Pi implementation lives at `planner-server/scripts/camera_agent.py`. It has no Python package dependencies, but the Pi must have `ffmpeg` installed and reachable on `PATH`.

Deployment steps for Render, R2, the analysis worker, camera provisioning, and Pi systemd live in `docs/factory-camera-deployment-runbook.md`.
Before a real staging or production cutover, run `planner-server/scripts/camera_deployment_readiness.py` to validate the Render camera worker blueprint and the target runtime environment. With target R2 credentials loaded, add `--check-storage-live` to verify object storage write/read/delete.
Initial ROI/watch-zone setup can be applied directly against the target database with `planner-server/scripts/configure_camera_watch_zones.py` using the same JSON shape as the web `PATCH /v1/cameras/{cameraId}/watch-zones` API.

Required environment:

```bash
export CAMERA_AGENT_API_BASE_URL="https://api.example.com"
export CAMERA_AGENT_DEVICE_TOKEN="fwcam_..."
export CAMERA_AGENT_RTSP_URL="rtsp://<camera-user>:<camera-password>@192.168.1.31/stream"
```

Optional environment:

```bash
export CAMERA_AGENT_SPOOL_DIR="/var/lib/fourthwall-camera-agent"
export CAMERA_AGENT_FFMPEG_PATH="ffmpeg"
export CAMERA_AGENT_INTERVAL_SECONDS="10"
export CAMERA_AGENT_LOCAL_SPOOL_HOURS="24"
export CAMERA_AGENT_HTTP_TIMEOUT_SECONDS="30"
```

Field smoke test:

```bash
python planner-server/scripts/camera_agent.py --doctor --json
python planner-server/scripts/camera_agent.py --once
```

The doctor checks env, spool write access, ffmpeg, API device-token access, and a one-frame RTSP capture without uploading it. Production use should run the same script under systemd. The script captures one JPEG from RTSP, writes local pending metadata before upload, asks the API for an upload intent, uploads the image, completes the frame, and sends heartbeat. It does not upload RTSP credentials or print the configured RTSP URL.

## Data Model

- `CameraDevice`: org/site-scoped camera identity, device token hash, sampling policy, heartbeat, and last frame status.
- `CameraFrame`: one captured image, storage key, checksum, upload expiry, dimensions, and analysis status.
- `EquipmentWatchZone`: ROI and expected state policy for one piece of equipment in a camera view.
- `EquipmentStateObservation`: provider result for one frame/zone, optional linked incident.
- `CameraPersonObservation`: anonymous per-frame person detections, optional frame association, detector metadata, image-space bbox/foot point, optional Factory Twin floor projection, and server-computed `personCount`.

`CameraPersonObservation` is exposed only through existing device-token ingest and org-scoped camera read APIs. It is not exposed through LINE floorplan endpoints and is not used for control, alerts, identity, or tracking.

## Cost Controls

Default v1 policy:

- capture one JPEG every 10 seconds
- raw frame retention target: 7 days
- Pi local spool target: 24 hours
- analyze active watch zones, not whole-frame freeform detections
- create incidents only when the state is in the zone's alert list and confidence passes the zone threshold

Expected first-camera volume:

```text
259,200 frames/month at 10-second sampling
~52 GB/month at 200 KB/frame
~12 GB live storage with 7-day raw retention
```

Storage cost is lower risk than model call cost. The worker should skip unchanged frames or rely on heartbeat sampling before calling any paid vision provider.

## Failure Policy

- Upload intent expiry blocks late completion while the frame is still pending.
- Checksum mismatch rejects frame completion.
- Missing object storage data rejects completion.
- Device token scope is per camera. A token cannot upload for another camera.
- Low-confidence analysis records an observation only.
- Provider timeout or missing provider marks analysis failed.
- Cross-org reads and writes are rejected through existing web scope checks.
