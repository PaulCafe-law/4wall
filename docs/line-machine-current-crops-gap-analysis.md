# LINE machine current-crops hotfix

## Gap

The HC600-01 machine query currently returns a presentation card plus text. Operators
need the evidence itself: the current validated work-order crop and the HMI crop from
the exact same analyzed frame.

## Change

- `機台 m-hc600` replies with the fresh work-order crop and HMI crop from one scoped,
  frame-linked OCR observation.
- The existing 3-minute, tenant, site, camera, calibration, frame-size, and ROI checks
  remain mandatory. No latest-camera fallback is allowed.
- If the HMI crop is overexposed, append exactly `螢幕現在過曝。`.
- The old machine-detail Flex card is not sent in this flow.
- Both image URLs use the existing signed LINE render token and private cached crops.

## Acceptance

- Both images contain the expected distinct source regions, not only the expected size.
- Invalid, stale, cross-camera, or unaligned work-order evidence fails closed.
- The response contains no live-view button.
