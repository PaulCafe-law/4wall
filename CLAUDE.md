## Read AGENTS.md First

- `AGENTS.md` is the single source of truth for repo policy.
- If `CLAUDE.md` conflicts with `AGENTS.md`, `AGENTS.md` wins.
- `CLAUDE.md` exists only for tool compatibility and entrypoint hints.
- Read `AGENTS.md` before using any guidance in this file.

## Skill Routing

When the user's request matches an available skill, invoke it first instead of improvising.

Key routing rules:

- Product ideas or scope changes: `office-hours`
- Bugs, regressions, flaky tests, or unexpected behavior: `investigate`
- Ship, deploy, push, create PR: `ship`
- QA or bug sweeps: `qa`
- Code review or diff review: `review`
- Documentation sync after shipping: `document-release`
- Design system work: `design-consultation`
- Design critique before implementation: `plan-design-review`
- Architecture and execution review: `plan-eng-review`
- Deploy setup and rollout config: `setup-deploy`
- Security review before backend or deploy changes ship: `cso`

## Design Pointer

- Read `DESIGN.md` before making UI decisions.
- `DESIGN.md` owns typography, color, spacing, layout, and interaction tone.
- Do not restate or fork design policy in `CLAUDE.md`.

## Deploy Configuration

- Platform: Render
- Production URL: `https://app.<domain>` and `https://api.<domain>`
- Staging URL: `https://staging-app.<domain>` and `https://staging-api.<domain>`
- Deploy workflow: Render auto-deploy after CI passes
- Deploy status command: `TBD by /setup-deploy`
- Merge method: squash
- Project type: Android app + planner API + desktop web app
- Post-deploy health check: `GET /healthz` on API, login + mission list smoke checks on web

- Pre-merge: backend tests, web build/tests, org-isolation checks, artifact auth checks
- Deploy trigger: automatic on push to the production branch
- Deploy status: poll Render service status and production endpoints
- Health check: `https://api.<domain>/healthz`
