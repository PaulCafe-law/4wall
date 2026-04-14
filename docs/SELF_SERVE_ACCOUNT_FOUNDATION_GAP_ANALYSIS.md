# Self-Serve Account Foundation Gap Analysis

## Goal

Move the web product from pure invite-only onboarding to a hybrid model:

- invite flow stays available for internal-managed enterprise onboarding
- self-serve signup becomes available for new contractor organizations

This is a web/planner-only change. It does not change Android ownership of the
flight-critical runtime.

## Current State

- `web-app` supports `login` and `invite accept`
- `planner-server` supports:
  - web session login / refresh / logout
  - invite issue / accept / revoke
  - org-scoped reads and writes after membership exists
- there is no customer self-serve path to:
  - create a user account
  - create an organization
  - land as `customer_admin` without internal intervention

## Target

Add a first-party self-serve signup flow that lets a new customer:

1. create an account
2. create a new organization
3. become the initial `customer_admin`
4. receive a web session immediately
5. continue into the existing customer workspace without ops-side DB edits

## Required Changes

### Backend

- add a web signup request DTO
- add `POST /v1/web/session/signup`
- create:
  - `UserAccount`
  - `Organization`
  - `OrganizationMembership(role=customer_admin)`
- issue access + refresh session on success
- enforce:
  - browser origin checks
  - rate limiting
  - unique email
  - unique organization slug
- audit:
  - `web.signup_succeeded`
  - `organization.created`

### Frontend

- add a signup page
- add `api.signup(...)`
- add `auth.signup(...)`
- link login and signup flows together
- keep invite accept separate from self-serve signup

### Docs

- update `web-beta-scope.md` from invite-only to hybrid access model
- update README product position and current status

## Risks If Skipped

- customer onboarding stays dependent on internal staff
- the product cannot become a real SaaS entrypoint
- invite-only beta assumptions leak into the full-product roadmap

## Explicit Boundaries

- no email verification in this batch
- no password reset in this batch
- no hosted billing integration in this batch
- no change to internal-only `Live Ops` trust boundary
- no Android work in this thread

## Acceptance

- a new email can self-serve sign up and create an organization
- the first membership is `customer_admin`
- duplicate email is rejected
- duplicate organization slug is rejected
- signup respects origin checks and rate limits
- existing invite flow still works
