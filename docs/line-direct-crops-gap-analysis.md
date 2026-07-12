# LINE direct crops hotfix

## Scope

LINE screenshot replies must show the current camera evidence even when OCR cannot
confirm the work-order fields. OCR validity is therefore no longer a prerequisite
for LINE image delivery.

## Retained boundaries

- linked LINE account or bound conversation scope;
- exact organization, site, and configured HC600-01 camera;
- live OCR observation linked to its exact uploaded frame;
- capture and receipt no older than 3 minutes;
- calibration id, actual frame size, and bounded pixel ROIs;
- signed image URL and rate limiting.

The only removed gate is work-order OCR alignment/current-evidence status. Parsed
numbers remain untrusted; this hotfix delivers pixels, not inferred values.
