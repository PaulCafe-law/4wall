# Auth

## Model

The beta backend uses local operator accounts with JWT access and refresh tokens.

- access token: short-lived bearer token for API calls
- refresh token: stored and rotated server-side
- artifact endpoints: authenticated, not signed

## Endpoints

- `POST /v1/auth/login`
- `POST /v1/auth/refresh`
- `GET /v1/auth/me`

## Token Behavior

- access token TTL defaults to 15 minutes
- refresh token TTL defaults to 7 days
- refresh rotation revokes the previous refresh token record
- inactive operators are rejected even with a structurally valid token

## Bootstrap Operator

Development can seed a bootstrap operator from environment variables:

- `BUILDING_ROUTE_BOOTSTRAP_OPERATOR_ENABLED`
- `BUILDING_ROUTE_BOOTSTRAP_OPERATOR_USERNAME`
- `BUILDING_ROUTE_BOOTSTRAP_OPERATOR_PASSWORD`
- `BUILDING_ROUTE_BOOTSTRAP_OPERATOR_DISPLAY_NAME`

This is for local/dev only. Production beta should disable it and provision operators out of band.

## Security Notes

- change `BUILDING_ROUTE_AUTH_SECRET_KEY` before any shared or deployed environment
- use a key at least 32 bytes long
- artifact access is intentionally protected by bearer auth in beta, which keeps Android download logic simple
