# Factory Camera View Recovery Gap Analysis

Date: 2026-07-22

## Incident evidence

- The production camera page eventually returned all three Jingcheng frames, but
  `GET /v1/cameras` took 39.68 seconds before image requests could start.
- After the first batching release, the production table volume made the
  windowed latest-record queries regress further: the camera list exceeded 120
  seconds and a single latest-frame manifest exceeded 30 seconds. The batch
  query ranked the entire accumulated history, and uploaded-frame lookup lacked
  an index that combined upload state with newest-record ordering.
- Each protected latest-frame image request then took about 15 seconds through
  the API, leaving the page on its dark loading state for close to a minute.
- The factory Pi had both the current per-camera service for `192.168.1.31` and
  the obsolete generic `fourwall-camera-agent.service` reading the same camera.
  The obsolete service used an invalid device token, continually accumulated
  spool files, and competed for camera and Pi decode resources.
- The latest `192.168.1.31` cloud frame was a gray/corrupted 215 KB image. After
  disabling the obsolete service, the next cloud frame was a complete 679 KB
  factory overview. The `192.168.1.10` HMI and `192.168.1.28` table frames were
  also downloaded and visually verified.
- Camera analysis currently reports `frame_object_missing` even when the API can
  read the same R2 object. This is separate from display availability and points
  to production API/worker S3 configuration drift.

## Root causes

1. A legacy duplicate Pi service was left enabled after the three per-camera
   services were installed.
2. Camera status serialization calls the latest-record helper once per camera
   for frames, OCR observations, and person observations. With nine production
   cameras this creates an N+1 database query pattern before the browser can ask
   for any image.
3. Historical failure totals grow without bound and make the status page noisy;
   they must not be interpreted as the number of cameras currently unavailable.
4. The uploaded-frame lookup and person observations lack composite indexes
   matching their newest-record access paths.
5. Camera devices do not own a direct pointer to their newest uploaded frame.
   Every read must rediscover that frame from the growing history table, so
   latency and database load increase with retained history.
6. Failed upload/analysis rows and their low-quality objects have accumulated
   without a bounded cleanup operation. They are not useful demo evidence and
   inflate the UI's historical failure total.

## Recovery scope

- Keep only the three named Jingcheng camera agents enabled on the factory Pi.
- Replace per-camera latest-record queries with one windowed batch query per
  record type while preserving exact newest-record ordering and tenant scope.
- Bound status aggregation and batch ranking to each camera's configured
  retention horizon, and add matching composite newest-record indexes for
  frames, uploaded frames, OCR, person observations, and gauges.
- Add a regression test that bounds database statement count as camera count
  grows.
- Stop proxying every camera JPEG through the Render API process. After the
  normal authenticated organization check, issue a short-lived (90 seconds)
  object-storage read URL that contains no storage key in the API response
  beyond the signed URL itself. The web app downloads that URL directly and
  falls back to the existing protected image endpoint for local-file storage.
- Preserve authenticated, private, `no-store` image delivery. Do not expose R2
  URLs, RTSP credentials, device tokens, or factory images publicly.
- Verify production with fresh non-corrupt frames from all three cameras and
  measure the camera-list response after deployment.
- Add nullable `latest_frame_id` and `latest_storage_key` fields to each camera
  device, backfill them from the newest uploaded frame, and update both fields
  atomically whenever a frame completes upload. Reads use the pointer first and
  retain a legacy fallback only while old rows are being backfilled.
- Add an explicit dry-run-first cleanup command for frames whose upload or
  analysis status is failed. Cleanup must preserve every camera's current
  latest frame, delete derived observations before the frame, delete the object
  before committing metadata removal, operate in bounded batches, and emit a
  machine-readable summary. Healthy uploaded frames are out of scope.
- Keep `latest_storage_key` server-side. Web and LINE clients continue to
  receive only authenticated manifests or short-lived signed URLs.

## Follow-up configuration gate

The production camera-analysis worker must use the same S3 bucket, endpoint,
region, access key, and secret as the production API. Correcting that Render
configuration is required to clear false `frame_object_missing` analysis
failures, but it must not be allowed to block display of a valid uploaded frame.
