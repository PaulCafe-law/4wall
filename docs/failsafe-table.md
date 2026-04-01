# Failsafe Table

| Trigger | Detection Source | Immediate Action | Next Step | Operator UI |
|---|---|---|---|---|
| Semantic timeout | mobile perception deadline | `HOLD` | operator resume or takeover | `Branch confirmation timed out. Aircraft holding.` |
| Branch unknown | perception result | `HOLD` | retry or takeover | `Route branch unknown. Confirm manually.` |
| Frame stream dropped | camera stream health | `HOLD` | restore stream or takeover | `Camera stream lost. Hold engaged.` |
| Obstacle warn | local avoider input | `SLOW_DOWN` or bounded nudge | return to `TRANSIT` if clear | `Obstacle nearby. Speed reduced.` |
| Obstacle hard stop | local avoider input | `HOLD` | operator decides | `Obstacle too close. Aircraft holding.` |
| Corridor deviation warn | tracker | remain in state with warning | continue monitoring | `Leaving corridor margin.` |
| Corridor deviation hard | tracker | `HOLD` | operator assess / RTH | `Corridor exceeded. Hold engaged.` |
| Battery critical | telemetry | `RTH` | `LANDING` | `Battery critical. Returning home.` |
| GPS lost | DJI telemetry | `HOLD` and inhibit autonomy progression | operator takeover or recover | `Position source degraded.` |
| App health bad | watchdog | `HOLD` or `ABORTED` if unsafe | takeover | `App health degraded. Manual control advised.` |
| User hold requested | operator | `HOLD` | resume / RTH / takeover | `Hold requested by operator.` |
| User RTH requested | operator | `RTH` | `LANDING` | `Return-to-home requested.` |
| User takeover requested | operator | `MANUAL_OVERRIDE` | manual flight | `Manual override active.` |

## Policy Notes

- `HOLD` is the default uncertainty sink
- `RTH` is reserved for critical energy state or explicit operator command
- No automatic recovery from `MANUAL_OVERRIDE`
- No server dependency exists in this table
