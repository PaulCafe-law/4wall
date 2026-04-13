# Desktop Web Beta Gap Analysis

| Area | Current State | Target | Gap | Risk If Skipped | Owner | Sprint | Gate |
|---|---|---|---|---|---|---|---|
| Governance | No web beta scope, threat model, or deploy topology docs | Stage 0 docs define scope, trust boundaries, and rollout rules | Foundational product and security docs are missing | Team starts building without fixed boundaries | Docs | 0 | Stage 0 |
| Web app shell | No `web-app/` directory or frontend stack | Desktop-first single app with role-aware navigation | Entire frontend stack is absent | No customer or ops beta surface exists | Frontend | 2, 3 | Sprint 3 |
| Org and site model | Planner server knows operators and missions only | Organizations, memberships, invites, and sites exist | Multi-tenant data model is missing | Customer access cannot be safely scoped | Backend | 2 | Sprint 2 |
| Session design | Android bearer JWT flow only | Web login uses short-lived access token plus HttpOnly refresh cookie | Browser-safe auth path does not exist | Token handling becomes insecure or brittle | Backend | 2 | Sprint 2 |
| Invite-only onboarding | No invite issue, accept, revoke, or resend flow | Internal ops can invite users and invited users can accept | Beta access model is missing | Customer onboarding stays manual and error-prone | Backend, Frontend | 2, 3 | Sprint 3 |
| Site and mission UX | API-first planning only | Site CRUD, mission request, mission detail, and artifact panels | No user-facing planning workflow exists | Planning remains internal-only and unusable for customers | Frontend, Backend | 3 | Sprint 3 |
| Customer landing and team UX | Shell and data APIs exist, but the customer starting point and team view are incomplete | Customer lands on an overview page and can inspect current-team members and pending invites | Navigation and team management flow are not fully connected for invited customer roles | Customers start in the wrong place and cannot self-serve basic team coordination | Frontend, Backend | 3 | Sprint 3 |
| Billing | No invoice model or operator workflow | Manual invoice records with due dates, notes, receipt references, and status transitions | Billing workflow is absent | Beta cannot operate commercially | Backend, Frontend | 3 | Sprint 3 |
| Audit | No audit event model for web/admin actions | Sensitive auth, invite, role, invoice, and artifact actions are logged | No audit trail exists for support or security review | Investigation and compliance are weak | Backend | 2, 3 | Sprint 3 |
| Artifact access | Authenticated download endpoints exist for Android-style clients | Tenant-aware artifact access and mission visibility rules | Authorization rules are not yet org-aware | Cross-org artifact leakage is possible | Backend | 2, 3 | Sprint 3 |
| CI/CD | Only planner-server test workflow exists | Backend and web build/test smoke checks gate deploys | Web path has no CI coverage | Regressions ship without detection | Platform | 2, 3 | Release |
| Deploy topology | API Render config exists, web deploy path absent | Render static site plus app/api staging and prod topology | Web deploy, domain, and canary path are undefined | Launch and rollback are ad hoc | Platform | 2, 3 | Release |
| Security review | No web-specific threat model or org-isolation checklist | Threat model, rate limit, CSRF/origin, and IDOR controls are documented and tested | Launch gates for the new trust boundary are incomplete | Security issues arrive late in implementation | Security, Backend | 0, 2, 3 | Stage 0, Release |

## First-Pass Owners

- Docs: scope, deploy, threat model, acceptance docs
- Backend: tenancy, auth, invite, billing, audit, artifact authorization
- Frontend: web app shell, flows, role-aware navigation, state handling
- Platform: Render topology, CI, smoke checks, domain contract
- Security: org isolation, auth abuse controls, artifact protection review

## Implementation Notes

- Keep Android and flight-critical logic out of this sprint.
- Reuse existing planner-server planning and artifact services instead of creating a second backend.
- Treat manual invoices as the only billing path required for beta launch.
- Design for `app.<domain>` and `api.<domain>` from day one so web session cookies remain same-site.

## Product Gaps After Beta RC

The beta now proves the deploy path, auth model, mission flow, and output delivery. The remaining product gaps are customer-experience gaps, not platform-foundation gaps.

| Area | Current State | Target | Remaining Gap | Risk If Skipped |
|---|---|---|---|---|
| Customer landing | Users currently land in task-first pages | A true customer overview shows today's work, recent outputs, and overdue items | No clear "what should I do next?" home screen exists | New users feel dropped into raw lists instead of a product |
| Team management | Internal org tools exist; customer-facing team controls are limited | Customers manage invites and understand their team state without ops intervention | Team workflow is still too internal and too low-context | Customers stay dependent on ops for routine account changes |
| Output experience | Outputs are available inside mission detail | Output delivery feels like a customer handoff surface, not a debug panel | Outputs are discoverable but not yet highlighted as core value | Customers may miss or underuse delivered mission bundles |
| Support queue | Audit and mission detail exist | Internal users see a dedicated support queue for failed or stalled work | Exception handling is still spread across lists and logs | Support work stays slower and less consistent |
| Status feedback | Statuses exist in raw lists and details | Customers see visible pending items, exceptions, and overdue reminders | There is no cohesive reminder model yet | Customers do not know what needs attention without digging |
| Billing delivery | Manual invoice records work | Billing feels like an account workspace, not a backend record list | Payment context and customer-facing framing remain thin | Commercial readiness feels incomplete despite working data paths |
