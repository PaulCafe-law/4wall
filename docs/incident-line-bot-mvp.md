# Incident Loop and LINE Bot MVP

## Scope

This sprint adds an incident closed-loop workflow for the web operations surface
and planner server. It does not modify Android and does not move the web app or
planner server into the flight-critical loop.

Allowed surfaces:

- `planner-server/`
- `web-app/`
- `docs/`
- deploy environment documentation and `render.yaml`

Out of scope:

- Android flight runtime changes
- Server-issued flight or stick commands
- Background scheduler automation for daily LINE summaries
- 3D scene mutation; this MVP only reserves location/object fields

## Product Loop

The MVP closes the operational loop:

1. AI or a human reports an anomaly.
2. The web app creates an incident.
3. A human confirms, rejects, assigns, comments, and resolves it.
4. The planner server records every action in history and audit records.
5. High-risk and lifecycle events can be pushed to a LINE group through the
   Messaging API.
6. LINE postbacks can update incident state through the backend webhook.
7. Daily summaries can be generated and pushed manually or by a future scheduler.

## Architecture

Incidents are first-class planner-server records scoped by organization and
optionally linked to a site. Evidence, comments, history, LINE notifications, and
LINE webhook events are separate tables so future database-backed retention and
audit rules can be added without changing the web contract.

The web app talks only to `/v1` planner-server APIs. It does not store incident
state locally except React Query cache state.

LINE secrets stay in the planner server:

- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_CHANNEL_SECRET`
- `LINE_WEBHOOK_ENABLED`
- `LINE_DEFAULT_GROUP_ID`
- `LINE_INCIDENT_NOTIFY_ENABLED`

If required LINE environment variables are missing, incident workflows continue
and the notification attempt is recorded as failed/no-op. The browser never sees
LINE credentials.

## Safety Boundaries

- Incident state is operational metadata, not an aircraft command channel.
- LINE postback actions can change incident workflow state only.
- Web and LINE actions cannot pause, resume, hold, RTH, launch, or steer an
  aircraft.
- 3D fields are stored as metadata for future visualization only.

## Gaps Remaining After MVP

- A backend scheduler or Render Cron must call the daily summary push endpoint.
- LINE group/user target management is still environment driven.
- Incident evidence upload stores links/text metadata only; binary upload can be
  added later through the existing artifact storage boundary.
- 3D viewer integration is a disabled placeholder until a field model viewer is
  available.

## LINE Setup

Render API services need these environment variables:

- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_CHANNEL_SECRET`
- `LINE_WEBHOOK_ENABLED=true`
- `LINE_DEFAULT_GROUP_ID`
- `LINE_INCIDENT_NOTIFY_ENABLED=true`

Webhook URL:

- staging: `https://four-wall-api-staging.onrender.com/v1/line/webhook`
- production: `https://four-wall-api.onrender.com/v1/line/webhook`

The LINE Official Account must be invited to the target group before push
messages can reach `LINE_DEFAULT_GROUP_ID`. Use the webhook event source payload
from a group postback/message to identify the `groupId`.

If LINE env vars are missing or disabled, the incident API still works, and the
notification record stores a disabled or failed status for operations review.
