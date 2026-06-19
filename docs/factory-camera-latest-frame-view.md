# Factory Camera Latest Frame View

## Goal

Add the first management-platform camera view for the factory camera pipeline.
This is not live streaming. The first production view shows the newest uploaded
JPEG frame and refreshes it on the same cadence as the Pi agent.

## Current Gap

- Pi 5 uploads frames every 10 seconds.
- The API records camera and frame metadata.
- The analysis worker processes uploaded frames.
- The web app can not yet display the latest image.

## First Version

- Add a web-authenticated API endpoint that returns the latest uploaded frame
  bytes for a camera the current web user can read.
- Keep the R2 bucket private. The browser reads image bytes through the API with
  the user's bearer token instead of a public object URL.
- Add a `Cameras` page in the desktop management app.
- Refresh camera metadata and image blobs every 10 seconds.
- Show operational status: last heartbeat, last frame time, latest frame id,
  upload status, analysis status, and counts.

## Explicit Non-Goals

- No WebRTC or HLS live stream.
- No public R2 object URLs.
- No camera RTSP credentials in the browser.
- No Industrial Data Engine integration.
- No flight-critical behavior.

## Security Notes

- Image access uses the same org read scope as `GET /v1/cameras`.
- Cross-org users must not be able to read camera images.
- The endpoint should return `404` when no uploaded frame or object exists.
- Responses should use private/no-store cache headers because frames may contain
  operational site imagery.

## Production Deployment Evidence

Deployed on 2026-06-19 using DockerHub image references:

- API: `paul953206/4wall-api:camera-latest-20260619-2335`
  - `prod` digest: `sha256:b988ea8c298dbfd50c2d83eb26ae1436771ba6b6c8661c3eb01d4b55721dca55`
- Web: `paul953206/4wall-web:camera-latest-20260619-2335`
  - `prod` digest: `sha256:a1aa25b3741bbe22616450e4236ce4353b6f81a436535fbb4e97dfdccfebf00d`

Verification completed:

- `GET https://four-wall-api.onrender.com/healthz` returned `ok`.
- Unauthenticated `GET /v1/cameras/{cameraId}/latest-frame/image` returned
  `401 missing_bearer_token`, confirming the new protected route is live.
- `GET https://four-wall-web.onrender.com/cameras` returned `200`.
- The production web bundle contains `/latest-frame/image`.
- Pi `fourwall-camera-agent` remained `active` and continued logging
  `uploaded_or_spooled` frames after deployment.

The final visual check requires a management-platform login session. Without a
web session, `/cameras` correctly renders the login page.
