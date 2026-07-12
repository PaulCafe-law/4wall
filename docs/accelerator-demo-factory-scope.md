# 4WALL Accelerator Demo Factory

## Goal

Create an internal-only presentation workspace for accelerator demos. The operator
controls the projected screen. Jingcheng has approved showing its camera evidence,
but simulated operating data must never be presented as Jingcheng production data.

## Data Boundaries

- `/demo-factory` is available only to `platform_admin` and `ops` users.
- The 3D machines, named people, AMRs, production counts, OEE, alarms, and
  plan-versus-actual figures are simulated.
- Jingcheng cameras remain read-only proof that the platform can receive current
  field evidence. They are labelled as authorized live images.
- Camera OCR, gauges, detected people, and decision-ledger data are excluded from
  the demo assistant snapshot.
- Twin snapshots have an explicit scope: `organization_live`, `web_only`, or
  `accelerator_demo`. Only authenticated web demo sessions may create Twin Agent
  jobs; LINE never selects any snapshot or creates a job.
- The demo assistant uses its own `accelerator_demo` session without a Jingcheng
  organization ID.
- Every cloud or local assistant answer in this workspace begins with
  `模擬情境：`.

## Presentation Scenarios

The demo starts from a deterministic scenario and can be reset without reloading.

1. `normal`: production is broadly on plan; AMRs are available.
2. `machine_alarm`: HC600-03 is in alarm and maintenance dispatch is needed.
3. `amr_delay`: material delivery is delayed and HC600-04 is at risk.
4. `plan_gap`: several simulated machines are behind plan for the daily brief.

Each scenario owns its simulated plan and actual quantities. The assistant reads
those values from `world.simulationContext`, never from the production decision
ledger.

## User Experience

- The page name is `4WALL 展示工廠`, not Jingcheng Factory Twin.
- A persistent banner states that operating figures are simulated.
- A separate status line identifies Jingcheng camera evidence as authorized live
  imagery and shows freshness without merging it into simulated KPIs.
- The scenario selector, speed controls, and reset command stay visible in the
  simulation console.
- Suggested questions cover AMR status, plan-versus-actual, machine alarms, and
  dispatch.

## LINE Exclusion

- External LINE text is handled only by deterministic, allowlisted factory intents
  or the fixed help response.
- `展示工廠：` has no privileged meaning and never creates a Twin Agent job.
- Demo snapshots, commands, simulated AMRs, and production ledger context never
  cross into the LINE route.

## Acceptance

- A customer-only account cannot open `/demo-factory`.
- Switching among all four scenarios deterministically reseeds entities and the
  simulated daily brief.
- Asking about AMRs in the authenticated web demo returns simulated AMR state with
  a simulation label.
- Asking for today's reconciliation in the demo uses simulated figures and does
  not query or quote the production ledger.
- Jingcheng cameras remain visible as live evidence, while their OCR, gauges, and
  person observations are absent from the demo assistant snapshot.
- Existing Jingcheng live-only behavior and customer navigation remain unchanged.
- LINE inputs, including `展示工廠：現在 AMR 情況`, create zero Twin Agent jobs and
  cannot select `organization_live`, `web_only`, or `accelerator_demo` snapshots.
