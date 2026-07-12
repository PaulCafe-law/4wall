# LINE One-to-One Account Linking

## Sprint Boundary

This Sprint 2 change is limited to `planner-server/`, `web-app/`, `shared-schemas/`, `docs/`, and
CI/deploy configuration. Android, flight control, and billing are out of scope. Deployment changes
are limited to reproducible dependencies, a pre-deploy database migration, feature flags, and
release verification. The security gate additionally hardens camera-image validation because
LINE's dispatch-ticket command decodes those uploaded bytes inside the API process.

Checkpoint: `1d2fa76` (`chore: checkpoint before LINE account linking`).

## Problem And Current Gap

LINE message webhooks already contain the sender's opaque `userId`, but the server only has
`LineGroupBinding`, which authorizes a LINE group for one organization and site. Direct messages
are deliberately rejected before command routing. `UserAccount` and `OrganizationMembership` do
not contain a verified LINE identity.

The desired behavior is:

- a one-to-one conversation resolves a verified LINE user to an existing web user;
- the web user's active organization memberships determine readable sites;
- one explicit site is remembered for LINE replies;
- group conversations keep their existing independent group-to-site binding;
- every read and mutation is checked against the current membership state, not only the state at
  link time.

Typing a site name in LINE is not authorization. Unknown users must never self-bind by sending
`綁定 <場域>`.

## What Already Exists

- Signed LINE webhook verification and idempotent webhook-event records.
- LINE reply and push helpers using the configured channel access token.
- Web login, short-lived bearer access tokens, HttpOnly refresh cookies, and origin checks.
- `CurrentWebUser.can_read_org()` and `can_write_org()` authorization rules.
- Site listing scoped through active organization memberships.
- Administrator-controlled `LineGroupBinding` for shared duty groups.
- Short-lived HMAC floorplan render and live-view tokens.
- Audit events and Alembic migration tests.

The implementation reuses these paths. It does not create another login system or another role
model.

## Chosen Architecture

Use LINE Messaging API account linking with the existing web login. The LINE link token remains
short-lived, is encrypted at rest with a dedicated rotatable key, and is never exposed to the web
client. Public URLs contain only a random flow handle in the URL fragment. The server stores hashes
of the flow handle and its own nonce.

```text
LINE 1:1 message
      |
      v
signed webhook ---- existing active LineUserBinding? ---- yes ----> resolve current membership
      | no                                                    |              |
      v                                                       |              v
issue LINE link token                                         |        authorized site scope
      |                                                       |              |
      v                                                       +--------------+
create server-side attempt and encrypt link token                             |
      |                                                                       |
      v                                                                       |
reply with /line/link#flow=...                                                |
      |                                                                       v
      v                                                               deterministic command reply
web app stores flow handle in sessionStorage and removes it from URL
      |
      +---- anonymous ----> existing /login ----> /line/link
      |
      v
list currently authorized LINE-capable sites
      |
      v
user explicitly selects site and confirms
      |
      v
API verifies bearer user + origin + membership + site, stores hashed one-time nonce
      |
      v
return a same-API-origin one-time redirect handle (no LINE token in app JavaScript)
      |
      v
API consumes redirect handle, clears ciphertext, and sends HTTP 303 to LINE
      |
      v
LINE accountLink webhook ---- validate nonce, expiry, replay, membership ----> upsert binding
```

## Data Model

### `LineUserBinding`

- `id`
- `destination_id`
- `line_user_id`
- `user_id`, foreign key to `UserAccount`
- `site_id`, foreign key to `Site`
- `is_active`
- `verified_at`, `created_at`, `updated_at`

Unique constraints on `(destination_id, line_user_id)` and `(destination_id, user_id)` prevent a
service account from silently sharing access across several LINE accounts. An inactive binding can
be explicitly relinked. The layout slug is derived from the selected site's registered LINE layout,
so duplicated site facts cannot drift.

### `LineAccountLinkAttempt`

- `id`
- `flow_token_hash`, unique; raw flow handle is never persisted
- `expected_line_user_id`
- `destination_id`
- `is_current`; `true` only for the one pending attempt for this official account and LINE user,
  otherwise `null` for retained terminal audit rows
- `encrypted_link_token`; nullable encrypted short-lived payload, cleared after redirect or any terminal state
- `user_id`, nullable foreign key to `UserAccount` until web confirmation
- `site_id`, nullable foreign key to `Site` until web confirmation
- `nonce_hash`, unique and nullable until web confirmation; raw nonce is never persisted
- `redirect_token_hash`, unique and nullable; the raw redirect handle is never persisted
- `status`
- `expires_at`
- `consumed_at`
- `redirected_at`
- `created_at`, `updated_at`

The flow handle and nonce are generated with a cryptographically secure random generator and have
at least 256 bits of entropy. The attempt expires no later than LINE's link token, currently 10
minutes, and is consumed once. Completing the link requires the account-link webhook's nonce,
`source.userId`, and destination to match the same attempt.

The database enforces a single current attempt for each `(destination_id, expected_line_user_id)`.
Starting again supersedes the previous attempt, while expired and terminal rows retain non-secret
audit metadata. Ciphertext and redirect handles are scrubbed when an attempt expires or becomes
terminal.

### Recoverable account-link replies

For link creation, successful link completion, and self-service unlink, the webhook event stores
the reply messages as dedicated-key encrypted ciphertext in the same transaction as the identity
change. The server only marks the event processed and clears that ciphertext after LINE accepts the
reply. If delivery fails, LINE receives a non-success webhook response and may redeliver the same
event; the server then sends the stored reply without reissuing a link token, consuming a nonce
again, or repeating the identity mutation. LINE omits both `source` and `replyToken` when account
linking returns `result=failed`, so that event retires the attempt without trying to send an
impossible reply.

The web client receives only a same-API-origin redirect URL. The API decrypts the official LINE
URL exactly once, clears both the ciphertext and redirect hash, then replies with `303 See Other`
and `Cache-Control: no-store` / `Referrer-Policy: no-referrer`.

## Conversation Authorization

```text
source.type == group
  -> groupId -> active LineGroupBinding -> organization/site scope
  -> reads use the administrator-approved shared group scope
  -> mutations additionally require source.userId to have a matching active LineUserBinding
  -> reload that user's membership and require can_write_org

source.type == user
  -> userId -> active LineUserBinding -> active UserAccount
  -> reload active memberships on every event
  -> selected Site must still belong to a readable active organization
  -> read commands require can_read_org
  -> mutations require can_write_org

source.type == room
  -> deny without revealing site or organization data
```

All incident postbacks must resolve the conversation scope before reading or mutating an incident.
The incident's organization and site must match that scope. This closes the existing path where an
incident ID alone could reach a mutation handler.

## Web And Bot Behavior

- Unlinked direct user: reply with a short explanation and a `連結帳號` URI button containing only
  the fragment flow handle.
- Any normal message from an unlinked direct user starts that same flow automatically. Explicit
  `連結帳號` / `切換場域` commands remain available. Starts are limited per LINE user and per
  official-account destination to prevent link-token API abuse.
- Linked direct user: run the same read commands as a bound group using the user's site scope.
- Unmatched/free-form LINE text: return the command help card. External LINE text is never sent to
  the local Codex-backed Twin Agent; its read-only sandbox is not a host-file confidentiality
  boundary. A future natural-language path must use a no-tools model boundary.
- `切換場域` or `連結帳號`: issue a fresh official account-link URL.
- `解除連結`: deactivate the caller's binding immediately and explain how to link again.
- No authorized LINE-capable sites: show a generic access message, without listing inaccessible
  organizations or sites.
- Multiple sites: the web link page requires an explicit selection and remembers it in the binding.
- Group `綁定 靚程`: retain the existing administrator-confirmed flow.
- A group member may read shared duty information, but writes are rejected unless that LINE user
  is linked to the same site and still has write permission.

## Floorplan Token Compatibility

New floorplan tokens carry `sourceType` and `sourceId`. Verification continues accepting existing group
tokens containing `groupId`, so already-issued links do not break during rollout. A user-scoped
token is valid only while the corresponding user binding, account, organization membership, and
site remain authorized.

## Failure Modes And Required Handling

| Failure | Handling | Test |
|---|---|---|
| LINE link-token API timeout or error | Generic retry message; no binding is created | Unit + webhook integration |
| Missing or leaked flow handle | Link page fails closed and asks user to restart in LINE | Frontend test |
| Forwarded flow opened under the wrong context | accountLink `userId`/destination mismatch fails closed | Service + webhook integration |
| Webhook destination is not this official account | `403` before event persistence | Webhook integration |
| Expired, unknown, or replayed nonce | Generic failed-link reply; no binding change | Service + webhook integration |
| Site outside current membership | `403` without site-existence details | API integration |
| Shared browser switches web account or link flow | Partition site-query cache by web user and flow; clear any prior selection | Frontend cache-isolation test |
| Membership/user/org revoked after linking | Every message fails closed; existing floorplan tokens stop working | Resolver + endpoint regression |
| Same LINE user linked to another active account | Conflict; require explicit unlink first | Service test |
| Same web user linked to another active LINE account | Conflict; do not share the account | Service test |
| Incident belongs to another site or organization | Generic denial; no mutation or title leak | Parameterized postback tests |
| Newer dispatch OCR/frame belongs to another site | Ignore it and use only the selected site's capture | Two-site regression |
| Camera bytes are not a valid declared JPEG/PNG | Reject upload completion; never queue decoding | Upload validation tests |
| Viewer sends a mutation command | Clear read-only denial; no write | Command tests |
| Duplicate account-link webhook | Nonce replay rejected; binding remains unchanged | Idempotency test |
| LINE reply fails after identity state commits | Keep encrypted reply pending; redelivery sends it without repeating the mutation | Webhook retry integration |
| Legacy group token | Still resolves through `LineGroupBinding` | Token regression |

No listed failure may silently grant access.

## Test Coverage Plan

```text
Webhook
  +-- invalid signature / disabled config / duplicate event [existing regressions]
  +-- group source [existing behavior retained]
  +-- room source [deny]
  +-- user source
      +-- unlinked -> account-link reply
      +-- linked + current read access -> scoped commands
      +-- linked + revoked access -> deny
      +-- unlink -> deactivate
      +-- mutation + read-only membership -> deny
      +-- unmatched text + Twin Agent enabled -> help only, no local-agent job

Account link API
  +-- authenticated user + authorized supported site -> one-time same-origin redirect
  +-- anonymous / inactive user -> 401
  +-- unauthorized or unsupported site -> generic 403
  +-- official link token and raw nonce never reach app JavaScript or storage

Account link redirect
  +-- valid one-time handle -> clear ciphertext + 303 to exact LINE endpoint
  +-- replay / expired / malformed handle -> 410 without redirect

AccountLink webhook
  +-- success -> consume nonce + create/update binding
  +-- expired / replayed / missing / result=failed -> no binding
  +-- identity conflict -> no reassignment

Postbacks
  +-- read action -> matching scope only
  +-- each mutation action -> writer + matching org/site only
  +-- cross-tenant, unlinked, revoked, fabricated ID -> unchanged

Floorplan/live view
  +-- legacy group token remains valid
  +-- authorized user token works
  +-- revoked user/membership invalidates token
```

Backend acceptance:

- Run the focused LINE, auth, migration, tenancy, incident, and floorplan tests.
- Run the complete `planner-server` pytest suite.

Frontend acceptance:

- Test token capture/removal, anonymous login handoff, one-site and multi-site selection, API errors,
  and successful LINE redirect.
- Run web tests, typecheck, and production build.

## Performance Review

Each direct event needs indexed lookups for the binding, user, site, and memberships. This is a
small fixed query count and avoids a stale authorization cache. The security benefit is worth the
few indexed queries. Site lists are bounded to the authenticated user's organizations and only
LINE-capable layouts.

## Rollout

1. Build the API from the hash-locked `planner-server/requirements.txt`, then run
   `python scripts/render_predeploy.py` as Render's pre-deploy command. A failed migration must
   stop the new image before it receives traffic.
2. Provision `LINE_ACCOUNT_LINK_ENCRYPTION_KEYS` with a newly generated Fernet key and set all
   prerequisites: `LINE_DESTINATION_ID`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`,
   `LINE_PUBLIC_BASE_URL`, `BUILDING_ROUTE_APP_ORIGIN`, and `LINE_WEBHOOK_ENABLED=true`.
   Keep `LINE_ACCOUNT_LINKING_ENABLED=false` until both services and the migration are deployed.
3. Keep existing group bindings and legacy tokens valid.
4. Deploy backend and frontend together because the link URL depends on the new page and API.
5. Enable the feature and verify with a non-production test user first: link, read, switch site,
   unlink, then cross-tenant denial. If staging is unavailable, deploy production with account
   linking disabled, complete health/login/migration checks, and only then enable the flag for the
   controlled test.
6. Keep `LINE_INCIDENT_NOTIFY_ENABLED=false` until proactive incident pushes route through an
   explicit active organization/site binding rather than a global default target.
7. Run a security review before production promotion.

## NOT In Scope

- LINE Login or LIFF channel creation; Messaging API account linking is sufficient.
- Self-service organization signup or permission changes.
- New site-level role semantics; current organization roles remain authoritative.
- Automatic trust based on LINE display name, public LINE ID, email guessing, or typed site name.
- Room conversations.
- Rich-menu redesign.
- Natural-language LINE answers backed by the local Codex CLI. The CLI is intentionally excluded
  because external text must not gain host filesystem or shell reachability.
- Redesigning proactive incident broadcast routing; the existing global-target switch stays off.

## Engineering Review Summary

- Scope: accepted with a minimal two-table design and one small public linking page.
- Architecture issues resolved: identity proof, current-membership revalidation, multi-site choice,
  unlinking, postback authorization, and legacy token compatibility.
- Code-quality posture: one conversation-scope abstraction, no duplicate auth or role system.
- Test posture: every success, denial, replay, revocation, and cross-tenant branch is required.
- Performance: fixed indexed lookups, no authorization cache.
- Parallelization: backend identity/token work and frontend linking-page work can proceed in
  parallel after this contract is fixed; integration tests follow both.
