# Organization Access Management Gap Analysis

## Goal

Finish the Phase 1 customer self-service surface for organization administration.

After self-serve signup exists, the next blocking gap is that a `customer_admin` can create invites but still cannot fully manage:

- organization display name
- existing member roles
- membership activation state

That keeps basic tenant administration dependent on internal support.

## Current State

The current product already supports:

- self-serve signup for a new organization
- invite creation and invite revocation
- team detail reads for a customer's own organization
- internal cross-tenant organization reads and support access

The remaining gap is that `Team` is still invite-heavy and not yet a full organization access workspace.

## Required Outcome

`customer_admin` must be able to manage their own organization from the `Team` page without direct database edits or internal intervention.

That includes:

- updating the organization display name
- seeing a full member roster with name, email, role, and active state
- promoting or demoting members between `customer_admin` and `customer_viewer`
- deactivating and reactivating memberships
- continuing to manage pending invites

## Safety and Trust Boundary

This work stays entirely inside the web/planner boundary.

- no Android implementation changes
- no flight-control changes
- no server-issued stick control
- no change to cross-thread live-ops contracts

The main safety invariant in this batch is tenant recoverability:

- every organization must retain at least one active `customer_admin`

If a mutation would remove the last active customer admin, the backend must reject it.

## Backend Gaps

- `OrganizationDetailDto` only returns membership skeleton data, not actual member identity fields
- organization updates are still internal-only
- membership updates do not protect the last active customer admin
- org member management allows too little customer self-service and too much ambiguity in role handling

## Frontend Gaps

- `TeamPage` is centered on invite creation, not organization administration
- customers cannot edit organization settings
- customers cannot see member names or email addresses
- customers cannot change member role or active state
- viewer and admin behavior are not clearly separated on the member-management surface

## Acceptance

This batch is complete when:

- `customer_admin` can update their own organization name
- `customer_admin` can inspect member name, email, role, and active state
- `customer_admin` can change member role and membership active state
- the backend rejects removal of the last active customer admin
- `customer_viewer` remains read-only
- internal users still retain cross-tenant support access without changing the customer-first information architecture
