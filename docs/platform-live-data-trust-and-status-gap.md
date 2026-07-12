# Live Data Trust and System Status Gap

## Scope

This change tightens the existing Jingcheng factory pilot. It does not add a new
dispatch workflow, simulated production data, worker identity, or machine control.

The user-facing goals are:

- do not render an initial zero while camera data is still loading;
- label stale camera, person, gauge, and OCR evidence with its last update age;
- never present an uncertain work-order OCR value as confirmed;
- explain that Jingcheng has no live AMR feed instead of implying an outage or
  returning simulated AMR state;
- provide one authenticated status page for the web app, cameras, 3090 recognition
  output, 4WALL AI assistant, and database.

## State Semantics

Live data uses five distinct states:

| State | Meaning | User-facing behavior |
| --- | --- | --- |
| Loading | The first authenticated request has not completed | Show `載入中`; never show zero |
| Current | Evidence arrived within its freshness window | Show the current count or value |
| Stale | Evidence exists but is outside its freshness window | Show `最近一次在 ... 前` and do not call it current |
| Unavailable | The source is not connected or has never produced evidence | Say what is not connected or that no evidence exists |
| Error | A request or dependency check failed | Show `無法確認` and preserve the last known timestamp when available |

Freshness windows remain conservative and source-specific:

- camera heartbeat or frame signal: 90 seconds;
- person presence: 90 seconds;
- 3090 OCR, gauge, or person recognition output: 3 minutes;
- browser world snapshot used by the assistant: 30 seconds for current-state wording.

## Assistant Trust Rules

- Jingcheng customer mode contains no live AMR entity. An AMR status question must
  state that live AMR data is not connected and must not quote simulation state.
- A work order is confirmed only when the sheet is stabilized and every recognized
  value used in the answer has confidence of at least 0.75.
- If a work order is not stabilized or contains a recognized low-confidence value,
  any answer that mentions it must include `待確認`.
- When evidence is stale, the assistant must state the age of the latest evidence
  and must not describe it as the current state.

## Status Page

The page is available to authenticated users and contains no infrastructure secrets.

- Website: healthy when the page application is running.
- Cameras: derived from the tenant-scoped camera list and heartbeat/frame age.
- 3090 recognition host: inferred from the newest tenant-scoped HMI OCR or
  person-recognition output. Gauge readings are excluded because they may be
  produced by an edge device. The page labels this as evidence-based, not a direct
  host ping.
- Assistant: provided by an authenticated, tenant-scoped status endpoint that
  reports worker heartbeat and world-snapshot age without returning snapshot data.
- Database: provided by the existing `/healthz` database probe.

Internal addresses, worker command lines, tokens, raw camera names, and data from
other organizations must not appear in the response or page.

## Verification

- frontend tests cover loading labels, stale age labels, status aggregation, and
  customer navigation;
- LINE tests cover deterministic HMI, anonymous people, HC600-01/02 availability,
  contact replies, and the invariant that external text creates no Twin Agent job;
- API tests cover assistant status authentication and organization scoping;
- production verification checks the customer account, three cameras, status page,
  HMI/person/contact LINE replies, and zero Twin Agent jobs from external LINE text.
