# Pi Gauge Reader Gap Analysis

## Context

The current factory camera pipeline uploads still images from fixed cameras to the
cloud, and that must remain true for the management platform. The gauge reader is a
second edge workload: it runs on the Pi, reads two fixed analog linear meters from
camera `192.168.1.10`, and posts structured readings back to the platform so the
camera page can show the latest image and the latest meter values together.

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
  -> Fourth Wall camera-ingest gauge-reading API
  -> optional MQTT numeric payload and local /status
```

## What This Reuses

- Existing repo deployment convention: `planner-server/deploy/...`
- Existing Pi camera context: `192.168.1.10` is the factory machine panel camera
- Existing camera ingest path: the full camera image continues to upload to the
  management platform through the camera agent

## What This Does Not Reuse

- Camera ingest image upload. The existing camera agent remains responsible for
  returning full-frame JPEGs to the management platform.
- Industrial Data Engine. This is a fixed-meter edge telemetry pipeline.

## Management Platform Integration

The management platform receives two related signals:

```text
Camera agent
  -> /v1/camera-ingest/upload-intents
  -> R2 frame object
  -> /v1/cameras latest-frame image

Gauge reader
  -> /v1/camera-ingest/gauge-readings
  -> latestGaugeReadings on /v1/cameras
  -> camera page shows values beside the latest frame
```

This keeps image upload bandwidth governed by the existing camera agent policy
while allowing the reader to publish small values every sampling interval. The
reader does not need to duplicate full-frame uploads.

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
- Uploading duplicate full-frame images from the gauge reader.
