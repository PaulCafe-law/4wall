# LINE Safe Natural Language And Six-Cell Rich Menu

## Sprint Boundary

This Sprint 2 change is limited to `planner-server/`, backend tests, deployment configuration, and `docs/`. Android, flight control, the desktop Factory Twin implementation, and the local Codex worker are out of scope.

Checkpoint: `4e96db1` on `codex/line-safe-intents-rich-menu`.

## Problem

The official LINE account currently accepts only exact command strings. Natural requests such as `給我現在機台狀況` fall through to the help card. The mobile screenshot also shows a six-cell menu whose labels and actions do not match the repository's four-cell rich-menu script.

The usability fix must not reconnect untrusted LINE text to the local Codex CLI. A read-only host sandbox does not prevent host-file reads, so prompts are not a security boundary.

## Safety Architecture

```text
LINE event
  -> verify HMAC signature and destination
  -> deduplicate webhook event
  -> resolve active user/group binding and current membership
  -> parse bounded intent (pure, no I/O)
       -> one allowlisted intent
       -> ambiguous / unsupported / negated
  -> resolve machine candidate inside bound site layout
  -> execute one existing scoped read or fixed navigation response
  -> reply through LINE Messaging API

Never reachable from this flow:
  local Codex worker / shell / filesystem / arbitrary SQL / arbitrary URL fetch /
  deployment tools / server administration
```

Allowed query intents:

- `floorplan`
- `machines`
- `machine_detail`
- `hmi_screen`
- `machine_people`
- `daily_incidents`

Allowed navigation intents:

- `project_progress`
- `official_site`

Fixed response intents:

- `contact_us`

Legacy `gauges` and `people_portal` postbacks remain compatibility aliases for `hmi_screen` and `machine_people` respectively.

The parser normalizes Unicode with NFKC, lowercase, punctuation, and whitespace. It returns only a typed intent plus an untrusted machine candidate. The scoped resolver gathers every layout id, label, and explicit alias match, converts matches to canonical machine ids, and proceeds only when exactly one canonical id remains.

Multi-intent, negated, unsupported, and ambiguous machine requests return a deterministic clarification/help response. User-provided URLs are never fetched or reflected.

## Navigation Origin Policy

Reply links are derived from `BUILDING_ROUTE_APP_ORIGIN`, never from user text. Before a URI is emitted, the origin must have:

- HTTPS outside development/test.
- An exact hostname listed in `LINE_NAVIGATION_ALLOWED_HOSTS`.
- No username/password, query, or fragment.
- No port unless explicitly listed by the configured origin.

Paths are joined as normalized fixed routes:

- `/factory-twin` for engineering progress.
- `/official` for the public website.

Contact is a fixed text response, not a navigation URL.

An invalid origin produces a text-only unavailable response.

## Six-Cell Rich Menu

All six cells use postbacks so every tap receives an observable bot response:

| Label | Postback |
|---|---|
| 2D圖 | `action=floorplan` |
| 檢視工程進度 | `action=project_progress` |
| 前往官網 | `action=official_site` |
| 找機台 | `action=machines` |
| 機台人員情況 | `action=machine_people` |
| 聯絡我們 | `action=contact_us` |

`machine_people` returns only HC600-01's fresh anonymous 0/N count. It never returns detections, coordinates, faces, identities, screenshots, or tracks. `contact_us` returns `聯絡我們：4wallaitech@gmail.com`.

The repository script is the source of truth. Provisioning is create, upload, set default, then verify. The fixed, non-overridable identity guard requires `4wallaitech` and `@941wjxxe`. The previous default id is retained for rollback; if LINE reports a manager-owned default whose id cannot be restored, the script fails before creating or changing a menu.

## Controlled Rollout

- `LINE_NATURAL_LANGUAGE_ENABLED=true` enables bounded intent matching globally.
- `LINE_NATURAL_LANGUAGE_CANARY_ORG_IDS` enables it only for listed organizations while the global flag is false.
- Exact aliases and rich-menu postbacks continue to work when natural-language matching is disabled.
- Logs record only intent outcome, ambiguity/fallback category, latency, and reply error, not the raw message.

## Failure Modes

| Failure | Handling | Test |
|---|---|---|
| Invalid signature/destination | Existing 403 before parsing | Webhook integration |
| Unlinked or revoked user | Link/relink response, no site data | Webhook integration |
| Parser matches multiple intents | Clarification, no query | Parser + webhook |
| Unknown/ambiguous machine | Site-scoped list/clarification | Parser/resolver |
| Invalid configured origin | Text-only unavailable response | Unit + webhook |
| Unknown postback | Deterministic unsupported response | Webhook |
| LINE reply failure | Existing delivery error/retry behavior | Existing delivery tests |
| Natural-language false positive | Disable global flag or remove canary org | Config + smoke |
| New rich menu webhook smoke fails | Restore previous default id | Production runbook |

No planned failure mode is silent without both error handling and a test or production smoke check.

## What Already Exists

- `LineConversationScope` and account-link membership rechecks are reused.
- Existing floorplan and incident replies are reused; machine detail now uses the same fresh HMI view as `hmi_screen`, and `machine_people` uses the scoped anonymous count.
- Existing webhook signature, destination, body-size, deduplication, and reply delivery paths are preserved.
- Existing `BUILDING_ROUTE_APP_ORIGIN` supplies the navigation origin.
- Existing rich-menu provisioning script is upgraded instead of replaced.

## NOT In Scope

- General-purpose LLM chat in LINE, because bounded factory intents meet the request without a tool-injection surface.
- Named-person lookup, identity, faces, detection geometry, screenshots, or tracks in LINE; only a fresh anonymous HC600-01 count is allowed.
- New project-progress aggregation, because the button only needs a working authenticated entry point in this sprint.
- Changes to the Factory Twin UI, Android app, drone runtime, or flight-control boundaries.
- Deleting old rich menus automatically; rollback ids remain available until production verification completes.

## Acceptance

- `給我現在機台狀況` returns the linked site's machine response.
- Common Chinese variants for all supported intents meet the versioned corpus threshold: precision at least 95%, recall at least 90%.
- Adversarial text produces zero twin-agent jobs, tool calls, URL fetches, or server-control effects.
- All six production menu cells reply successfully and none fall through to the help card.
- Official and project-progress links use only the validated configured origin; contact returns the exact support email and people returns only the anonymous 0/N count.
- Unlinked, revoked, cross-site, ambiguous, unknown, malformed, duplicate, and reply-failure paths remain fail-closed.

## Review Summary

- Scope challenge: accepted as an eight-file, single-module change.
- Architecture issues resolved: typed intent boundary, scoped machine resolver, exact origin validation, canary rollout, live-menu reconciliation.
- Code quality: one new pure parser module; existing router and message builders remain the action executors.
- Tests: pure parser corpus plus webhook integrations and rich-menu payload assertions.
- Performance: O(number of intent rules + machines in one bound layout), no new database queries for navigation actions.
- Parallelization: sequential implementation, no useful parallel lane because parser, router, messages, and tests share one LINE module.
- Deferred TODOs: none; deferred capabilities are explicitly out of scope above.
