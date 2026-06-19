# Factory Camera Deployment Runbook

This runbook moves the Factory Camera Ingest path from local wiring to a real staging or production deployment.

## Scope

This deploys the fixed factory camera path only:

- Pi 5 pulls RTSP from the LAN camera.
- Pi uploads JPEG frames to the planner API.
- The API stores frames in private S3-compatible object storage.
- A camera analysis worker reads queued frames, crops watch zones, calls the configured vision provider, and writes observations or pending-review incidents.

It does not connect to Industrial Data Engine and does not enter the Android flight-critical loop.

## Cloud Storage

Use Cloudflare R2 through the existing S3-compatible storage settings:

```text
BUILDING_ROUTE_ARTIFACT_BACKEND=s3
BUILDING_ROUTE_S3_BUCKET=<r2-bucket-name>
BUILDING_ROUTE_S3_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
BUILDING_ROUTE_S3_REGION=auto
BUILDING_ROUTE_S3_ACCESS_KEY_ID=<r2-access-key-id>
BUILDING_ROUTE_S3_SECRET_ACCESS_KEY=<r2-secret-access-key>
```

The R2 bucket must stay private. Do not enable public bucket access for camera frames.

Create a bucket lifecycle rule outside the app:

```text
prefix: camera-frames/
action: delete objects after 7 days
```

Incident evidence is kept in the database as protected text references to the frame storage key. Do not expose R2 object URLs directly in Incident Center.

## Render Services

The repo-root `render.yaml` defines these camera services:

```text
four-wall-camera-analysis-worker-staging
four-wall-camera-analysis-worker
```

The worker command is:

```bash
python -m app.camera_analysis_worker
```

Required Render env vars for the camera worker are the same database and storage values as the API:

```text
BUILDING_ROUTE_ENVIRONMENT
BUILDING_ROUTE_APP_ORIGIN
BUILDING_ROUTE_DATABASE_URL
BUILDING_ROUTE_AUTH_SECRET_KEY
BUILDING_ROUTE_ARTIFACT_BACKEND=s3
BUILDING_ROUTE_S3_BUCKET
BUILDING_ROUTE_S3_ENDPOINT_URL
BUILDING_ROUTE_S3_REGION=auto
BUILDING_ROUTE_S3_ACCESS_KEY_ID
BUILDING_ROUTE_S3_SECRET_ACCESS_KEY
BUILDING_ROUTE_BOOTSTRAP_OPERATOR_ENABLED=false
```

Analysis provider env vars for production smoke without a model:

```text
CAMERA_ANALYSIS_PROVIDER=noop
CAMERA_ANALYSIS_TIMEOUT_SECONDS=120
```

`noop` lets the worker consume queued frames without calling a vision model. If no watch zones are active, the frame is marked `skipped` with `no_active_watch_zones`. If watch zones are active, the worker records low-confidence `unknown` observations and does not create incidents.

Analysis provider env vars when moving from smoke testing to model-backed analysis:

```text
CAMERA_ANALYSIS_PROVIDER=ollama
CAMERA_ANALYSIS_OLLAMA_BASE_URL=https://<private-ollama-endpoint>
CAMERA_ANALYSIS_OLLAMA_MODEL=qwen2.5vl:7b
CAMERA_ANALYSIS_OLLAMA_AUTH_TOKEN=<private-provider-bearer-token>
CAMERA_ANALYSIS_TIMEOUT_SECONDS=120
```

If `CAMERA_ANALYSIS_PROVIDER` is missing or set to `disabled`, the worker starts and idles. It does not mark queued frames failed.

Ollama must not be exposed as a public unauthenticated internet service. Put it behind a private network, VPN, or authenticated reverse proxy that only the camera worker can reach. Set `CAMERA_ANALYSIS_OLLAMA_AUTH_TOKEN` when the endpoint is protected by a bearer-token proxy; omit it only when network isolation is the control.

## Database Migration

Before creating camera devices, run migrations against the target database:

```bash
cd planner-server
python -m alembic upgrade head
```

The migration must create:

```text
camera_devices
camera_frames
equipment_watch_zones
equipment_state_observations
```

## Provision Camera Device

Run this against the same target database used by the API:

```bash
cd planner-server
python scripts/create_camera_device.py \
  --organization-id <org-id> \
  --site-id <site-id> \
  --name "Factory camera 01" \
  --rtsp-configured
```

The command prints `deviceToken` once. Store that token on the Pi in `/etc/fourwall-camera-agent.env`. The plaintext token is not recoverable from the database later.

To rotate a token:

```bash
python scripts/create_camera_device.py \
  --organization-id <org-id> \
  --camera-id <camera-id> \
  --name "Factory camera 01" \
  --rtsp-configured \
  --rotate-token
```

## Pi 5 Install

Install runtime packages:

```bash
sudo apt-get update
sudo apt-get install -y ffmpeg python3
```

Install the agent service files from this repo checkout on the Pi:

```bash
cd /opt/fourwall/planner-server/deploy/pi-camera-agent
sudo bash install.sh
```

From this workstation, you can also deploy only the Pi agent files over SSH/SCP without cloning the whole repo on the Pi:

```bash
cd planner-server
python scripts/deploy_camera_agent_to_pi.py \
  --host 192.168.1.100 \
  --user <pi-ssh-user> \
  --env-file ./fourwall-camera-agent.env \
  --run-once \
  --dry-run
```

Remove `--dry-run` after reviewing the commands. The helper uploads:

```text
scripts/camera_agent.py
deploy/pi-camera-agent/install.sh
deploy/pi-camera-agent/fourwall-camera-agent.service
deploy/pi-camera-agent/fourwall-camera-agent.env.example
```

If `--env-file` is provided, it is streamed through SSH with `umask 077`, then installed to `/etc/fourwall-camera-agent.env` with mode `0640` after the `fourwall-camera` system user is created. The script prints file paths and SSH commands, but it does not print env contents, device tokens, or RTSP credentials. Add `--start-service` only after the doctor and one-shot smoke pass.

Edit the env file:

```bash
sudo nano /etc/fourwall-camera-agent.env
```

Required Pi env:

```text
CAMERA_AGENT_API_BASE_URL=https://four-wall-api.onrender.com
CAMERA_AGENT_DEVICE_TOKEN=fwcam_<issued-token>
CAMERA_AGENT_RTSP_URL=rtsp://<camera-user>:<camera-password>@192.168.1.31/stream
CAMERA_AGENT_SPOOL_DIR=/var/lib/fourwall-camera-agent
CAMERA_AGENT_FFMPEG_PATH=ffmpeg
CAMERA_AGENT_INTERVAL_SECONDS=10
CAMERA_AGENT_LOCAL_SPOOL_HOURS=24
CAMERA_AGENT_HTTP_TIMEOUT_SECONDS=30
```

Run the Pi doctor before enabling the service:

```bash
cd /opt/fourwall/planner-server
sudo -u fourwall-camera bash -lc 'set -a; source /etc/fourwall-camera-agent.env; set +a; python3 scripts/camera_agent.py --doctor --json'
```

The doctor checks:

```text
1. required env is present and no placeholder device token or RTSP credentials remain
2. Pi clock is plausible
3. spool directory is writable by the service user
4. ffmpeg is installed and executable
5. API/device token can read GET /v1/camera-ingest/config
6. RTSP can produce one still frame without uploading it
```

For API-only debugging, use `--doctor --skip-rtsp`. For LAN camera debugging while the cloud API is offline, use `--doctor --skip-api`.

Smoke test upload before enabling the service:

```bash
cd /opt/fourwall/planner-server
sudo -u fourwall-camera bash -lc 'set -a; source /etc/fourwall-camera-agent.env; set +a; python3 scripts/camera_agent.py --once'
```

Start service:

```bash
sudo systemctl start fourwall-camera-agent
sudo systemctl status fourwall-camera-agent --no-pager
journalctl -u fourwall-camera-agent -n 100 --no-pager
```

## Watch Zones

Create watch zones from the same target database used by the API:

```bash
cd planner-server
python scripts/configure_camera_watch_zones.py \
  --camera-id <camera-id> \
  --zones-file ./watch-zones.factory-camera-01.json
```

Example `watch-zones.factory-camera-01.json`:

```json
{
  "zones": [
    {
      "name": "CNC stack light",
      "equipmentName": "CNC-01",
      "roi": { "type": "box", "x": 0.1, "y": 0.2, "w": 0.2, "h": 0.3 },
      "expectedState": "green",
      "alertOnStates": ["red", "off"],
      "minConfidence": 0.8,
      "severity": "high"
    }
  ]
}
```

The script is idempotent by `zoneId` when present, otherwise by `name` within the camera. By default, zones omitted from the file are deactivated. Use `--merge` to keep omitted zones active.

You can also manage watch zones through:

```text
PATCH /v1/cameras/{cameraId}/watch-zones
```

Only `box` ROI is supported in v1:

```json
{
  "zones": [
    {
      "name": "CNC stack light",
      "equipmentName": "CNC-01",
      "roi": { "type": "box", "x": 0.1, "y": 0.2, "w": 0.2, "h": 0.3 },
      "expectedState": "green",
      "alertOnStates": ["red", "off"],
      "minConfidence": 0.8,
      "severity": "high"
    }
  ]
}
```

The worker crops the ROI before model analysis.

## Verification

Local backend and deployment blueprint:

```bash
cd planner-server
python -m pytest \
  tests/test_camera_ingest.py \
  tests/test_camera_analysis.py \
  tests/test_camera_analysis_provider.py \
  tests/test_camera_agent.py \
  tests/test_camera_deployment_readiness.py \
  tests/test_camera_ingest_smoke.py \
  tests/test_configure_camera_watch_zones_script.py \
  -q

python scripts/camera_deployment_readiness.py --json
```

Target Render runtime environment:

```bash
cd planner-server
BUILDING_ROUTE_ENVIRONMENT=production \
BUILDING_ROUTE_APP_ORIGIN=https://app.<domain> \
BUILDING_ROUTE_DATABASE_URL=<render-postgres-url> \
BUILDING_ROUTE_AUTH_SECRET_KEY=<strong-secret> \
BUILDING_ROUTE_BOOTSTRAP_OPERATOR_ENABLED=false \
BUILDING_ROUTE_ARTIFACT_BACKEND=s3 \
BUILDING_ROUTE_S3_BUCKET=<r2-bucket-name> \
BUILDING_ROUTE_S3_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com \
BUILDING_ROUTE_S3_REGION=auto \
BUILDING_ROUTE_S3_ACCESS_KEY_ID=<r2-access-key-id> \
BUILDING_ROUTE_S3_SECRET_ACCESS_KEY=<r2-secret-access-key> \
CAMERA_ANALYSIS_PROVIDER=ollama \
CAMERA_ANALYSIS_OLLAMA_BASE_URL=https://<private-ollama-endpoint> \
CAMERA_ANALYSIS_OLLAMA_MODEL=qwen2.5vl:7b \
CAMERA_ANALYSIS_OLLAMA_AUTH_TOKEN=<private-provider-bearer-token> \
CAMERA_ANALYSIS_TIMEOUT_SECONDS=120 \
python scripts/camera_deployment_readiness.py \
  --include-runtime-env \
  --runtime-role worker \
  --check-storage-live \
  --json
```

For first production smoke without model-backed analysis, use `CAMERA_ANALYSIS_PROVIDER=noop` instead of the Ollama env vars above.

`--check-storage-live` writes a small object under `camera-readiness/`, reads it back, then deletes it. Run it only with the target Render/R2 env loaded.

API and storage smoke without a real camera:

```bash
cd planner-server
CAMERA_SMOKE_API_BASE_URL=https://four-wall-api.onrender.com \
CAMERA_SMOKE_DEVICE_TOKEN=fwcam_<issued-token> \
python scripts/camera_ingest_smoke.py
```

Expected output:

```json
{
  "ok": true,
  "uploadStatus": "uploaded",
  "analysisStatus": "queued"
}
```

Worker smoke without a real camera:

```bash
CAMERA_SMOKE_API_BASE_URL=https://four-wall-api.onrender.com \
CAMERA_SMOKE_DEVICE_TOKEN=fwcam_<issued-token> \
python scripts/camera_ingest_smoke.py \
  --wait-for-analysis \
  --analysis-timeout-seconds 180
```

Expected output after the camera analysis worker runs:

```json
{
  "ok": true,
  "uploadStatus": "uploaded",
  "analysisStatus": "succeeded"
}
```

If no watch zones have been configured yet, `analysisStatus` may be `skipped` with `analysisError` set to `no_active_watch_zones`. That still proves the worker consumed the queued frame. After watch zones and the provider are configured, use:

```bash
python scripts/camera_ingest_smoke.py \
  --wait-for-analysis \
  --require-analysis-status succeeded
```

Deployment evidence report:

```bash
cd planner-server
python scripts/camera_deployment_readiness.py --json > evidence.readiness.blueprint.json

BUILDING_ROUTE_ENVIRONMENT=production \
BUILDING_ROUTE_APP_ORIGIN=https://app.<domain> \
BUILDING_ROUTE_DATABASE_URL=<render-postgres-url> \
BUILDING_ROUTE_AUTH_SECRET_KEY=<strong-secret> \
BUILDING_ROUTE_BOOTSTRAP_OPERATOR_ENABLED=false \
BUILDING_ROUTE_ARTIFACT_BACKEND=s3 \
BUILDING_ROUTE_S3_BUCKET=<r2-bucket-name> \
BUILDING_ROUTE_S3_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com \
BUILDING_ROUTE_S3_REGION=auto \
BUILDING_ROUTE_S3_ACCESS_KEY_ID=<r2-access-key-id> \
BUILDING_ROUTE_S3_SECRET_ACCESS_KEY=<r2-secret-access-key> \
CAMERA_ANALYSIS_PROVIDER=ollama \
CAMERA_ANALYSIS_OLLAMA_BASE_URL=https://<private-ollama-endpoint> \
CAMERA_ANALYSIS_OLLAMA_MODEL=qwen2.5vl:7b \
CAMERA_ANALYSIS_OLLAMA_AUTH_TOKEN=<private-provider-bearer-token> \
CAMERA_ANALYSIS_TIMEOUT_SECONDS=120 \
python scripts/camera_deployment_readiness.py \
  --include-runtime-env \
  --runtime-role worker \
  --check-storage-live \
  --json > evidence.readiness.runtime.json

CAMERA_SMOKE_API_BASE_URL=https://four-wall-api.onrender.com \
CAMERA_SMOKE_DEVICE_TOKEN=fwcam_<issued-token> \
python scripts/camera_ingest_smoke.py \
  --wait-for-analysis \
  --analysis-timeout-seconds 180 > evidence.smoke.json
```

Copy the Pi doctor JSON from:

```bash
sudo -u fourwall-camera bash -lc 'set -a; source /etc/fourwall-camera-agent.env; set +a; cd /opt/fourwall/planner-server; python3 scripts/camera_agent.py --doctor --json' > evidence.pi-doctor.json
```

Then build the evidence report:

```bash
python scripts/camera_deployment_evidence.py \
  --deployment-name factory-camera-production \
  --environment production \
  --readiness-json evidence.readiness.blueprint.json \
  --readiness-json evidence.readiness.runtime.json \
  --smoke-json evidence.smoke.json \
  --pi-doctor-json evidence.pi-doctor.json \
  --output evidence.factory-camera-production.json
```

The evidence report must return `"ok": true` before enabling unattended production capture. It stores check names, statuses, frame ids, and camera ids, but it does not copy device tokens or RTSP credentials from the source JSON.

Production smoke with the Pi and real RTSP camera:

```text
1. API /healthz returns 200.
2. Synthetic `scripts/camera_ingest_smoke.py` uploads one frame.
3. Synthetic `scripts/camera_ingest_smoke.py --wait-for-analysis` returns `analysisStatus=succeeded` or `skipped`.
4. Pi agent `--doctor --json` passes on the Pi as the `fourwall-camera` user.
5. Pi agent --once uploads one RTSP frame.
6. `GET /v1/cameras` shows lastHeartbeatAt and lastFrameAt for the camera.
7. camera_frames has upload_status=uploaded and analysis_status=queued before worker processing.
8. camera analysis worker logs camera_frame_processed.
9. camera frame status moves to succeeded, skipped, or failed through `GET /v1/camera-ingest/frames/{frameId}`.
10. equipment_state_observations receives one row for the frame when watch zones are active.
11. If high-confidence alert state is detected, Incident Center shows a pending_review camera incident.
```

Network failure smoke:

```text
1. Stop API or disconnect WAN for 10 minutes.
2. Pi service keeps running and pending JSON/JPEG files remain under spool.
3. Restore network.
4. Pending files are uploaded and deleted from local spool.
```

## Rollback

Stop Pi agent:

```bash
sudo systemctl stop fourwall-camera-agent
```

Disable camera in DB:

```bash
python scripts/create_camera_device.py \
  --organization-id <org-id> \
  --camera-id <camera-id> \
  --name "Factory camera 01" \
  --status inactive
```

Set Render worker env:

```text
CAMERA_ANALYSIS_PROVIDER=disabled
```

This stops analysis while keeping uploaded frames and Incident Center data intact.
