# Desktop Web Beta Threat Model

## Scope

This threat model covers the new browser-based desktop beta surface plus the planner server changes required to support it.

Android remains the flight-critical runtime and is explicitly outside this web threat model except where shared artifacts or auth records overlap.

## Trust Boundary

```text
Invited User Browser
    |
    v
Desktop Web App (Render Static Site)
    |
    | HTTPS + bearer access token
    v
Planner Server (Render Web Service)
    |
    +--> Postgres
    |
    +--> S3-compatible Artifact Storage
    |
    +--> Audit/Event records

Android Pilot App
    |
    +--> Same planner server and artifact store
```

## Protected Assets

- organization membership and role assignments
- site records and mission requests
- mission artifacts
- invoice metadata and attachments
- refresh tokens and auth secrets
- audit logs
- flight events and telemetry batches

## Primary Threats

| Threat | Attack Path | Impact | Required Controls |
|---|---|---|---|
| Cross-org data exposure | User changes mission, site, invoice, or artifact IDs across tenants | Sensitive mission or billing data leaks | Org-scoped authorization on every read/write path, integration tests for IDOR cases |
| Invite abuse | Stolen or replayed invite token is used after intended user or after revocation | Unauthorized account creation | Signed single-use invite tokens, expiry, revoke support, audit events |
| Session theft | Refresh token or access token is stolen from browser or logs | Full account takeover | HttpOnly refresh cookie, in-memory access token only, origin checks, short TTL, rotation |
| Brute-force login | Repeated login attempts against invite-only auth endpoints | Account compromise or service abuse | Rate limits, lockout backoff, audit alerts, no verbose auth errors |
| Artifact leakage | Authenticated artifact URL is shared outside intended org | Mission bundle disclosure | Tenant-aware authorization before artifact streaming, private bucket, no public signed URLs for beta |
| Invoice tampering | Low-privilege user edits invoice status or attachments | Billing fraud or support confusion | Internal-only invoice mutations, audit trail, server-side role checks |
| Audit evasion | Sensitive mutations are not recorded or can be edited later | Incident review becomes unreliable | Append-only audit model, server-side emission, protected read path |
| CSRF or same-site confusion | Browser silently refreshes or logs out across app/api boundaries | Session confusion or forced action | `SameSite=Strict`, explicit `POST` only, origin validation on session endpoints |
| Secret exposure in CI or deploy | Render or GitHub Actions secrets leak through logs or misconfig | Platform compromise | Secret scanning, no echoing secrets, least-privilege deploy credentials, `cso` pass before ship |

## Beta Controls

### Authentication

- Keep Android bearer-token behavior unchanged.
- Use a dedicated web refresh cookie.
- Enforce refresh rotation and revocation server-side.
- Rate-limit login, refresh, invite accept, and password-setting flows.

### Authorization

- Add org-scoped filters to missions, sites, invoices, artifacts, events, and telemetry.
- Never trust org identifiers from the browser without reconciling them against membership.
- Internal-only endpoints require `platform_admin` or `ops`.

### Artifact Protection

- Keep buckets private.
- Stream artifacts through authenticated planner-server endpoints.
- Audit artifact publication and download-sensitive support actions.

### Billing Protection

- Manual invoice creation and mutation are internal-only.
- Customers can read only their org invoices.
- Attachments must be stored behind authenticated references, not public URLs.

### Observability

- Emit audit events for auth, invite, role, site, mission, artifact, and invoice actions.
- Keep security-sensitive failures visible in logs without leaking secrets or raw tokens.

## Required Security Tests

- org A cannot read org B site, mission, invoice, invite, event, telemetry, or artifact data
- revoked invite cannot be accepted
- expired invite cannot be accepted
- customer roles cannot mutate invoices
- customer viewer cannot create or edit sites
- refresh token rotation invalidates the previous token
- artifact endpoints reject valid auth from the wrong org
- login and invite endpoints enforce rate limits

## Deferred Risks

- open self-serve signup
- hosted checkout provider callbacks
- analytics portal and broader report export
- custom role editor
- mobile browser planner support

These are deferred because each expands the trust boundary and should not be folded into the first beta launch.
