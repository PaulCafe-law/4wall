# HC600 HMI OCR + GPT Summary Gap Analysis

## Context

`192.168.1.10` is the fixed camera facing the HC600 injection machine HMI and work-order sheet.
The Pi already uploads frames to the platform. The 3090 host (`nckusoc`) runs the OCR worker
because Pi 5 should not run PaddleOCR or GPT workloads.

The first gauge reader only posted fixed numeric readings. The next step needs a richer record:

- detect whether the HMI is showing `temperature_monitor`, `machine_monitor`, or `unknown`;
- preserve full raw OCR lines for later debugging and parser improvement;
- write high-confidence structured fields while marking uncertain values as `unknown`;
- summarize work-order OCR into an operator-readable note;
- surface the latest HMI/OCR data in `/cameras` and the Factory Twin HC600-01 detail panel.

## Decision

Add a separate `CameraOcrObservation` model instead of overloading `CameraGaugeReading`.
Gauge readings remain useful for fixed analog/numeric values. HMI OCR needs raw text,
mode classification, structured screen fields, work-order text, and GPT summary status.

The GPT summarizer is explicitly personal-dev only:

- auth mode: `account_oauth_dev`;
- auth cache stays on `nckusoc`;
- no OpenAI/GPT token is committed or deployed to Render;
- if auth expires, OCR continues and summary status becomes `auth_required`.

GPT must not overwrite parser numbers. It only summarizes raw work-order/HMI text into a short
operations note.

## Non-Goals

- Do not read or commit browser cookies, OpenAI tokens, or ChatGPT auth cache.
- Do not run PaddleOCR or GPT on Pi 5.
- Do not use GPT as the source of truth for numeric readings.
- Do not turn this into production multi-user GPT auth.
- Do not support every HC600 screen in this pass. The first supported modes are
  `temperature_monitor` and `machine_monitor`.

## Safety Boundary

The worker sends observations only through existing camera device-token APIs.
The server and web app remain outside any flight-critical loop.
No OCR result may trigger control commands.

## Acceptance

- Device-token API accepts and stores OCR observations.
- `/v1/cameras` returns the latest OCR observation under existing org-scoped auth.
- The worker preserves raw OCR and marks uncertain fields as `unknown`.
- `/cameras` displays latest HMI OCR status and summary.
- `/factory-twin` HC600-01 detail displays real gauge readings, HMI OCR, and work-order summary.
- Missing or expired GPT auth does not stop OCR submission.
