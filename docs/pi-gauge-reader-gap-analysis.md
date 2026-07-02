# Pi Gauge Reader Gap Analysis

## Context

The current factory camera pipeline uploads still images from fixed cameras to the
cloud. The gauge reader is different: it must run on the Pi, read two fixed analog
linear meters from camera `192.168.1.10`, and publish only numeric readings.

The two target gauges are rectangular analog amp meters below the machine panel:

- `PRESS AM METER`
- `FLOW AM METER`

The visible major scale is `0, 2, 4, 6, 8, 10`. The red vertical needle indicates
the current value. This is not a circular dial gauge, so center/angle calibration is
not the correct primary approach.

## Decision

Implement a Pi-local OpenCV reader under `planner-server/deploy/pi-gauge-reader/`.
This keeps the module close to existing Pi deployment assets while staying out of
the Render web/API build path.

The reader uses:

```text
RTSP or image file
  -> ROI crop
  -> perspective warp to a rectangular meter
  -> red/dark needle localization inside a search band
  -> projection onto calibrated 0..10 scale points
  -> smoothing and outlier rejection
  -> MQTT numeric payload and local /status
```

## What This Reuses

- Existing repo deployment convention: `planner-server/deploy/...`
- Existing Pi camera context: `192.168.1.10` is the factory machine panel camera
- Existing safety boundary: cloud systems receive data, not raw site video

## What This Does Not Reuse

- Camera ingest API and R2 frame upload. The gauge reader must not upload images.
- Web app camera page. The gauge reader is headless and edge-local.
- Industrial Data Engine. This is a fixed-meter edge telemetry pipeline.

## Risks

1. Gauge crop resolution may be too low from the wide camera view.
   The reader includes a minimum crop width gate and reports degraded confidence
   below the configured threshold.

2. Reflection on the meter glass may reduce red-line detection quality.
   The detector uses a red HSV mask first, then dark-line fallback.

3. MQTT may be unavailable during field tests.
   The reader keeps a bounded local queue and still exposes `/status`.

## Not In Scope

- Training YOLO or any neural model.
- Reading arbitrary gauges in arbitrary locations.
- Uploading image crops to cloud storage.
- Integrating with server auth, OAuth, camera ingest, or Render services.
- Web UI changes.
