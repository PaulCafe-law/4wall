# Factory Camera View Recovery Gap Analysis

Date: 2026-07-22

## Incident evidence

- The production camera page eventually returned all three Jingcheng frames, but
  `GET /v1/cameras` took 39.68 seconds before image requests could start.
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

## Recovery scope

- Keep only the three named Jingcheng camera agents enabled on the factory Pi.
- Replace per-camera latest-record queries with one windowed batch query per
  record type while preserving exact newest-record ordering and tenant scope.
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

## Follow-up configuration gate

The production camera-analysis worker must use the same S3 bucket, endpoint,
region, access key, and secret as the production API. Correcting that Render
configuration is required to clear false `frame_object_missing` analysis
failures, but it must not be allowed to block display of a valid uploaded frame.
