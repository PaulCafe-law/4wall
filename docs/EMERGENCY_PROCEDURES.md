# Emergency Procedures

## Operator Priority Order

1. Maintain VLOS and aircraft awareness.
2. Read the app's `why stopped` message.
3. Choose only one of: `Resume`, `RTH`, `Takeover`.
4. Do not attempt to improvise a fourth mode.

## Immediate Response Table

- GPS weak
  - Expected app action: `HOLD`
  - Operator action: wait for recovery; if not stable, choose `RTH` or `Takeover`

- GPS lost
  - Expected app action: `HOLD`
  - Operator action: do not resume until GPS is clearly safe again

- RC signal degraded or lost
  - Expected app action: `HOLD`
  - Operator action: prioritize restoring link; if link is unstable, end the segment safely

- Battery critical
  - Expected app action: `RTH`
  - Operator action: confirm return path and landing area remain clear

- Frame stream dropped
  - Expected app action: `HOLD`
  - Operator action: do not resume autonomy until stream health is restored

- Semantic timeout / branch uncertainty
  - Expected app action: `HOLD`
  - Operator action: manually confirm route or terminate the segment

- Obstacle hard stop
  - Expected app action: `HOLD`
  - Operator action: treat as real until proven otherwise; do not force resume blindly

- App health bad or device health blocking
  - Expected app action: `HOLD`
  - Operator action: prefer `Takeover` or end the mission

## After-Action Requirements

- Export incident report
- Preserve blackbox log
- Record mission ID, flight ID, and observed outcome
- Do not resume testing until the cause is understood
