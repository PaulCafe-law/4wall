# LINE image fetch race gap analysis

## Symptom

LINE displayed placeholders for both the dispatch-ticket crop and the HMI crop even though the webhook successfully sent both image messages.

## Production evidence

- Frame capture: `2026-07-12T15:45:10Z`.
- Render token issue: `2026-07-12T15:47:44Z`.
- LINE image fetches: from `2026-07-12T15:48:18Z`.
- Both `/v1/line/dispatch-ticket/...` and `/v1/line/hmi-screen/...` returned `404`.

The frame was 154 seconds old when the reply URL was issued, so it passed the 180-second freshness check. It was 188 seconds old when LINE fetched the URL, so the endpoint repeated the freshness check and rejected the already-created crop.

## Root cause

The reply path and image-download path evaluated the same three-minute freshness rule at different wall-clock times. This time-of-check/time-of-use gap made a valid image URL become invalid while LINE was downloading it.

## Fix boundary

- Keep the three-minute rule when the reply token and image URLs are created.
- At image download, validate capture freshness against the signed render token's `issued_at`, not the later HTTP fetch time.
- Keep the existing signed-token TTL, LINE binding, site/camera/frame scope, ROI validation, and stored-crop checks.
- Add regression coverage for both dispatch-ticket and HMI endpoints across the three-minute boundary.

