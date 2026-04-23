# Deferred Work

These items were intentionally deferred from the desktop web beta launch so the first release can stay invite-only, tenancy-safe, and operationally usable.

## WEB-BETA-001 Hosted Online Checkout Provider Integration

- **What:** Add a provider-backed online checkout flow and payment callback handling.
- **Why:** Customers may eventually expect self-serve card payment instead of manual invoice and remittance.
- **Pros:** Faster self-serve collection, less manual ops load, clearer subscription path.
- **Cons:** Adds PSP selection risk, tax and invoice integration work, webhook security, and support burden.
- **Context:** Beta launch is manual-invoice-first because the legal and operational path is more reliable for a Taiwan-first rollout.
- **Depends on / blocked by:** Stable invoice model, provider selection, invoice and receipt policy, security review.

## WEB-BETA-002 Open Self-Serve Signup and Org Provisioning

- **What:** Allow users to create accounts and organizations without an invite.
- **Why:** This is the obvious path once the product moves beyond curated beta customers.
- **Pros:** Higher top-of-funnel volume, less manual ops provisioning, easier trials.
- **Cons:** Requires abuse controls, org verification, onboarding UX, and stronger billing automation.
- **Context:** The launch beta is invite-only so support and security load stay bounded while tenancy hardens.
- **Depends on / blocked by:** Invite flow stability, rate limiting, billing automation, support process.

## WEB-BETA-003 Post-Flight Analytics Portal

- **What:** Add a richer analytics and reporting surface beyond mission status, artifacts, and audit-grade event views.
- **Why:** Customers will eventually want longitudinal visibility and reporting, not just per-mission operations.
- **Pros:** Higher product value, stickier retention, better internal support tooling.
- **Cons:** Expands data modeling, storage costs, privacy review, and UI surface area.
- **Context:** Current beta only needs mission status, artifacts, invoices, and auditability. Full analytics is not on the critical path.
- **Depends on / blocked by:** Reliable event and telemetry ingestion, storage retention policy, reporting design.

## WEB-BETA-004 Mobile-Friendly Planner Editing

- **What:** Make the planner workspace usable on small screens and touch-first browsers.
- **Why:** Field teams may eventually want lightweight mission inspection or note-taking away from a desktop.
- **Pros:** More flexible field access, easier support from tablets or phones.
- **Cons:** High design and interaction cost for a map-first dense interface.
- **Context:** Beta explicitly supports desktop first and only limited tablet viewing. Mobile editing is deliberately out.
- **Depends on / blocked by:** Stable desktop IA, map interaction patterns, design review.

## WEB-BETA-005 Deeper Team Permission Matrix

- **What:** Expand from four fixed roles to custom permissions or more granular scoped roles.
- **Why:** Larger customers will eventually need finer separation of billing, planning, and read-only support access.
- **Pros:** Better enterprise fit, fewer support exceptions, cleaner least-privilege posture.
- **Cons:** More complex RBAC, migration risk, more edge cases in UI and API checks.
- **Context:** Beta keeps four fixed roles to make authorization auditable and testable.
- **Depends on / blocked by:** Stable org model, audit log coverage, usage learnings from beta customers.
