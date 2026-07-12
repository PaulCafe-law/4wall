# LINE machine detail hotfix gap analysis

## User-visible gap

The HC600-01 machine-detail reply currently shows HMI status but omits the fresh,
already-ingested work-order summary. When the HMI is overexposed, the reply falls
back to a generic no-data message. Machine and floorplan replies also add a live-view
button that is not suitable for the LINE mobile presentation.

## Hotfix scope

- Keep all existing tenant, site, camera, frame, calibration, and freshness checks.
- Append the fresh HC600-01 work-order summary to machine-detail replies when the
  same scoped work-order query can confirm it. Never reuse stale or unaligned data.
- Classify a blown-out HMI crop as `overexposed` and reply exactly
  `螢幕現在過曝。`; existing observations are recognized from their luminance
  metrics during the rollout transition.
- Remove live-view buttons from LINE floorplan and machine-detail replies.
- Do not change LINE's fixed-intent boundary or expose server tools.

## Acceptance checks

- Fresh work-order evidence appears after an HC600-01 detail query.
- Overexposed, fresh, frame-linked HMI evidence returns the explicit warning.
- No LINE floorplan or machine-detail reply contains an `即時圖` URI button.
- Stale, cross-tenant, cross-camera, or unaligned work-order evidence remains hidden.
