# Person Presence Projection

## Scope

Person presence projection turns one fixed-camera frame into anonymous Factory Twin markers. It is planning and operations context only.

It does not add identity, face recognition, tracking, person crops, LINE floorplan state, alerts, Android behavior, or control commands.

## Backend Contract

Device-token endpoint:

- `POST /v1/camera-ingest/person-observations`

Web-authenticated camera endpoints:

- `GET /v1/cameras`
- `GET /v1/cameras/{cameraId}`

The web endpoints include `latestPersonObservation` under the same org-scoped authorization as the camera record.

Request shape:

```json
{
  "capturedAt": "2026-07-04T10:00:00+08:00",
  "frameId": "required-live-camera-frame-id",
  "source": "live",
  "imageWidth": 2560,
  "imageHeight": 1440,
  "calibrationId": "overview-h-20260704",
  "detectorName": "paddledet_ppyoloe_plus_person",
  "detections": [
    {
      "bbox": [100, 120, 40, 160],
      "confidence": 0.92,
      "footPoint": [120, 280],
      "floorPosition": { "x": 1.25, "z": -3.5 }
    }
  ]
}
```

Server rules:

- `source=live` requires `frameId`; the frame must belong to the authenticated camera, and `capturedAt`, `imageWidth`, and `imageHeight` must match it.
- Offline file runs use `source=offline_file` and may omit `frameId`; LINE never consumes them.
- `personCount` is computed as `detections.length`.
- Empty detections are valid and stored.
- The worker publishes every unique frame, including zero-person frames, so a
  recent zero is distinguishable from unavailable or stale detector data.
- Duplicate frame IDs and duplicate content hashes remain suppressed.
- At most 50 detections are accepted.
- Image dimensions must be positive.
- Bboxes must be finite, inside the image, and have positive width/height.
- Confidence must be finite and between 0 and 1.
- Foot points must be finite and inside the image.
- `floorPosition` may be null. When present, `x` and `z` must be finite.
- A supplied `frameId` must belong to the authenticated camera token.

## LINE HC600-01 Count

The `machine_people` intent reads only the bound site's `192.168.1.31` camera. Both receipt time and source capture time must be within 60 seconds, the observation must be `live`, and its exact frame must still match the camera/org/site. LINE returns only `HC600-01 機台附近目前偵測到 N 人。` or the fixed no-fresh-data response. It never returns detections, coordinates, identities, screenshots, or tracks.

## Worker

The 3090 worker lives at `planner-server/deploy/gpu-person-presence/`.

Required data flow:

```text
device-token GET /v1/camera-ingest/latest-frame/image
  -> X-Camera-Frame-Id / X-Camera-Captured-At
  -> duplicate skip by frame id or content hash
  -> PaddleDetection person detector
  -> filters
  -> foot point
  -> optional homography
  -> POST /v1/camera-ingest/person-observations
```

PaddleDetection / PP-YOLOE+ is the primary detector path. RT-DETR is only a documented fallback if PaddleDetection install smoke tests fail. Do not add `ultralytics`.

If homography is missing or invalid, the worker keeps the detection and sends `floorPosition: null`. Platform submit failures go into a bounded retry queue; the main loop keeps polling.

Production logs contain only frame ID, detection/person counts, queue count, and status. Detection geometry remains in the authenticated ingest payload and is not printed to service logs.

## Factory Twin

Factory Twin renders live people only when:

- the observation `capturedAt` is no older than 60 seconds;
- a detection has non-null `floorPosition`;
- the projected `{x, z}` is finite and within real factory movement bounds plus 2 meters.

Live person entities use:

- `type: "person"`
- `source: "live"`
- `status: "on-duty"`
- `attrs.fixedWorld: true`

`FitToGlb` skips live entities. Sim movement and demo dispatch cannot mutate anonymous live detections. The detail panel is read-only and does not expose LINE chat controls.

## Verification

```bash
cd planner-server && python -m pytest tests -q
cd planner-server/deploy/gpu-person-presence && python -m pytest tests -q
cd web-app && npm run test -- --run
cd web-app && npm run build
```

Worker dry run:

```bash
cd planner-server/deploy/gpu-person-presence
python -m presence_worker.main --config config.yaml --input samples/test-image.jpg --once --dry-run
```
