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
- The demo assistant uses its own session without a Jingcheng organization ID.
  LINE jobs bound to Jingcheng therefore cannot select the demo snapshot.
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

## Acceptance

- A customer-only account cannot open `/demo-factory`.
- Switching among all four scenarios deterministically reseeds entities and the
  simulated daily brief.
- Asking about AMRs in the demo returns simulated AMR state with a simulation
  label; asking from Jingcheng live mode still reports that no live AMR feed is
  connected.
- Asking for today's reconciliation in the demo uses simulated figures and does
  not query or quote the production ledger.
- Jingcheng cameras remain visible as live evidence, while their OCR, gauges, and
  person observations are absent from the demo assistant snapshot.
- Existing Jingcheng live-only behavior and customer navigation remain unchanged.
