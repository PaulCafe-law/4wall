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

## YOLOX backend 部署 (cv2.dnn ONNX)

The `yolox` backend runs an accurate CNN detector on `cv2.dnn` alone — no torch,
no paddle, no ultralytics. It only needs `opencv-python-headless` (with `cv2.dnn`)
and `numpy`, which are already installed on nckusoc. Use it to replace the HOG
backend, which false-fires on machinery and clutter.

### 1. Download the model (~34 MB)

The stock model is the **OpenCV Zoo YOLOX-S** ONNX. It is stored in Git LFS, so a
plain `raw.githubusercontent.com` link only returns a 133-byte LFS pointer — you
must use the **`media.githubusercontent.com/media/...`** URL (that is what
GitHub's Download button resolves to):

```bash
mkdir -p /opt/fourwall/person-presence/models
curl -L -o /opt/fourwall/person-presence/models/object_detection_yolox_2022nov.onnx \
  "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/object_detection_yolox/object_detection_yolox_2022nov.onnx"

# Verify: must be ~34 MB (35,858,002 bytes) and NOT start with "version https://git-lfs".
ls -l /opt/fourwall/person-presence/models/object_detection_yolox_2022nov.onnx
```

- Source repo: <https://github.com/opencv/opencv_zoo/tree/main/models/object_detection_yolox>
- Direct binary URL (use this one): `https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/object_detection_yolox/object_detection_yolox_2022nov.onnx`
- Expected size: **35,858,002 bytes** (~34 MB), sha256 `c5c2d13e59ae883e6af3b45daea64af4833a4951c92d116ec270d9ddbe998063`.

(Alternative: `git lfs install && git clone https://github.com/opencv/opencv_zoo`
then copy the file. An int8 quantized variant `..._int8.onnx` also exists but is
not required.)

### 2. Point config at the file

Set `detector.model_dir` to the **full path to the `.onnx` file** (this backend
uses `model_dir` as a file path, not a directory), or set
`detector.constructor_options.model_path` (which takes precedence if both are set):

```yaml
detector:
  backend: yolox
  detector_name: yolox_s_opencv_zoo
  model_dir: "/opt/fourwall/person-presence/models/object_detection_yolox_2022nov.onnx"
  device: gpu                 # tries cv2.dnn CUDA backend, silently falls back to CPU
  confidence_threshold: 0.4   # score = obj * cls_person; 0.4 is a sensible start
  min_bbox_height_px: 48
  constructor_options:
    nms_threshold: 0.45       # IoU threshold for cv2.dnn.NMSBoxes
    strides: [8, 16, 32]      # YOLOX FPN strides (stock model)
    input_size: 640           # square letterbox size
    # decoded: false          # see below
```

### 3. Decode note (important)

The stock OpenCV Zoo YOLOX ONNX outputs **raw** predictions of shape `(1, N, 85)`
= `[cx, cy, w, h, obj, 80 class scores]`. This backend applies the standard YOLOX
grid+stride decode (strides 8/16/32) itself, so keep `constructor_options.decoded`
unset / `false` for that model.

Only if you export a custom ONNX that **already bakes the decode in** (grids and
strides folded into the graph, boxes already in letterbox pixels) should you set
`constructor_options.decoded: true`, to avoid double-decoding.

Preprocessing matches the OpenCV Zoo reference exactly: BGR→RGB, aspect-preserving
letterbox to 640×640 with 114 padding at the bottom/right, NCHW float32 blob, and
**no** `/255` and **no** mean/std normalization (YOLOX ingests raw 0–255 pixels).

## Detector Policy

Primary runtime is PaddleDetection / PP-YOLOE+ with a lazy adapter. The `yolox`
(`cv2.dnn` ONNX) backend is the recommended accurate detector where PaddleDetection
cannot be installed (e.g. nckusoc has only opencv-python-headless + numpy). RT-DETR
may be evaluated only as an explicit fallback if PaddleDetection install smoke tests
fail. Do not add `ultralytics` as a dependency.
