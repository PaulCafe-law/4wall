# LINE Live Status v3 Gap Analysis

## Context

The Jingcheng LINE experience must expose current, scoped factory information for HC600-01 without forwarding LINE text to local tools. Production testing found that the dispatch-sheet crop moved after the fixed camera changed position, the LINE meter response showed historical PRESS/FLOW readings instead of HMI screen content, inactive machines still exposed detail actions, and the people action did not return an anonymous current count.

## Confirmed Gaps

1. The HMI worker discards the latest-frame response headers and stamps processing time, so OCR observations are not bound to the source frame or capture time.
2. LINE dispatch-ticket rendering uses a duplicated hard-coded ROI and independently selects the newest camera frame. It can pair one OCR observation with another image.
3. Work-order and temperature stabilizers can hold a historical lock through current-frame OCR failure, making stale values appear current.
4. LINE `gauges` reads `CameraGaugeReading`, not `CameraOcrObservation.structured_fields_json`, so old analog readings are returned even when the user asks for screen information.
5. The person worker suppresses zero-person observations, preventing the server from distinguishing a confirmed zero from missing recent data.
6. Machine availability, the overview camera used for person counts, and the rich-menu wording are not explicit in the Jingcheng layout contract.

## Decisions

- URL/live OCR observations carry `frameId`, source capture time, resolved pixel ROIs, frame size, calibration ID, and alignment status.
- LINE dispatch tickets use only the exact observation frame and observation ROI. Missing, stale, mismatched, or unaligned data fails closed.
- Current OCR/dispatch data is at most three minutes old by server receive time. Current person data is at most sixty seconds old.
- Historical consensus may improve confidence but may not create current-frame evidence. Three consecutive alignment failures clear locks; recovery requires two valid frames.
- LINE HMI responses render reliable structured screen fields, then at most eight HMI-region OCR lines at confidence 0.55 or higher. Analog PRESS/FLOW data is not shown in LINE.
- Only HC600-01 is LINE-enabled. HC600-02 through HC600-07 reply `尚未開通`.
- Anonymous person counts use the HC600-01 overview camera (`192.168.1.31`) and include zero-person observations. No identities, coordinates, images, or tracks are returned.
- Contact replies with `聯絡我們：4wallaitech@gmail.com`.
- Rich menu v3 changes `找人` to `機台人員情況`; legacy `gauges` and `people_portal` actions remain safe compatibility aliases.

## Safety and Rollout

LINE text remains on the deterministic intent boundary and never enters the local twin-agent/Codex worker. The existing OCR endpoint already accepts optional `frameId` and arbitrary structured fields, so workers can publish the new contract before the LINE backend is deployed. Field calibration must restore and secure the original view when the HMI or dispatch sheet is outside the full frame; otherwise a versioned ROI may be calibrated to the current view. Backend, worker, rich-menu, tenancy, freshness, and fail-closed behavior must be regression-tested before production rollout.
