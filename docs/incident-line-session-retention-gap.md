# Incident LINE flow and web session retention gap

## Scope

This sprint stays inside Sprint 2 boundaries: `planner-server/`, `web-app/`, `docs/`, and deploy/runtime verification. It does not change `android-app/`, flight runtime, route execution, waypoint/KMZ behavior, or any server-issued flight control path.

## Current gaps

- LINE staging is configured and can push to the target group, but the incident loop still needs an end-to-end staging smoke run that creates an incident, advances the closure workflow, and confirms notification records are sent.
- The web app restores sessions from the HTTP-only refresh cookie only on initial page load. If an access token expires while the tab stays open, `useAuthedQuery` / `useAuthedMutation` currently marks the session expired immediately on `401` instead of refreshing and retrying.
- The backend already has refresh-token rotation and logout revocation. The frontend should use that boundary: keep users signed in while the refresh cookie remains valid, and require login only after explicit logout or refresh-cookie expiry/revocation.

## Approach

- Validate the live incident + LINE loop on staging through existing backend services and Render runtime settings.
- Add a frontend `refreshSession` capability to `AuthProvider`.
- On authenticated query/mutation `401`, refresh the session once, retry the original request with the new token, and expire only if refresh fails.
- Schedule proactive refresh before the current access token expires to reduce user-visible interruptions.

## Safety

- Refresh token remains HTTP-only and server-managed; no refresh token is exposed to JavaScript.
- Explicit logout still calls the server logout endpoint and clears the refresh cookie.
- If refresh fails because the cookie is missing, expired, or revoked, the app still falls back to the login flow.
