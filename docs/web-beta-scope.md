# Desktop Web Beta Scope

## Objective

Add a desktop-first web app that gives internal ops and invited customers a single place to:

- manage organizations and sites
- request missions
- inspect mission status and artifacts
- track manual invoices
- review audit-grade operational state

This surface is never flight-critical. Android remains the only flight-critical runtime.

## Product Shape

- App type: single React + Vite + TypeScript app
- Access model: invite-only
- Deployment: Render static site in front of `planner-server`
- Roles:
  - `platform_admin`
  - `ops`
  - `customer_admin`
  - `customer_viewer`

## Supported Devices

- `>=1280px`: full beta support
- `768px` to `1279px`: view-first support, limited editing
- `<768px`: unsupported for beta

## Primary Navigation

### Customer Navigation

- `Sites`
- `Missions`
- `Artifacts`
- `Billing`
- `Team`

### Internal Navigation

- `Organizations`
- `Ops Queue`
- `Audit`
- plus all customer-visible sections when impersonating or assisting a tenant

## MVP Screens

- Invite acceptance
- Login
- Session restore / auth expiry handling
- Site list
- Site detail
- Mission list
- Mission detail
- Mission planner workspace
- Artifact panel
- Billing / invoices
- Internal org admin
- Internal audit log
- Failed mission support view

## Mandatory States

- empty state
- no mission yet
- planning in progress
- artifact generation failed
- auth expired
- forbidden role
- invoice overdue

## MVP Flows

### Customer Admin

1. Accept invite
2. Log in
3. Create or update a site
4. Submit a mission plan request
5. Watch mission status move from `draft` or `planning` to `ready` or `failed`
6. Download artifacts when available
7. Review invoice state

### Internal Ops

1. Create an organization
2. Invite customer users
3. Review mission queue
4. Inspect artifact metadata and mission failures
5. Create or update manual invoices
6. Review audit events

## Launch Gates

- Invite-only auth works end to end
- Org/site isolation passes integration tests
- Site and mission workflows are usable by invited customers
- Artifacts stay behind authenticated access
- Manual invoice workflow is usable by ops
- Audit events exist for auth, role, invite, invoice, and artifact publication actions
- Staging and production app/api paths are documented
- Android safety boundaries remain unchanged by web work

## Not In Scope

- PC native desktop packaging
- open self-serve signup
- hosted online checkout as a launch gate
- post-flight analytics portal
- mobile-first planner editing
- real-time flight control surface
- any server or web participation in the active control loop

## Acceptance Checks

- An invited `customer_admin` can create a site and submit a mission request without ops-side database edits.
- A `customer_viewer` can inspect missions, artifacts, and invoices but cannot mutate them.
- An `ops` user can create invoices and inspect failures without seeing cross-org data leakage.
- A `platform_admin` can manage orgs and invites and can review audit events for sensitive actions.
- Loss of web app or API availability does not change Android in-flight behavior.
