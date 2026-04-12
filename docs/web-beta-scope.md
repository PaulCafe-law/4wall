# Desktop Web Beta Scope

## Objective

Ship a desktop-first web platform that gives invited construction customers and internal operations teams a shared place to:

- manage sites
- submit mission requests
- inspect mission status and outputs
- track manual invoices
- review operational history

This surface is never flight-critical. Android remains the only flight-critical runtime.

## Product Position

- Product stance: customer-first, admin-extended
- External audience: invited contractor staff
- Internal audience: `platform_admin` and `ops`
- Not a developer console
- Not a flight control surface

### External Promise

The web app is the place where customers manage sites, request work, review outputs, and track billing.

### Internal Promise

Internal users work inside the same shell, but see additional organization, support, and audit capabilities for cross-customer assistance.

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

- `總覽`
- `場址`
- `任務`
- `帳務`
- `團隊`

### Internal Navigation

- `組織`
- `支援佇列`
- `稽核記錄`
- plus all customer-visible sections when assisting a customer

### Primary CTA

- `新增任務請求`

`規劃器` remains available at `/missions/new`, but it is not a top-level navigation item.

## MVP Screens

- Invite acceptance
- Login
- Session restore / auth expiry handling
- Customer overview
- Site list
- Site detail
- Mission list
- Mission detail
- Mission request workspace
- Billing / invoices
- Customer team / pending invites
- Internal organization admin
- Internal support queue
- Internal audit log

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
3. Review overview and pending items
4. Create or update a site
5. Submit a mission request
6. Watch mission status move from `planning` to `ready` or `failed`
7. Open mission detail and download outputs
8. Review invoice state
9. Manage pending invites for their organization

### Customer Viewer

1. Accept invite
2. Log in
3. Review overview, missions, outputs, and billing
4. Read team state without mutation access

### Internal Ops

1. Create or manage organizations
2. Invite customer users
3. Review support queue
4. Inspect mission failures and output availability
5. Create or update manual invoices
6. Review audit events

## Launch Gates

- Invite-only auth works end to end
- Org/site isolation passes integration tests
- Customer users can complete the site -> mission -> output flow without ops-side DB edits
- Outputs stay behind authenticated access
- Manual invoice workflow is usable by internal users
- Audit events exist for auth, role, invite, invoice, and output publication actions
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
- developer-only diagnostics as the product's primary surface

## Acceptance Checks

- An invited `customer_admin` can create a site and submit a mission request without ops-side database edits.
- A `customer_viewer` can inspect missions, outputs, billing, and team state but cannot mutate them.
- An `ops` user can review support cases and invoices without losing customer isolation guarantees.
- A `platform_admin` can manage organizations and invites and can review audit events for sensitive actions.
- Loss of web app or API availability does not change Android in-flight behavior.
