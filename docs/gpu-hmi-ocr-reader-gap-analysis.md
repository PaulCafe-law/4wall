# GPU HMI OCR Reader Gap Analysis

> 2026-07-04 update: this first-pass plan is extended by
> `docs/hc600-hmi-ocr-gpt-summary-gap-analysis.md`.

## Context

The factory camera at `192.168.1.10` sees the HC600 HMI, work-order sheet, and analog meters.
The previous Pi gauge reader can read simple fixed ROIs, but the HMI screen needs OCR and
screen-mode parsing. That workload belongs on the 3090 host (`nckusoc`), not on Pi 5.

## Decision

Add a standalone worker under `planner-server/deploy/gpu-hmi-ocr-reader/`.

The worker:

- pulls the latest uploaded camera frame through the platform camera frame API;
- crops fixed HMI and work-order ROIs;
- uses PaddleOCR / PP-OCRv5 on GPU;
- classifies supported screen modes;
- posts legacy fixed readings to `/v1/camera-ingest/gauge-readings` when configured;
- posts full OCR observations to `/v1/camera-ingest/ocr-observations`;
- keeps debug crops local under `runtime/`.

The worker is deployable independently from Render. It uses device-token auth and does not need
a web session cookie.

## Why Not Pi

PaddleOCR and GPT summary are too heavy for Pi 5 in this deployment. Pi should keep doing
camera capture and upload. GPU OCR runs asynchronously from the latest uploaded frames, so
camera ingestion remains simple and recoverable.

## Security Boundary

- Device tokens are stored only on the worker host.
- Debug crops and auth cache are never committed.
- The worker strips common API-key environment variables before invoking the GPT summary bridge.
- OCR/GPT data is observational only. It does not produce control commands or alerts by itself.

## Risks

- The HMI is small in the full camera frame. Camera bitrate, focus, exposure, and ROI calibration
  directly affect OCR quality.
- The work-order sheet may be partly occluded by a ruler or paper angle.
- GPT account auth is personal-dev only and may expire. OCR must continue when summary auth fails.

## Acceptance

- Offline tests run without PaddleOCR installed by using fake/test paths.
- Live worker can submit gauge readings and OCR observations using device-token auth.
- `screenVisibility.status = "dark"` skips HMI OCR when the screen is off.
- `screenVisibility.status = "lit"` runs OCR and stores lit samples for calibration.
- No screenshots or secrets are added to git.
