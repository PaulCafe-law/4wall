# GPU Person Presence Worker

This worker runs on the 3090 host and projects anonymous person detections from the existing camera ingest snapshot path into Factory Twin world coordinates.

It does not publish identity, face recognition, tracks, crops, trajectories, LINE floorplan state, or control commands.

## Data Flow

```text
device-token GET /v1/camera-ingest/latest-frame/image
  -> read X-Camera-Frame-Id and X-Camera-Captured-At
  -> skip duplicate frame id or duplicate content hash
  -> PaddleDetection person detector
  -> confidence, bbox-height, and valid-polygon filters
  -> foot point
  -> optional homography to {x, z}
  -> POST /v1/camera-ingest/person-observations
```

Zero-person frames are valid and are submitted as `detections: []`.

## Install

```bash
cd planner-server/deploy/gpu-person-presence
./install.sh
```

Set secrets outside git:

```bash
export PERSON_PRESENCE_API_BASE_URL="https://staging-api.example.com"
export PERSON_PRESENCE_DEVICE_TOKEN="..."
```

Install PaddleDetection separately on the GPU host and set `PYTHONPATH` so `deploy.python.infer` can be imported. The worker keeps PaddleDetection lazy-loaded so tests and dry config checks do not download models.

## Config

Copy `config.example.yaml` to `config.yaml`, set the model path, and optionally set `projection.homography` from a calibration report.

The latest-frame fetch must keep the `Authorization: Bearer ${PERSON_PRESENCE_DEVICE_TOKEN}` header. The response headers `X-Camera-Frame-Id` and `X-Camera-Captured-At` are part of the duplicate-skip and payload contract.

## Run

Dry run against a sample image:

```bash
python -m presence_worker.main --config config.yaml --input samples/test-image.jpg --dry-run
```

Run one platform cycle without publishing:

```bash
python -m presence_worker.main --config config.yaml --once --dry-run
```

Run and publish:

```bash
PERSON_PRESENCE_ENABLED=true python -m presence_worker.main --config config.yaml --publish
```

## Calibration

Create a YAML file with image foot points and Factory Twin world positions:

```yaml
points:
  - image: [110.0, 420.0]
    world: [1.2, -4.1]
  - image: [530.0, 415.0]
    world: [5.8, -4.0]
  - image: [130.0, 720.0]
    world: [1.0, -10.2]
  - image: [560.0, 705.0]
    world: [6.1, -10.0]
```

Then run:

```bash
python scripts/calibrate_homography.py calibration-points.yaml --output calibration-report.yaml
```

Review `reprojection.maxError` before copying `homography` into `config.yaml`.

## Tests

```bash
python -m pytest tests -q
```

Tests use `FakeDetector`; they do not download detector models.

## Detector Policy

Primary runtime is PaddleDetection / PP-YOLOE+ with a lazy adapter. RT-DETR may be evaluated only as an explicit fallback if PaddleDetection install smoke tests fail. Do not add `ultralytics` as a dependency.
